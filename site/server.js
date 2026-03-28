/**
 * Minimal static file server for the Remembrance Oracle site.
 * Zero dependencies — uses only Node.js built-ins.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SITE_DIR = __dirname;
const PORT = parseInt(process.env.PORT || '3000', 10);

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  // Default to index.html
  if (pathname === '/') pathname = '/index.html';

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(SITE_DIR, safePath);

  // Ensure we stay within the site directory
  if (!filePath.startsWith(SITE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`Remembrance Oracle site running at http://localhost:${PORT}`);
});

module.exports = { serveFile, handleRequest, MIME_TYPES };
