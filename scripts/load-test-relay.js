#!/usr/bin/env node

const WebSocket = require("ws");

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const envName = name.toUpperCase().replace(/-/g, "_");
  return process.env[envName] || fallback;
}

function readNumber(name, fallback) {
  const value = Number(readOption(name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function showHelp() {
  console.log(`CimeFlow relay load test

Usage:
  node scripts/load-test-relay.js --url ws://127.0.0.1:3001 --clients 500 --channels 100 --duration 60

Options:
  --url              Relay WebSocket base URL. Default: ws://127.0.0.1:3001
  --clients          Total browser clients to open. Default: 100
  --channels         Channel IDs to spread clients across. Default: 10
  --duration         Test duration in seconds. Default: 30
  --ramp             Ramp-up duration in seconds. Default: 10
  --channel-prefix   Mock channel prefix. Default: load
  --dedup            Use viewer dedup query flag, 0 or 1. Default: 0

For relay-only testing, start the relay with MOCK_CIME_UPSTREAM=1.
`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

function normalizeBaseUrl(value) {
  if (value.startsWith("http://")) return value.replace(/^http:\/\//, "ws://");
  if (value.startsWith("https://")) return value.replace(/^https:\/\//, "wss://");
  return value;
}

const baseUrl = normalizeBaseUrl(readOption("url", "ws://127.0.0.1:3001")).replace(
  /\/$/,
  ""
);
const totalClients = readNumber("clients", 100);
const channelCount = Math.max(1, readNumber("channels", 10));
const durationMs = Math.max(1, readNumber("duration", 30)) * 1000;
const rampMs = readNumber("ramp", 10) * 1000;
const channelPrefix = readOption("channel-prefix", "load");
const dedup = readOption("dedup", "0") === "1" ? "1" : "0";

const startedAt = Date.now();
const sockets = new Set();
const stats = {
  attempted: 0,
  opened: 0,
  closed: 0,
  failed: 0,
  errors: 0,
  batches: 0,
  items: 0,
  statuses: 0,
};

function getChannelId(index) {
  return `${channelPrefix}-${(index % channelCount) + 1}`;
}

function getWsUrl(index) {
  const channelId = encodeURIComponent(getChannelId(index));
  return `${baseUrl}/api/ws/chat/${channelId}?dedup=${dedup}`;
}

function connectClient(index) {
  stats.attempted += 1;
  const ws = new WebSocket(getWsUrl(index), {
    perMessageDeflate: false,
    handshakeTimeout: 10000,
  });
  sockets.add(ws);

  ws.on("open", () => {
    stats.opened += 1;
  });

  ws.on("message", (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === "batch" && Array.isArray(payload.items)) {
        stats.batches += 1;
        stats.items += payload.items.length;
      }
      if (payload.type === "status") stats.statuses += 1;
    } catch {
      stats.errors += 1;
    }
  });

  ws.on("error", () => {
    stats.failed += 1;
  });

  ws.on("close", () => {
    stats.closed += 1;
    sockets.delete(ws);
  });
}

function printReport(final = false) {
  const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
  const connected = sockets.size;
  const itemsPerSecond = stats.items / elapsed;
  const report = {
    final,
    elapsedSeconds: Number(elapsed.toFixed(1)),
    attempted: stats.attempted,
    opened: stats.opened,
    connected,
    closed: stats.closed,
    failed: stats.failed,
    parseErrors: stats.errors,
    batches: stats.batches,
    items: stats.items,
    itemsPerSecond: Number(itemsPerSecond.toFixed(1)),
  };
  console.log(JSON.stringify(report));
}

const rampIntervalMs =
  totalClients <= 1 ? 0 : Math.max(1, Math.floor(rampMs / totalClients));

for (let index = 0; index < totalClients; index += 1) {
  setTimeout(() => connectClient(index), index * rampIntervalMs);
}

const reportTimer = setInterval(() => printReport(false), 5000);

setTimeout(() => {
  clearInterval(reportTimer);
  for (const ws of sockets) {
    try {
      ws.close(1000, "load-test-finished");
    } catch {}
  }
  setTimeout(() => {
    printReport(true);
    process.exit(stats.opened > 0 ? 0 : 1);
  }, 1000);
}, durationMs + rampMs);
