// Сервер страницы проекта SMART QALA: отдаёт статические файлы из public/ (без внешних зависимостей).
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "public");
const ROUTES = { "/": "index.html", "/demo": "demo.html", "/demo/": "demo.html" };
const TYPES = { ".html": "text/html; charset=utf-8", ".pdf": "application/pdf", ".mp4": "video/mp4" };

function send(res, file, req) {
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  const range = req.headers.range;
  if (range && type === "video/mp4") {
    // Перемотка видео в браузере работает через запросы диапазонов.
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=300" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/health") return res.end("ok");
  const name = ROUTES[pathname] || pathname.slice(1);
  const file = path.join(ROOT, name);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }
  send(res, file, req);
}).listen(Number(process.env.PORT || 3000));
