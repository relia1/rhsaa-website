#!/usr/bin/env node
// Serve legacy/ as-is, the way the real host does: files are sent unmodified, so the jQuery
// header/footer includes and CDN assets (Bootstrap, jQuery) load in the browser as usual.
// Usage: bun run legacy:serve [port]   (default 4322)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY, routeToLegacyFile } from './lib/legacy.mjs';

const port = Number(process.argv[2] ?? process.env.LEGACY_PORT ?? 4322);
// No charset on text types: the browser honours each page's own <meta charset>, as on the real host.
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function send(res, status, file) {
  res.writeHead(status, {
    'content-type': types[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const file = routeToLegacyFile(url.pathname);
  if (!file) return send(res, 404, path.join(LEGACY, '404.html'));
  // Directory URL without trailing slash: redirect so relative links resolve like on the real host.
  if (file.endsWith('index.html') && !url.pathname.endsWith('/') && url.pathname !== '/') {
    res.writeHead(301, { location: url.pathname + '/' });
    return res.end();
  }
  send(res, 200, file);
});

// Listen only when run directly (`bun run legacy:serve`), not when imported by parity.mjs.
// Compare real filesystem paths: a hand-built `file://${argv[1]}` string doesn't match
// import.meta.url when the path has spaces/special characters (URL-encoded) or on Windows.
const isMain =
  process.argv[1] !== undefined &&
  fs.realpathSync(fileURLToPath(import.meta.url)) ===
    fs.realpathSync(path.resolve(process.argv[1]));
if (isMain) {
  server.listen(port, () => console.log(`legacy site: http://localhost:${port}`));
}

export { server };
