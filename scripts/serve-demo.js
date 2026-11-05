#!/usr/bin/env node
/*
 * Servidor estático mínimo (sem dependências) para rodar o ExtraHUB em modo
 * demonstração direto no navegador. Não precisa de `npm install`.
 *
 *   node scripts/serve-demo.js            -> http://localhost:4173
 *   PORT=8080 node scripts/serve-demo.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'frontend');
const port = Number(process.env.PORT) || 4173;
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
};

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let filePath = path.normalize(path.join(root, urlPath));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
    });
}).listen(port, () => {
    console.log(`ExtraHUB (modo demonstração) rodando em http://localhost:${port}`);
    console.log('Pressione Ctrl+C para encerrar.');
});
