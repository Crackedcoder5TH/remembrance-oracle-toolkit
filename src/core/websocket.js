'use strict';

const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-5AB5DC11AD48';

const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xA;

/**
 * Minimal RFC 6455 WebSocket server using only Node.js built-in modules.
 */
class WebSocketServer {
  constructor(httpServer) {
    this.clients = new Set();
    this._listeners = { connection: [], message: [], close: [], error: [] };

    httpServer.on('upgrade', (req, socket, head) => {
      this._handleUpgrade(req, socket, head);
    });
  }

  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback);
    }
  }

  _emit(event, ...args) {
    const handlers = this._listeners[event];
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (err) {
          if (event !== 'error') {
            this._emit('error', err);
          }
        }
      }
    }
  }

  /**
   * Perform the WebSocket opening handshake (RFC 6455 Section 4.2).
   */
  _handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n');

    socket.write(responseHeaders);
    this.clients.add(socket);
    this._emit('connection', socket);

    let buffer = Buffer.alloc(0);
    if (head && head.length > 0) {
      buffer = Buffer.from(head);
    }

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this._processBuffer(buffer, socket);
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this._emit('close', socket);
    });

    socket.on('error', (err) => {
      this.clients.delete(socket);
      this._emit('error', err, socket);
    });
  }

  /**
   * Consume as many complete frames as possible from the buffer.
   * Returns the remaining unconsumed bytes.
   */
  _processBuffer(buffer, socket) {
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];

      const opcode = firstByte & 0x0F;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7F;

      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) return buffer; // need more data
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        // 8-byte extended length — we only support up to 65535 but handle the framing
        if (buffer.length < 10) return buffer;
        // Read as two 32-bit values; high bits should be 0 for reasonable payloads
        const high = buffer.readUInt32BE(2);
        const low = buffer.readUInt32BE(6);
        if (high !== 0) {
          // Payload too large — close the connection
          this._sendClose(socket, 1009);
          socket.destroy();
          return Buffer.alloc(0);
        }
        payloadLength = low;
        offset = 10;
      }

      const maskSize = isMasked ? 4 : 0;
      const totalFrameSize = offset + maskSize + payloadLength;

      if (buffer.length < totalFrameSize) return buffer; // need more data

      let maskKey = null;
      if (isMasked) {
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      let payload = buffer.subarray(offset, offset + payloadLength);

      if (isMasked && maskKey) {
        payload = Buffer.from(payload); // copy so we can mutate
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i & 3];
        }
      }

      // Advance buffer past this frame
      buffer = buffer.subarray(totalFrameSize);

      // Handle the frame by opcode
      switch (opcode) {
        case OPCODE_TEXT: {
          const message = payload.toString('utf8');
          this._emit('message', message, socket);
          break;
        }
        case OPCODE_PING: {
          // Respond with pong carrying the same payload
          this._sendFrame(socket, OPCODE_PONG, payload);
          break;
        }
        case OPCODE_PONG: {
          // Unsolicited pong — ignore per RFC 6455
          break;
        }
        case OPCODE_CLOSE: {
          // Echo the close frame back, then close
          this._sendFrame(socket, OPCODE_CLOSE, payload);
          this.clients.delete(socket);
          socket.end();
          this._emit('close', socket);
          return Buffer.alloc(0);
        }
        default:
          // Unknown opcode — ignore
          break;
      }
    }

    return buffer;
  }

  /**
   * Encode and send a single WebSocket frame (server→client, unmasked).
   * Supports payloads up to 65535 bytes.
   */
  _sendFrame(socket, opcode, data) {
    if (socket.destroyed) return;

    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const length = payload.length;

    let header;
    if (length < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = length;
    } else if (length <= 65535) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      // For payloads > 65535, use 8-byte extended length
      header = Buffer.allocUnsafe(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);        // high 32 bits
      header.writeUInt32BE(length, 6);   // low 32 bits
    }

    socket.write(Buffer.concat([header, payload]));
  }

  /**
   * Send a close frame with a status code.
   */
  _sendClose(socket, code) {
    const payload = Buffer.allocUnsafe(2);
    payload.writeUInt16BE(code, 0);
    this._sendFrame(socket, OPCODE_CLOSE, payload);
  }

  /**
   * Send a text message to a single client.
   */
  send(socket, data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    this._sendFrame(socket, OPCODE_TEXT, text);
  }

  /**
   * Broadcast a message to all connected clients as JSON.
   */
  broadcast(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    for (const client of this.clients) {
      this._sendFrame(client, OPCODE_TEXT, text);
    }
  }
}

module.exports = { WebSocketServer };
