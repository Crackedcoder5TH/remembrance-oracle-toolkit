const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { serveFile, handleRequest, MIME_TYPES } = require('../site/server.js');

describe('Site Server', () => {
  describe('MIME_TYPES', () => {
    it('maps .html to text/html', () => {
      assert.ok(MIME_TYPES['.html'].startsWith('text/html'));
    });

    it('maps .css to text/css', () => {
      assert.ok(MIME_TYPES['.css'].startsWith('text/css'));
    });

    it('maps .js to application/javascript', () => {
      assert.ok(MIME_TYPES['.js'].startsWith('application/javascript'));
    });

    it('maps .json to application/json', () => {
      assert.ok(MIME_TYPES['.json'].startsWith('application/json'));
    });
  });

  describe('handleRequest', () => {
    it('serves index.html for root path', (_, done) => {
      const req = { url: '/', headers: { host: 'localhost:3000' } };
      const chunks = [];
      const res = {
        writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
        end(data) {
          // Should attempt to serve index.html (will succeed since file exists)
          assert.equal(this.statusCode, 200);
          done();
        }
      };
      handleRequest(req, res);
    });

    it('returns 404 for missing files', (_, done) => {
      const req = { url: '/nonexistent-file-abc123.xyz', headers: { host: 'localhost:3000' } };
      const res = {
        writeHead(status) { this.statusCode = status; },
        end() {
          assert.equal(this.statusCode, 404);
          done();
        }
      };
      handleRequest(req, res);
    });

    it('blocks directory traversal attempts', (_, done) => {
      const req = { url: '/../package.json', headers: { host: 'localhost:3000' } };
      const res = {
        writeHead(status) { this.statusCode = status; },
        end(data) {
          // Should either 403 or 404 — never serve files outside site dir
          assert.ok(this.statusCode === 403 || this.statusCode === 404);
          done();
        }
      };
      handleRequest(req, res);
    });
  });
});
