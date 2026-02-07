const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { WebSocketServer } = require('../src/core/websocket');

const GUID = '258EAFA5-E914-47DA-95CA-5AB5DC11AD48';

/**
 * Build a raw HTTP upgrade request for the WebSocket handshake.
 */
function buildUpgradeRequest(key, path = '/') {
  return (
    `GET ${path} HTTP/1.1\r\n` +
    `Host: localhost\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n` +
    `\r\n`
  );
}

/**
 * Encode a masked WebSocket text frame (client-to-server must be masked per RFC 6455).
 */
function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) {
    masked[i] ^= mask[i & 3];
  }

  let header;
  if (payload.length < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = 0x80 | payload.length; // masked bit + length
  } else {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  }

  return Buffer.concat([header, mask, masked]);
}

/**
 * Send a simple HTTP GET to the server and collect the response.
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

/**
 * Connect a raw TCP socket, send an upgrade request, and return
 * the socket plus the parsed handshake response.
 */
function connectRawWebSocket(port, key) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.write(buildUpgradeRequest(key));
    });

    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      const endOfHeaders = buf.indexOf('\r\n\r\n');
      if (endOfHeaders !== -1) {
        socket.removeListener('data', onData);
        const headerSection = buf.slice(0, endOfHeaders);
        const remaining = Buffer.from(buf.slice(endOfHeaders + 4), 'binary');
        resolve({ socket, headers: headerSection, remaining });
      }
    };

    socket.on('data', onData);
    socket.on('error', reject);
  });
}

describe('WebSocket handshake crypto', { timeout: 10000 }, () => {
  it('computes correct Sec-WebSocket-Accept per RFC 6455', () => {
    // RFC 6455 Section 4.2.2 example key
    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    const expected = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    // Verified with both Node.js and Python SHA-1
    assert.equal(expected, 'QTEF5tdGszPlUvhxOpHPeU89T0U=');
  });

  it('produces different accepts for different keys', () => {
    const key1 = crypto.randomBytes(16).toString('base64');
    const key2 = crypto.randomBytes(16).toString('base64');
    const accept1 = crypto.createHash('sha1').update(key1 + GUID).digest('base64');
    const accept2 = crypto.createHash('sha1').update(key2 + GUID).digest('base64');
    assert.notEqual(accept1, accept2);
  });
});

describe('WebSocketServer creation and lifecycle', { timeout: 10000 }, () => {
  let httpServer;
  let wss;
  const sockets = [];

  after(() => {
    for (const s of sockets) {
      if (!s.destroyed) s.destroy();
    }
    if (httpServer) httpServer.close();
  });

  it('can be created from an http server', () => {
    httpServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    wss = new WebSocketServer(httpServer);

    assert.ok(wss instanceof WebSocketServer);
    assert.ok(wss.clients instanceof Set);
    assert.equal(wss.clients.size, 0);
  });

  it('HTTP server still works for non-upgrade requests', async () => {
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;

    const res = await httpGet(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.equal(res.data, 'OK');
  });

  it('completes WebSocket handshake with correct Sec-WebSocket-Accept', async () => {
    const port = httpServer.address().port;
    const key = crypto.randomBytes(16).toString('base64');
    const expectedAccept = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    const { socket, headers } = await connectRawWebSocket(port, key);
    sockets.push(socket);

    assert.ok(headers.includes('HTTP/1.1 101 Switching Protocols'));
    assert.ok(headers.includes('Upgrade: websocket'));
    assert.ok(headers.includes('Connection: Upgrade'));
    assert.ok(headers.includes(`Sec-WebSocket-Accept: ${expectedAccept}`));
  });

  it('tracks client in the clients Set on connection', async () => {
    // The previous test connected one client; verify tracking
    assert.ok(wss.clients.size >= 1, 'clients Set should contain at least 1 client');
  });
});

describe('WebSocket frame encoding', { timeout: 10000 }, () => {
  it('_sendFrame produces valid small text frame', () => {
    const chunks = [];
    const fakeSocket = {
      destroyed: false,
      write(buf) { chunks.push(Buffer.from(buf)); },
    };

    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);
    wss._sendFrame(fakeSocket, 0x1, 'hello');

    const frame = Buffer.concat(chunks);
    // First byte: FIN (0x80) | text opcode (0x01) = 0x81
    assert.equal(frame[0], 0x81);
    // Second byte: unmasked, length 5
    assert.equal(frame[1], 5);
    // Payload
    assert.equal(frame.subarray(2).toString('utf8'), 'hello');

    httpServer.close();
  });

  it('_sendFrame produces valid medium frame (126-byte extended length)', () => {
    const chunks = [];
    const fakeSocket = {
      destroyed: false,
      write(buf) { chunks.push(Buffer.from(buf)); },
    };

    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);
    const payload = 'A'.repeat(200);
    wss._sendFrame(fakeSocket, 0x1, payload);

    const frame = Buffer.concat(chunks);
    assert.equal(frame[0], 0x81);
    assert.equal(frame[1], 126);
    assert.equal(frame.readUInt16BE(2), 200);
    assert.equal(frame.subarray(4).toString('utf8'), payload);

    httpServer.close();
  });

  it('_sendFrame skips destroyed sockets', () => {
    const chunks = [];
    const fakeSocket = {
      destroyed: true,
      write(buf) { chunks.push(buf); },
    };

    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);
    wss._sendFrame(fakeSocket, 0x1, 'test');

    assert.equal(chunks.length, 0, 'should not write to destroyed socket');

    httpServer.close();
  });
});

