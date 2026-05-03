/**
 * CimeFlow UI 서버 (Next.js)
 *
 * Next.js 앱을 커스텀 HTTP 서버로 감싸 헬스 체크 엔드포인트와
 * 그레이스풀 드레인을 추가합니다.
 *
 * 헬스 체크:
 *   GET /api/health → 프로세스 상태 (uptime, 메모리)
 *   GET /api/ready  → 503은 로드밸런서가 트래픽을 차단하도록 신호합니다.
 */

const http = require("http");
const { parse } = require("url");
const next = require("next");

require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = parseInt(process.env.UI_PORT || process.env.PORT || "3000", 10);
let isDraining = false;

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "cime-flow-ui",
          uptime: Math.round(process.uptime()),
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        })
      );
      return;
    }

    if (req.url === "/api/ready") {
      // 드레인 중에는 503을 반환하여 로드밸런서가 이 인스턴스로의 트래픽을 끊도록 합니다.
      res.writeHead(isDraining ? 503 : 200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: isDraining ? "not_ready" : "ready",
          service: "cime-flow-ui",
          draining: isDraining,
        })
      );
      return;
    }

    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  function gracefulShutdown(signal) {
    isDraining = true;
    console.log(`\n[ui] ${signal} received, shutting down...`);
    server.close(() => {
      console.log("[ui] HTTP server closed");
      process.exit(0);
    });
    // 10초 이내에 서버가 닫히지 않으면 강제 종료합니다.
    setTimeout(() => process.exit(1), 10000);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> CimeFlow UI ready on http://localhost:${PORT}`);
    console.log("> Relay server must be running separately.");
  });
});
