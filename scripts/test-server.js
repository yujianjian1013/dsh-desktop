'use strict';
// 仅用于自动启动逻辑的自测：在指定端口起一个最小 HTTP 服务。
// 用法: node test-server.js --port 3111
const http = require('http');

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 3111;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html><body style="background:#0b0f19;color:#22d3ee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>AUTOSTART TEST OK</h1></body></html>');
});
server.listen(port, '127.0.0.1', () => {
  console.log(`[test-server] listening on ${port}`);
});