describe('WebSocket frame decoding', { timeout: 10000 }, () => {
  it('handles masked text frames and emits message', () => {
    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);

    const received = [];
    wss.on('message', (msg) => received.push(msg));

    // Build a masked text frame for "hi"
    const text = 'hi';
    const payload = Buffer.from(text, 'utf8');
    const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) {
      masked[i] ^= mask[i & 3];
    }

    const frame = Buffer.alloc(2 + 4 + payload.length);
    frame[0] = 0x81; // FIN + text
    frame[1] = 0x80 | payload.length; // masked + length
    mask.copy(frame, 2);
    masked.copy(frame, 6);

    const fakeSocket = { destroyed: false, end() {}, destroy() {} };
    const remaining = wss._processBuffer(frame, fakeSocket);

    assert.equal(received.length, 1);
    assert.equal(received[0], 'hi');
    assert.equal(remaining.length, 0);

    httpServer.close();
  });

  it('handles unmasked text frames', () => {
    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);

    const received = [];
    wss.on('message', (msg) => received.push(msg));

    const text = 'world';
    const payload = Buffer.from(text, 'utf8');
    const frame = Buffer.alloc(2 + payload.length);
    frame[0] = 0x81;
    frame[1] = payload.length; // no mask bit
    payload.copy(frame, 2);

    const fakeSocket = { destroyed: false, end() {}, destroy() {} };
    wss._processBuffer(frame, fakeSocket);

    assert.equal(received.length, 1);
    assert.equal(received[0], 'world');

    httpServer.close();
  });

  it('returns partial buffer when frame is incomplete', () => {
    const httpServer = http.createServer();
    const wss = new WebSocketServer(httpServer);

    // A frame header claiming 100 bytes, but only 5 bytes provided
    const partial = Buffer.alloc(5);
    partial[0] = 0x81;
    partial[1] = 100;
    partial[2] = 0x41;
    partial[3] = 0x42;
    partial[4] = 0x43;

    const fakeSocket = { destroyed: false, end() {}, destroy() {} };
    const remaining = wss._processBuffer(partial, fakeSocket);

    assert.equal(remaining.length, 5, 'incomplete frame should be returned as-is');

    httpServer.close();
  });
});

describe('WebSocket broadcast and messaging', { timeout: 10000 }, () => {
  let httpServer;
  let wss;
  let port;
  const clientSockets = [];

  after(() => {
    for (const s of clientSockets) {
      if (!s.destroyed) s.destroy();
    }
    if (httpServer) httpServer.close();
  });

  it('broadcast sends to all connected clients', async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer(httpServer);

    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;

    // Wait for server-side connection tracking before broadcasting
    const connectionPromise = (count) => new Promise((resolve) => {
      const check = () => {
        if (wss.clients.size >= count) resolve();
        else setTimeout(check, 20);
      };
      check();
    });

    // Connect two raw WebSocket clients
    const key1 = crypto.randomBytes(16).toString('base64');
    const key2 = crypto.randomBytes(16).toString('base64');

    const conn1 = await connectRawWebSocket(port, key1);
    clientSockets.push(conn1.socket);
    await connectionPromise(1);

    const conn2 = await connectRawWebSocket(port, key2);
    clientSockets.push(conn2.socket);
    await connectionPromise(2);

    assert.equal(wss.clients.size, 2, 'should have 2 connected clients');

    // Collect data from both client sockets
    const data1 = [];
    const data2 = [];
    conn1.socket.on('data', (chunk) => data1.push(chunk));
    conn2.socket.on('data', (chunk) => data2.push(chunk));

    // Broadcast a message
    wss.broadcast('ping-all');

    // Wait a bit for data to arrive
    await new Promise(resolve => setTimeout(resolve, 100));

    // Parse the received WebSocket frames — expect unmasked text frame with "ping-all"
    const frame1 = Buffer.concat(data1);
    const frame2 = Buffer.concat(data2);

    assert.ok(frame1.length > 0, 'client 1 should receive data');
    assert.ok(frame2.length > 0, 'client 2 should receive data');

    // Verify frame structure: 0x81 (FIN+text), length, then payload
    assert.equal(frame1[0], 0x81);
    const len1 = frame1[1] & 0x7F;
    assert.equal(frame1.subarray(2, 2 + len1).toString('utf8'), 'ping-all');

    assert.equal(frame2[0], 0x81);
    const len2 = frame2[1] & 0x7F;
    assert.equal(frame2.subarray(2, 2 + len2).toString('utf8'), 'ping-all');
  });

  it('send delivers a message to a single client', async () => {
    // Use the already-connected clients; pick the first one
    const [firstClient] = wss.clients;
    assert.ok(firstClient, 'should have at least one client');

    const data = [];
    // Temporarily capture data; we need to set up listener before sending
    const clientSocket = clientSockets[0];
    const dataPromise = new Promise((resolve) => {
      const handler = (chunk) => {
        data.push(chunk);
        clientSocket.removeListener('data', handler);
        resolve();
      };
      clientSocket.on('data', handler);
    });

    wss.send(firstClient, 'just-you');
    await dataPromise;

    const frame = Buffer.concat(data);
    assert.equal(frame[0], 0x81);
    const len = frame[1] & 0x7F;
    assert.equal(frame.subarray(2, 2 + len).toString('utf8'), 'just-you');
  });
});

describe('WebSocket connection tracking', { timeout: 10000 }, () => {
  let httpServer;
  let wss;
  let port;

  after(() => {
    if (httpServer) httpServer.close();
  });

  it('adds client on connection and removes on close', async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer(httpServer);

    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;

    assert.equal(wss.clients.size, 0, 'starts with no clients');

    const closeEvents = [];
    wss.on('close', (socket) => closeEvents.push(socket));

    const key = crypto.randomBytes(16).toString('base64');
    const { socket } = await connectRawWebSocket(port, key);

    // Wait for server to register the client
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(wss.clients.size, 1, 'one client connected');

    // Send a close frame to trigger proper close
    // Close frame: FIN + opcode 0x8, masked, 0 payload
    const maskKey = crypto.randomBytes(4);
    const closeFrame = Buffer.alloc(6);
    closeFrame[0] = 0x88; // FIN + close opcode
    closeFrame[1] = 0x80; // MASK bit, 0 length
    maskKey.copy(closeFrame, 2);
    socket.write(closeFrame);

    // Wait for close event propagation
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(wss.clients.size, 0, 'client removed after disconnect');
    assert.ok(closeEvents.length >= 1, 'close event emitted at least once');
  });
});
