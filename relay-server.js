/**
 * CimeFlow Relay Server
 *
 * ci.me IVS 채팅 WebSocket에 연결하여 메시지를 수신하고,
 * 브라우저 클라이언트에게 배치(batch) 형태로 중계하는 서버입니다.
 *
 * 아키텍처:
 *   브라우저 ─── WebSocket ──► ChannelHub ──► AWS IVS Chat WebSocket
 *                              (채널당 1개)
 *
 * 주요 기능:
 *  - ChannelHub: 채널당 상류(IVS) 연결 1개를 공유, 다수 클라이언트에게 팬아웃
 *  - 배치 발송: BATCH_INTERVAL_MS 간격으로 메시지를 묶어 전송 (클라이언트 렌더링 부하 감소)
 *  - 중복 제거(dedup): 동일 userIdHash의 채팅을 세션 단위로 필터링 (시청자 추첨용)
 *  - 레이트 리밋: HTTP/WebSocket/채널 조회를 IP 기준으로 제한 (Redis 분산 지원)
 *  - 그레이스풀 드레인: SIGTERM 수신 시 신규 연결 차단 후 기존 세션이 자연 종료되길 대기
 */

const http = require("http");
const crypto = require("crypto");
const { parse } = require("url");
const WebSocket = require("ws");

require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

// ioredis는 선택적 의존성입니다. 설치되어 있지 않아도 단일 인스턴스로 동작합니다.
let Redis = null;
try {
  Redis = require("ioredis");
} catch {}

// ─── 설정 (환경 변수) ──────────────────────────────────────────────────────────

const RELAY_PORT = parseInt(process.env.RELAY_PORT || process.env.PORT || "3001", 10);

// 분산 환경에서 인스턴스를 식별하는 고유 ID. 지정하지 않으면 호스트명 + PID + 랜덤으로 자동 생성됩니다.
const INSTANCE_ID =
  process.env.INSTANCE_ID ||
  `${require("os").hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "1000", 10);
const MAX_CHANNEL_HUBS = parseInt(process.env.MAX_CHANNEL_HUBS || "300", 10);
const MAX_CLIENTS_PER_CHANNEL = parseInt(
  process.env.MAX_CLIENTS_PER_CHANNEL || "100",
  10
);
const MAX_WS_PER_IP = parseInt(process.env.MAX_WS_PER_IP || "50", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "60000",
  10
);
const HTTP_RATE_LIMIT_MAX = parseInt(process.env.HTTP_RATE_LIMIT_MAX || "240", 10);
const CHANNEL_LOOKUP_RATE_LIMIT_MAX = parseInt(
  process.env.CHANNEL_LOOKUP_RATE_LIMIT_MAX || "60",
  10
);
// 클라이언트가 없는 채널 허브를 닫기까지 대기하는 유휴 시간입니다.
const CHANNEL_IDLE_TTL_MS = parseInt(process.env.CHANNEL_IDLE_TTL_MS || "30000", 10);
// 메시지를 묶어 브라우저에 전송하는 주기입니다. 낮을수록 실시간성이 높지만 프레임 드랍 위험이 있습니다.
const BATCH_INTERVAL_MS = parseInt(process.env.BATCH_INTERVAL_MS || "100", 10);
const REDIS_URL = process.env.REDIS_URL || "";
// CORS_ORIGIN="*" 이면 모든 오리진을 허용합니다. 프로덕션에서는 정확한 오리진을 지정하세요.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
// Redis 카운터에 설정하는 TTL. 하트비트 주기(15s)보다 충분히 길게 유지합니다.
const ACTIVE_COUNTER_TTL_MS = 45_000;
const REDIS_CONNECT_TIMEOUT_MS = parseInt(
  process.env.REDIS_CONNECT_TIMEOUT_MS || "1500",
  10
);
const DRAIN_TIMEOUT_MS = parseInt(process.env.DRAIN_TIMEOUT_MS || "30000", 10);
// 리버스 프록시(nginx, ALB 등) 뒤에 배포할 경우 true로 설정해야 X-Forwarded-For를 신뢰합니다.
const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY, false);
// METRICS_TOKEN, ADMIN_TOKEN이 비어 있으면 해당 엔드포인트가 비활성화됩니다.
const METRICS_TOKEN = process.env.METRICS_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// LOG_IP_MODE: "hash"(기본) = SHA-256 앞 16자, "none" = 로그 제외, "raw" = 원본 IP
const LOG_IP_MODE = (process.env.LOG_IP_MODE || "hash").toLowerCase();
// IP 해시 salt. 지정하지 않으면 INSTANCE_ID를 사용합니다.
const IP_HASH_SALT = process.env.IP_HASH_SALT || INSTANCE_ID;
// 실제 ci.me 연결 없이 더미 메시지를 생성하는 로드테스트 전용 옵션입니다. 프로덕션에서 활성화하지 마세요.
const MOCK_CIME_UPSTREAM = parseBoolean(process.env.MOCK_CIME_UPSTREAM, false);
const MOCK_MESSAGE_INTERVAL_MS = parseInt(
  process.env.MOCK_MESSAGE_INTERVAL_MS || "100",
  10
);

// ci.me 상류 요청에 필요한 고정 헤더입니다.
// ci.me WebSocket 및 REST API는 브라우저 환경에서만 열리도록 설계되어 있어,
// Origin/Referer/User-Agent를 브라우저처럼 설정해야 정상 응답을 받을 수 있습니다.
const HEADERS = {
  Origin: "https://ci.me",
  Referer: "https://ci.me/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// ─── 전역 상태 ─────────────────────────────────────────────────────────────────

const activeSessions = new Map();   // sessionId → session 객체
const channelHubs = new Map();      // channelId → ChannelHub 인스턴스
const ipWsCounts = new Map();       // IP → 현재 WebSocket 수 (로컬 카운터)
const channelWsCounts = new Map();  // channelId → 현재 WebSocket 수 (로컬 카운터)
const rateLimitBuckets = new Map(); // Redis 미사용 시 인메모리 레이트 리밋 버킷
let sessionCounter = 0;
let redis = null;
let isDraining = false;
let drainStartedAt = null;

const startedAt = Date.now();

// Prometheus 및 /api/health 에서 사용하는 누적 카운터입니다.
const metrics = {
  httpRequestsTotal: 0,
  httpRateLimitedTotal: 0,
  wsUpgradeTotal: 0,
  wsRejectedTotal: 0,
  wsConnectionsTotal: 0,
  wsClosedTotal: 0,
  chatMessagesTotal: 0,
  donationMessagesTotal: 0,
  upstreamMessagesTotal: 0,
  batchesSentTotal: 0,
  batchItemsSentTotal: 0,
  tokenFetchTotal: 0,
  tokenFetchFailedTotal: 0,
  channelLookupTotal: 0,
  channelLookupFailedTotal: 0,
  hubCreateTotal: 0,
  hubCloseTotal: 0,
  upstreamConnectTotal: 0,
  upstreamReconnectTotal: 0,
  upstreamErrorTotal: 0,
  redisErrorsTotal: 0,
  drainsTotal: 0,
};

// ─── 유틸리티 ──────────────────────────────────────────────────────────────────

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

/**
 * LOG_IP_MODE 설정에 따라 IP 주소를 로그에 기록할 형태로 변환합니다.
 * 기본값(hash)은 salt를 포함한 SHA-256 앞 16자를 사용하여 역추적을 방지합니다.
 */
function formatIpForLog(ip) {
  if (!ip) return "unknown";
  if (LOG_IP_MODE === "raw") return ip;
  if (LOG_IP_MODE === "none") return "redacted";
  const digest = crypto
    .createHash("sha256")
    .update(`${IP_HASH_SALT}:${ip}`)
    .digest("hex")
    .slice(0, 16);
  return `sha256:${digest}`;
}

/** 로그 필드 중 민감한 값(IP, Redis 키)을 안전하게 마스킹합니다. */
function sanitizeLogValue(key, value) {
  if (key === "clientIp") return formatIpForLog(value);
  if (key === "key" && typeof value === "string") {
    return value.replace(
      /cime-flow:relay:ip:[^:]+:active:[^:]+/g,
      "cime-flow:relay:ip:<redacted>:active:<instance>"
    );
  }
  return value;
}

function sanitizeLogFields(fields) {
  const sanitized = {};
  for (const [key, value] of Object.entries(fields)) {
    sanitized[key] = sanitizeLogValue(key, value);
  }
  return sanitized;
}

/** JSON 구조화 로그를 출력합니다. ELK/CloudWatch 등에서 파싱 가능한 형식입니다. */
function log(level, event, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "cime-flow-relay",
    instanceId: INSTANCE_ID,
    event,
    ...sanitizeLogFields(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Redis 초기화 및 헬퍼 ──────────────────────────────────────────────────────

async function initRedis() {
  if (!REDIS_URL) return;
  if (!Redis) {
    log("warn", "redis_dependency_missing", {
      message: "Install dependencies with npm install to enable Redis support.",
    });
    return;
  }

  redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
  });

  redis.on("error", (err) => {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_error", { error: err.message });
  });

  try {
    await redis.connect();
    log("info", "redis_connected", { redisUrl: maskRedisUrl(REDIS_URL) });
  } catch (err) {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_connect_failed", {
      error: err.message,
      fallback: "memory",
    });
    try {
      redis.disconnect();
    } catch {}
    // 연결 실패 시 null로 재설정하여 이후 로직이 인메모리 폴백을 사용하도록 합니다.
    redis = null;
  }
}

/** Redis URL의 패스워드 부분을 마스킹하여 안전하게 로그에 출력합니다. */
function maskRedisUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "configured";
  }
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (TRUST_PROXY && typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function hasBearerToken(req, expectedToken) {
  if (!expectedToken) return true;
  const authorization = req.headers.authorization || "";
  return authorization === `Bearer ${expectedToken}`;
}

function isRelayReady() {
  return (
    !isDraining &&
    activeSessions.size < MAX_SESSIONS &&
    channelHubs.size < MAX_CHANNEL_HUBS
  );
}

function getAllowedOrigin(req) {
  if (CORS_ORIGIN === "*") return "*";
  const origin = req.headers.origin;
  if (!origin) return CORS_ORIGIN;
  return origin === CORS_ORIGIN ? origin : null;
}

function isOriginAllowed(req) {
  return getAllowedOrigin(req) !== null;
}

// ─── 레이트 리밋 ───────────────────────────────────────────────────────────────

function getRateLimitKey(scope, ip) {
  return `cime-flow:rate:${scope}:${ip}`;
}

function getRedisKeyPart(value) {
  return Buffer.from(String(value)).toString("base64url");
}

/** 분산 환경에서 인스턴스별 활성 카운터를 저장하는 Redis 키를 반환합니다. */
function getActiveCounterKey(kind, value) {
  return `cime-flow:relay:${kind}:${getRedisKeyPart(value)}:active:${INSTANCE_ID}`;
}

/** 모든 인스턴스의 활성 카운터를 조회할 때 사용하는 SCAN 패턴입니다. */
function getActiveCounterPattern(kind, value) {
  return `cime-flow:relay:${kind}:${getRedisKeyPart(value)}:active:*`;
}

/**
 * IP + scope 조합으로 레이트 리밋을 검사합니다.
 * Redis가 활성화된 경우 분산 카운터를 사용하고, 실패 시 인메모리 버킷으로 폴백합니다.
 */
async function checkRateLimit(scope, ip, max) {
  if (redis) {
    const key = getRateLimitKey(scope, ip);
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, RATE_LIMIT_WINDOW_MS);
      const ttl = await redis.pttl(key);
      const resetAt = Date.now() + Math.max(ttl, 0);
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        resetAt,
      };
    } catch (err) {
      metrics.redisErrorsTotal += 1;
      log("warn", "redis_rate_limit_failed", { scope, error: err.message });
    }
  }

  // Redis 미사용 또는 실패 시 인메모리 슬라이딩 윈도우 버킷으로 처리합니다.
  const now = Date.now();
  const key = getRateLimitKey(scope, ip);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return {
      allowed: true,
      remaining: Math.max(0, max - 1),
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  if (bucket.count >= max) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

// 만료된 인메모리 레이트 리밋 버킷을 주기적으로 정리합니다.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now >= bucket.resetAt) rateLimitBuckets.delete(key);
  }
}, Math.max(30_000, RATE_LIMIT_WINDOW_MS)).unref();

async function redisIncrement(key, ttlMs) {
  if (!redis) return null;
  try {
    const value = await redis.incr(key);
    if (ttlMs && value === 1) await redis.pexpire(key, ttlMs);
    return value;
  } catch (err) {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_increment_failed", { key, error: err.message });
    return null;
  }
}

async function redisDecrement(key) {
  if (!redis) return null;
  try {
    const value = await redis.decr(key);
    // 0 이하가 되면 키를 삭제하여 불필요한 메모리 점유를 방지합니다.
    if (value <= 0) await redis.del(key);
    return Math.max(0, value);
  } catch (err) {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_decrement_failed", { key, error: err.message });
    return null;
  }
}

/**
 * Redis에 현재 인스턴스의 상태(세션 수, 허브 수)와 IP/채널별 활성 카운터를 저장합니다.
 * 다른 인스턴스가 분산 활성 카운트를 조회할 때 이 데이터를 참조합니다.
 * 15초 주기로 갱신하며, TTL(45s)이 지나면 자동으로 만료됩니다.
 */
async function refreshInstanceHeartbeat() {
  if (!redis) return;
  try {
    const pipeline = redis.pipeline();
    pipeline.set(
      `cime-flow:relay:instance:${INSTANCE_ID}`,
      JSON.stringify({
        instanceId: INSTANCE_ID,
        updatedAt: Date.now(),
        sessions: activeSessions.size,
        hubs: channelHubs.size,
      }),
      "PX",
      ACTIVE_COUNTER_TTL_MS
    );

    for (const [ip, count] of ipWsCounts.entries()) {
      pipeline.set(getActiveCounterKey("ip", ip), count, "PX", ACTIVE_COUNTER_TTL_MS);
    }
    for (const [channelId, count] of channelWsCounts.entries()) {
      pipeline.set(
        getActiveCounterKey("channel", channelId),
        count,
        "PX",
        ACTIVE_COUNTER_TTL_MS
      );
    }

    await pipeline.exec();
  } catch (err) {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_heartbeat_failed", { error: err.message });
  }
}

setInterval(refreshInstanceHeartbeat, 15_000).unref();

// ─── HTTP 응답 헬퍼 ────────────────────────────────────────────────────────────

function writeJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function writeText(res, status, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
  });
  res.end(payload);
}

function writeRateLimit(res, resetAt) {
  metrics.httpRateLimitedTotal += 1;
  res.writeHead(429, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
  });
  res.end(
    JSON.stringify({
      error: "RATE_LIMITED",
      message: "Too many requests. Try again shortly.",
    })
  );
}

// ─── Prometheus 메트릭 ─────────────────────────────────────────────────────────

function addPromMetric(lines, name, type, help, value) {
  const numericValue = Number(value);
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);
  lines.push(`${name} ${Number.isFinite(numericValue) ? numericValue : 0}`);
}

function getPrometheusMetrics() {
  const snapshot = getMetricsSnapshot();
  const lines = [];
  addPromMetric(lines, "cime_flow_relay_up", "gauge", "Relay process is up.", 1);
  addPromMetric(
    lines,
    "cime_flow_relay_ready",
    "gauge",
    "Relay readiness state.",
    isRelayReady() ? 1 : 0
  );
  addPromMetric(
    lines,
    "cime_flow_relay_draining",
    "gauge",
    "Relay is draining and rejecting new WebSocket sessions.",
    isDraining ? 1 : 0
  );
  addPromMetric(
    lines,
    "cime_flow_relay_uptime_seconds",
    "gauge",
    "Relay process uptime in seconds.",
    snapshot.uptime
  );
  addPromMetric(
    lines,
    "cime_flow_relay_memory_megabytes",
    "gauge",
    "Relay heap memory usage in megabytes.",
    snapshot.memoryMB
  );
  addPromMetric(
    lines,
    "cime_flow_relay_redis_enabled",
    "gauge",
    "Redis distributed coordination is enabled.",
    snapshot.redisEnabled ? 1 : 0
  );
  addPromMetric(lines, "cime_flow_relay_sessions", "gauge", "Active relay sessions.", snapshot.sessions);
  addPromMetric(lines, "cime_flow_relay_max_sessions", "gauge", "Configured session limit.", snapshot.maxSessions);
  addPromMetric(lines, "cime_flow_relay_active_hubs", "gauge", "Active channel hubs.", snapshot.activeHubs);
  addPromMetric(lines, "cime_flow_relay_max_channel_hubs", "gauge", "Configured channel hub limit.", snapshot.maxChannelHubs);
  addPromMetric(lines, "cime_flow_relay_active_channels", "gauge", "Channels with active client sessions.", snapshot.activeChannels);
  addPromMetric(lines, "cime_flow_relay_active_ips", "gauge", "Client IPs with active sessions.", snapshot.activeIps);
  addPromMetric(lines, "cime_flow_relay_max_clients_on_hub", "gauge", "Largest client count on a single channel hub.", snapshot.maxClientsOnHub);
  addPromMetric(lines, "cime_flow_relay_max_clients_per_channel", "gauge", "Configured client limit per channel.", snapshot.maxClientsPerChannel);

  const counters = [
    ["http_requests_total", "HTTP requests handled."],
    ["http_rate_limited_total", "HTTP requests rejected by rate limits."],
    ["ws_upgrade_total", "WebSocket upgrade attempts."],
    ["ws_rejected_total", "WebSocket upgrade attempts rejected."],
    ["ws_connections_total", "WebSocket client sessions opened."],
    ["ws_closed_total", "WebSocket client sessions closed."],
    ["chat_messages_total", "Normalized chat messages received."],
    ["donation_messages_total", "Normalized donation messages received."],
    ["upstream_messages_total", "Normalized upstream messages received."],
    ["batches_sent_total", "Batches sent to browser clients."],
    ["batch_items_sent_total", "Batch items sent to browser clients."],
    ["token_fetch_total", "ci.me chat token fetch attempts."],
    ["token_fetch_failed_total", "Failed ci.me chat token fetch attempts."],
    ["channel_lookup_total", "ci.me channel lookup attempts."],
    ["channel_lookup_failed_total", "Failed ci.me channel lookup attempts."],
    ["hub_create_total", "Channel hubs created."],
    ["hub_close_total", "Channel hubs closed."],
    ["upstream_connect_total", "Upstream chat connections opened."],
    ["upstream_reconnect_total", "Upstream reconnect attempts."],
    ["upstream_error_total", "Upstream chat errors."],
    ["redis_errors_total", "Redis operation errors."],
    ["drains_total", "Relay drain events started."],
  ];

  for (const [suffix, help] of counters) {
    const camel = suffix.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    addPromMetric(lines, `cime_flow_relay_${suffix}`, "counter", help, snapshot[camel]);
  }

  return `${lines.join("\n")}\n`;
}

// ─── WebSocket 헬퍼 ────────────────────────────────────────────────────────────

function sendWsMessage(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {}
}

/**
 * 클라이언트에게 에러 메시지를 전송한 뒤 WebSocket을 닫습니다.
 * 50ms 지연 후 close를 호출하여 클라이언트가 에러 메시지를 수신할 시간을 확보합니다.
 */
function closeWsWithError(ws, code, message) {
  sendWsMessage(ws, { type: "error", code, message });
  setTimeout(() => {
    try {
      ws.close(1013, code);
    } catch {}
  }, 50);
}

function incrementMapCount(map, key) {
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
}

function decrementMapCount(map, key) {
  const next = Math.max(0, (map.get(key) || 0) - 1);
  if (next === 0) map.delete(key);
  else map.set(key, next);
  return next;
}

function getMetricsSnapshot() {
  let maxClientsOnHub = 0;
  for (const hub of channelHubs.values()) {
    maxClientsOnHub = Math.max(maxClientsOnHub, hub.clients.size);
  }

  return {
    service: "cime-flow-relay",
    instanceId: INSTANCE_ID,
    uptime: Math.round((Date.now() - startedAt) / 1000),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    redisEnabled: Boolean(redis),
    ready: isRelayReady(),
    draining: isDraining,
    drainStartedAt,
    sessions: activeSessions.size,
    maxSessions: MAX_SESSIONS,
    activeHubs: channelHubs.size,
    maxChannelHubs: MAX_CHANNEL_HUBS,
    maxClientsPerChannel: MAX_CLIENTS_PER_CHANNEL,
    maxClientsOnHub,
    activeIps: ipWsCounts.size,
    activeChannels: channelWsCounts.size,
    ...metrics,
  };
}

function logSessionStats() {
  log("info", "session_stats", {
    activeSessions: activeSessions.size,
    activeHubs: channelHubs.size,
    maxSessions: MAX_SESSIONS,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}
setInterval(logSessionStats, 60_000).unref();

// ─── ci.me 상류 API 연동 ───────────────────────────────────────────────────────

/**
 * ci.me IVS 채팅 연결에 필요한 단기 토큰을 발급받습니다.
 * 토큰은 WebSocket 연결 시 서브프로토콜로 전달됩니다.
 */
async function fetchChatToken(channelId) {
  metrics.tokenFetchTotal += 1;
  try {
    const res = await fetch(
      `https://ci.me/api/app/channels/${channelId}/chat-token`,
      {
        method: "POST",
        headers: {
          ...HEADERS,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );
    if (!res.ok) {
      metrics.tokenFetchFailedTotal += 1;
      log("warn", "token_fetch_failed", { status: res.status, channelId });
      return null;
    }
    const data = await res.json();
    return data?.data?.token ?? null;
  } catch (e) {
    metrics.tokenFetchFailedTotal += 1;
    log("error", "token_fetch_error", { channelId, error: e.message });
    return null;
  }
}

/** 핸들(@아이디) 기반으로 채널 정보를 조회합니다. 라이브 중인 경우 /live 경로를 우선 시도합니다. */
async function resolveByHandle(handle) {
  metrics.channelLookupTotal += 1;
  const tryUrls = [
    `https://ci.me/json/@${handle}/live`,
    `https://ci.me/json/@${handle}`,
  ];

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const channel = data?.bodyData?.live?.channel ?? data?.bodyData?.channel;

      return {
        channelId: channel?.slug ?? handle,
        channelName: channel?.name ?? handle,
        channelImageUrl: channel?.imageUrl ?? "",
        verifiedMark: false,
        followerCount: channel?.followerCount ?? 0,
      };
    } catch (err) {
      metrics.channelLookupFailedTotal += 1;
      log("warn", "channel_lookup_handle_error", { handle, error: err.message });
    }
  }

  return {
    channelId: handle,
    channelName: handle,
    channelImageUrl: "",
    verifiedMark: false,
    followerCount: 0,
  };
}

/** 채널 숫자 ID 기반으로 채널 정보를 조회합니다. */
async function resolveById(channelId) {
  metrics.channelLookupTotal += 1;
  try {
    const res = await fetch(`https://ci.me/api/app/channels/${channelId}`, {
      headers: HEADERS,
      cache: "no-store",
    });
    if (!res.ok) {
      metrics.channelLookupFailedTotal += 1;
      return null;
    }
    const data = await res.json();
    const channel = data?.data;
    if (!channel) return null;
    return {
      channelId: String(channel.id ?? channelId),
      channelName: channel.name ?? channel.handle ?? channelId,
      channelImageUrl: channel.imageUrl ?? channel.thumbnailUrl ?? "",
      verifiedMark: false,
      followerCount: 0,
    };
  } catch (err) {
    metrics.channelLookupFailedTotal += 1;
    log("warn", "channel_lookup_id_error", { channelId, error: err.message });
    return {
      channelId,
      channelName: channelId,
      channelImageUrl: "",
      verifiedMark: false,
      followerCount: 0,
    };
  }
}

// ─── IVS 메시지 파싱 ───────────────────────────────────────────────────────────

/**
 * AWS IVS Chat WebSocket으로부터 수신한 원시 JSON 문자열을 파싱하여
 * 내부 compact 배치 아이템 형식({ k, h, n, b, s, m, p? })으로 변환합니다.
 *
 * IVS 메시지 구조 요약:
 *   - 일반 채팅: Type="MESSAGE", Content=텍스트, Sender.Attributes.user=JSON
 *   - 후원(도네이션): EventName="DONATION_CHAT"|"DONATION_VIDEO" 또는 Attributes.type="DONATION_*"
 *     후원자 정보는 msg.Attributes 또는 msg.Content(JSON) 중 하나에 포함됩니다.
 *   - 기타 이벤트(시스템 메시지 등)는 null을 반환하여 무시합니다.
 */
function parseIvsMessage(str) {
  try {
    const msg = JSON.parse(str);
    const outerType = msg.Type;
    const attrs = msg.Attributes ?? {};
    const attrType = attrs.type;
    const eventName = msg.EventName;

    // Sender.Attributes.user 는 유저 정보를 담은 중첩 JSON 문자열입니다.
    const senderAttrs = msg.Sender?.Attributes ?? {};
    let viewer = null;
    if (senderAttrs.user) {
      try {
        const user = JSON.parse(senderAttrs.user);
        // bg(배지) 배열 중 id가 "SUBSCRIPTION"으로 시작하면 구독자로 판단합니다.
        const subscribe = (user.bg ?? []).some(
          (b) => typeof b.id === "string" && b.id.startsWith("SUBSCRIPTION")
        );
        viewer = {
          h: user.id,
          n: user.ch?.na ?? "알 수 없음",
          b: (user.bg ?? []).map((b) => b.ig).filter(Boolean),
          s: subscribe,
        };
      } catch {}
    }

    if (outerType === "MESSAGE" || attrType === "MESSAGE") {
      if (!viewer) return null;
      return { k: "c", ...viewer, m: msg.Content ?? "" };
    }

    // ci.me는 후원 이벤트를 여러 형태로 전송합니다. 알려진 모든 패턴을 커버합니다.
    const isDonation =
      eventName === "DONATION_CHAT" ||
      eventName === "DONATION_VIDEO" ||
      attrType === "DONATION_CHAT" ||
      attrType === "DONATION_VIDEO" ||
      outerType === "DONATION" ||
      attrType === "DONATION" ||
      (outerType === "EVENT" && attrs.type === "DONATION");

    if (isDonation) {
      // 후원 정보는 Attributes 또는 Content(JSON) 중 하나에 들어옵니다.
      let nestedData = {};
      try {
        const parsed = JSON.parse(msg.Content ?? "{}");
        nestedData = parsed?.data ?? parsed ?? {};
      } catch {}

      const donorViewer = viewer ?? {
        h: attrs.donatorChannelId ?? nestedData.donatorChannelId ?? "anonymous",
        n: attrs.donatorNickname ?? nestedData.donatorNickname ?? "익명",
        b: [],
        s: false,
      };

      const price =
        parseInt(attrs.payAmount ?? nestedData.payAmount ?? "0", 10) || 0;
      const content =
        attrs.donationText ?? nestedData.donationText ?? msg.Content ?? "";

      return { k: "d", ...donorViewer, m: content, p: price };
    }

    return null;
  } catch {
    return null;
  }
}

// ─── ChannelHub ────────────────────────────────────────────────────────────────

/**
 * 하나의 ci.me 채널에 대응하는 상류 IVS WebSocket 연결을 관리하는 허브입니다.
 *
 * 역할:
 *  - 상류(IVS) WebSocket 연결 1개를 보유하고 여러 클라이언트 세션에 메시지를 팬아웃합니다.
 *  - 클라이언트가 없어진 뒤 CHANNEL_IDLE_TTL_MS가 지나면 스스로 닫힙니다.
 *  - 상류 연결이 끊기면 지수 백오프(exponential backoff)로 재연결을 시도합니다.
 */
class ChannelHub {
  constructor(channelId) {
    this.channelId = channelId;
    this.clients = new Map();     // sessionId → session
    this.upstreamWs = null;
    this.destroyed = false;
    this.connecting = false;
    this.batchBuffer = [];
    this.batchTimer = null;
    this.idleTimer = null;
    this.pingInterval = null;
    this.pingTimeout = null;
    this.reconnectTimer = null;
    this.mockInterval = null;
    this.isAlive = true;
    this.createdAt = Date.now();
    this.lastMessageAt = null;
    this.reconnectCount = 0;
    metrics.hubCreateTotal += 1;
    log("info", "hub_created", { channelId });
  }

  subscribe(session) {
    if (this.destroyed) return false;
    if (this.clients.size >= MAX_CLIENTS_PER_CHANNEL) return false;

    // 클라이언트가 다시 생겼으므로 유휴 타이머를 취소합니다.
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.clients.set(session.sessionId, session);
    sendWsMessage(session.ws, {
      type: "status",
      code: "HUB_READY",
      message: "채팅 중계 세션을 준비했습니다.",
    });
    this.connect();
    return true;
  }

  unsubscribe(sessionId) {
    const session = this.clients.get(sessionId);
    // dedup 세트를 즉시 해제하여 메모리를 회수합니다.
    if (session?.seenSet) session.seenSet.clear();
    this.clients.delete(sessionId);

    if (this.clients.size === 0 && !this.idleTimer) {
      this.idleTimer = setTimeout(() => {
        if (this.clients.size === 0) this.close("idle");
      }, CHANNEL_IDLE_TTL_MS);
      this.idleTimer.unref?.();
    }
  }

  async connect() {
    if (this.destroyed || this.connecting) return;
    if (this.upstreamWs && this.upstreamWs.readyState === WebSocket.OPEN) return;
    if (MOCK_CIME_UPSTREAM) {
      this.startMockUpstream();
      return;
    }

    this.connecting = true;
    let token = null;

    // 토큰 발급 실패 시 클라이언트가 있는 동안 계속 재시도합니다.
    while (!token && !this.destroyed && this.clients.size > 0) {
      token = await fetchChatToken(this.channelId);
      if (!token) {
        this.broadcastStatus(
          "TOKEN_RETRY",
          "채팅 연결 권한을 다시 요청하고 있습니다."
        );
        log("warn", "hub_token_retry", { channelId: this.channelId });
        await sleep(5000);
      }
    }

    this.connecting = false;
    if (!token || this.destroyed || this.clients.size === 0) return;

    try {
      // IVS Chat WebSocket은 서브프로토콜 자리에 인증 토큰을 전달하는 방식을 사용합니다.
      this.upstreamWs = new WebSocket(
        "wss://edge.ivschat.ap-northeast-2.amazonaws.com/",
        [token],
        { headers: HEADERS }
      );
      this.attachUpstreamHandlers();
    } catch (err) {
      metrics.upstreamErrorTotal += 1;
      log("error", "hub_upstream_create_failed", {
        channelId: this.channelId,
        error: err.message,
      });
      this.scheduleReconnect();
    }
  }

  /** MOCK_CIME_UPSTREAM=true 시 실제 IVS 연결 없이 더미 메시지를 생성합니다. */
  startMockUpstream() {
    if (this.destroyed || this.mockInterval) return;
    let sequence = 0;
    metrics.upstreamConnectTotal += 1;
    this.broadcastStatus("CONNECTED", "Mock chat stream connected.");
    log("info", "hub_mock_upstream_started", {
      channelId: this.channelId,
      clients: this.clients.size,
    });

    this.mockInterval = setInterval(() => {
      if (this.destroyed || this.clients.size === 0) return;
      sequence += 1;
      const item =
        sequence % 25 === 0
          ? {
              k: "d",
              h: `mock-donor-${sequence}`,
              n: `mock-donor-${sequence}`,
              b: [],
              s: false,
              m: `mock donation ${sequence}`,
              p: 1000 + sequence,
            }
          : {
              k: "c",
              h: `mock-viewer-${sequence}`,
              n: `mock-viewer-${sequence}`,
              b: [],
              s: sequence % 10 === 0,
              m: `mock message ${sequence}`,
            };

      this.lastMessageAt = Date.now();
      metrics.upstreamMessagesTotal += 1;
      if (item.k === "c") metrics.chatMessagesTotal += 1;
      if (item.k === "d") metrics.donationMessagesTotal += 1;
      this.batchBuffer.push(item);
      this.scheduleBatch();
    }, MOCK_MESSAGE_INTERVAL_MS);
    this.mockInterval.unref?.();
  }

  attachUpstreamHandlers() {
    const ws = this.upstreamWs;

    ws.on("open", () => {
      metrics.upstreamConnectTotal += 1;
      this.isAlive = true;
      this.reconnectCount = 0;
      this.broadcastStatus("CONNECTED", "채팅 서버에 연결되었습니다.");
      log("info", "hub_upstream_connected", {
        channelId: this.channelId,
        clients: this.clients.size,
      });

      // IVS는 15초마다 ping을 보내지 않으면 연결을 끊을 수 있으므로 자체 heartbeat를 유지합니다.
      // pong이 20초 내로 오지 않으면 연결이 끊어진 것으로 간주하고 강제 종료합니다.
      this.pingInterval = setInterval(() => {
        if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) return;
        this.isAlive = false;
        this.upstreamWs.ping();
        this.pingTimeout = setTimeout(() => {
          if (!this.isAlive && this.upstreamWs) this.upstreamWs.terminate();
        }, 20000);
      }, 15000);
      this.pingInterval.unref?.();
    });

    ws.on("pong", () => {
      this.isAlive = true;
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
      }
    });

    ws.on("message", (data) => {
      if (this.destroyed) return;
      const parsed = parseIvsMessage(data.toString());
      if (!parsed) return;

      this.lastMessageAt = Date.now();
      metrics.upstreamMessagesTotal += 1;
      if (parsed.k === "c") metrics.chatMessagesTotal += 1;
      if (parsed.k === "d") metrics.donationMessagesTotal += 1;

      this.batchBuffer.push(parsed);
      this.scheduleBatch();
    });

    ws.on("close", (code) => {
      this.cleanupUpstreamTimers();
      this.upstreamWs = null;
      if (!this.destroyed && this.clients.size > 0) {
        metrics.upstreamReconnectTotal += 1;
        this.broadcastStatus(
          "IVS_RECONNECTING",
          "채팅 연결이 끊겨 다시 연결하고 있습니다."
        );
        log("warn", "hub_upstream_closed", {
          channelId: this.channelId,
          code,
          clients: this.clients.size,
        });
        this.scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      metrics.upstreamErrorTotal += 1;
      this.cleanupUpstreamTimers();
      this.broadcastStatus("IVS_RETRY", "채팅 서버에 다시 연결하고 있습니다.");
      log("error", "hub_upstream_error", {
        channelId: this.channelId,
        error: err.message,
      });
    });
  }

  /**
   * 지수 백오프(exponential backoff) + 지터(jitter)로 재연결을 예약합니다.
   *
   * 대기 시간: min(1000 * 2^attempt, 60000) + 0~1000ms 랜덤
   *   - 1회: ~2s, 2회: ~4s, 3회: ~8s, …, 6회 이후: ~60s (최대)
   * 지터는 다수의 허브가 동시에 재연결을 시도할 때 ci.me 서버에 부하가 집중되는 것을 방지합니다.
   */
  scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectCount += 1;
    const delay = Math.min(
      1000 * Math.pow(2, Math.min(this.reconnectCount, 6)),
      60000
    );
    const jitter = Math.random() * 1000;
    const finalDelay = delay + jitter;

    log("info", "hub_reconnect_scheduled", {
      channelId: this.channelId,
      attempt: this.reconnectCount,
      delayMs: Math.round(finalDelay),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, finalDelay);
    this.reconnectTimer.unref?.();
  }

  scheduleBatch() {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.flushBatch();
    }, BATCH_INTERVAL_MS);
    this.batchTimer.unref?.();
  }

  /**
   * 버퍼에 쌓인 메시지를 각 클라이언트에 전송합니다.
   *
   * dedup 옵션이 활성화된 세션(시청자 추첨용)은 동일 userIdHash(h)의 채팅 메시지를
   * seenSet으로 필터링하여 한 사람이 여러 번 참여하는 것을 방지합니다.
   * 후원(k="d") 메시지는 dedup 대상에서 제외됩니다(같은 사람이 여러 번 후원 가능).
   */
  flushBatch() {
    if (this.batchBuffer.length === 0) return;
    const items = this.batchBuffer;
    this.batchBuffer = [];

    for (const session of this.clients.values()) {
      if (session.ws.readyState !== WebSocket.OPEN) continue;

      let sendItems = items;
      if (session.dedup) {
        sendItems = items.filter((item) => {
          if (item.k !== "c") return true;
          if (session.seenSet.has(item.h)) return false;
          session.seenSet.add(item.h);
          return true;
        });
      }

      if (sendItems.length === 0) continue;
      sendWsMessage(session.ws, { type: "batch", items: sendItems });
      metrics.batchesSentTotal += 1;
      metrics.batchItemsSentTotal += sendItems.length;
    }
  }

  broadcastStatus(code, message) {
    for (const session of this.clients.values()) {
      sendWsMessage(session.ws, { type: "status", code, message });
    }
  }

  broadcastError(code, message) {
    for (const session of this.clients.values()) {
      closeWsWithError(session.ws, code, message);
    }
  }

  cleanupUpstreamTimers() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingInterval = null;
    this.pingTimeout = null;
  }

  close(reason) {
    if (this.destroyed) return;
    this.destroyed = true;
    metrics.hubCloseTotal += 1;

    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.mockInterval) clearInterval(this.mockInterval);
    this.mockInterval = null;
    this.cleanupUpstreamTimers();

    if (this.upstreamWs) {
      try {
        this.upstreamWs.close();
      } catch {}
      this.upstreamWs = null;
    }

    this.batchBuffer = [];
    channelHubs.delete(this.channelId);
    log("info", "hub_closed", {
      channelId: this.channelId,
      reason,
      lifetimeMs: Date.now() - this.createdAt,
    });
  }
}

function getOrCreateHub(channelId) {
  let hub = channelHubs.get(channelId);
  if (hub && !hub.destroyed) return hub;

  if (channelHubs.size >= MAX_CHANNEL_HUBS) return null;
  hub = new ChannelHub(channelId);
  channelHubs.set(channelId, hub);
  return hub;
}

// ─── 세션 등록 ─────────────────────────────────────────────────────────────────

/**
 * WebSocket 업그레이드가 완료된 직후 클라이언트 세션을 등록합니다.
 *
 * Redis 활성 카운터를 증가시킨 뒤 ChannelHub에 구독을 추가합니다.
 * WebSocket close/error 이벤트에서 cleanup을 호출하여 모든 카운터를 원상복구합니다.
 * Redis 증가 후 즉시 클라이언트가 끊어지는 경우를 대비해 cleanup 중복 실행을 방지합니다.
 */
async function registerSession(clientWs, channelId, dedup, clientIp) {
  const sessionId = ++sessionCounter;
  const session = {
    sessionId,
    ws: clientWs,
    channelId,
    clientIp,
    dedup,
    seenSet: dedup ? new Set() : null,
    createdAt: Date.now(),
  };

  activeSessions.set(sessionId, session);
  incrementMapCount(ipWsCounts, clientIp);
  incrementMapCount(channelWsCounts, channelId);
  metrics.wsConnectionsTotal += 1;

  let cleaned = false;
  let redisIpRegistered = false;
  let redisChannelRegistered = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    activeSessions.delete(sessionId);
    decrementMapCount(ipWsCounts, clientIp);
    decrementMapCount(channelWsCounts, channelId);
    if (redisIpRegistered) await redisDecrement(getActiveCounterKey("ip", clientIp));
    if (redisChannelRegistered) {
      await redisDecrement(getActiveCounterKey("channel", channelId));
    }
    metrics.wsClosedTotal += 1;

    const hub = channelHubs.get(channelId);
    if (hub) hub.unsubscribe(sessionId);
    if (session.seenSet) session.seenSet.clear();

    log("info", "session_end", {
      sessionId,
      channelId,
      clientIp,
      active: activeSessions.size,
    });
  }

  clientWs.on("close", () => void cleanup());
  clientWs.on("error", (err) => {
    log("warn", "client_ws_error", {
      sessionId,
      channelId,
      clientIp,
      error: err.message,
    });
    void cleanup();
  });

  // Redis 카운터를 증가시키고, 이미 cleanup된 경우 즉시 되돌립니다.
  const ipCount = await redisIncrement(
    getActiveCounterKey("ip", clientIp),
    ACTIVE_COUNTER_TTL_MS
  );
  redisIpRegistered = ipCount !== null;
  if (cleaned && redisIpRegistered) {
    await redisDecrement(getActiveCounterKey("ip", clientIp));
    redisIpRegistered = false;
  }

  const channelCount = await redisIncrement(
    getActiveCounterKey("channel", channelId),
    ACTIVE_COUNTER_TTL_MS
  );
  redisChannelRegistered = channelCount !== null;
  if (cleaned && redisChannelRegistered) {
    await redisDecrement(getActiveCounterKey("channel", channelId));
    redisChannelRegistered = false;
  }

  if (cleaned) return;

  log("info", "session_start", {
    sessionId,
    channelId,
    clientIp,
    dedup,
    active: activeSessions.size,
  });

  const hub = getOrCreateHub(channelId);
  if (!hub) {
    closeWsWithError(
      clientWs,
      "CHANNEL_HUB_LIMIT_EXCEEDED",
      "현재 열려 있는 채널이 많아 새 채널을 연결할 수 없습니다."
    );
    await cleanup();
    return;
  }

  const subscribed = hub.subscribe(session);
  if (!subscribed) {
    closeWsWithError(
      clientWs,
      "CHANNEL_CLIENT_LIMIT_EXCEEDED",
      "현재 이 채널에 연결된 사용자가 많아 새 세션을 열 수 없습니다."
    );
    await cleanup();
  }
}

/**
 * 분산 환경에서 특정 IP 또는 채널의 전체 활성 카운터를 Redis SCAN으로 집계합니다.
 * Redis 미사용 시 null을 반환하며, 호출자는 로컬 카운터로 폴백합니다.
 */
async function getDistributedActiveCount(kind, value) {
  if (!redis) return null;
  try {
    let cursor = "0";
    let total = 0;
    const pattern = getActiveCounterPattern(kind, value);

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        const values = await redis.mget(keys);
        for (const current of values) {
          total += parseInt(current || "0", 10) || 0;
        }
      }
    } while (cursor !== "0");

    return total;
  } catch (err) {
    metrics.redisErrorsTotal += 1;
    log("warn", "redis_active_count_failed", { kind, error: err.message });
    return null;
  }
}

// ─── 드레인 ────────────────────────────────────────────────────────────────────

function startDrain(reason) {
  if (isDraining) return false;
  isDraining = true;
  drainStartedAt = new Date().toISOString();
  metrics.drainsTotal += 1;

  for (const hub of channelHubs.values()) {
    hub.broadcastStatus(
      "SERVER_DRAINING",
      "Server is preparing for maintenance. Existing sessions will keep running briefly."
    );
  }

  log("info", "drain_start", {
    reason,
    activeSessions: activeSessions.size,
    activeHubs: channelHubs.size,
    drainTimeoutMs: DRAIN_TIMEOUT_MS,
  });
  return true;
}

function stopDrain(reason) {
  if (!isDraining) return false;
  isDraining = false;
  drainStartedAt = null;
  log("info", "drain_stop", {
    reason,
    activeSessions: activeSessions.size,
    activeHubs: channelHubs.size,
  });
  return true;
}

/** activeSessions가 0이 되거나 timeoutMs가 경과할 때까지 대기합니다. */
function waitForDrain(timeoutMs) {
  return new Promise((resolve) => {
    if (activeSessions.size === 0) {
      resolve();
      return;
    }

    const started = Date.now();
    const interval = setInterval(() => {
      if (activeSessions.size === 0 || Date.now() - started >= timeoutMs) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
    interval.unref?.();
  });
}

// ─── HTTP 서버 라우팅 ──────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);
  const clientIp = getClientIp(req);
  metrics.httpRequestsTotal += 1;

  if (!isOriginAllowed(req)) {
    log("warn", "origin_rejected", {
      clientIp,
      origin: req.headers.origin,
      path: parsedUrl.pathname,
    });
    writeJson(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
    return;
  }

  if (req.method === "OPTIONS") {
    writeJson(res, 204, {});
    return;
  }

  const httpLimit = await checkRateLimit("http", clientIp, HTTP_RATE_LIMIT_MAX);
  if (!httpLimit.allowed) {
    log("warn", "http_rate_limited", { clientIp, path: parsedUrl.pathname });
    writeRateLimit(res, httpLimit.resetAt);
    return;
  }

  if (parsedUrl.pathname === "/api/health") {
    writeJson(res, 200, {
      status: "ok",
      service: "cime-flow-relay",
      instanceId: INSTANCE_ID,
      ready: isRelayReady(),
      draining: isDraining,
      redisEnabled: Boolean(redis),
      sessions: activeSessions.size,
      hubs: channelHubs.size,
      activeChannels: channelWsCounts.size,
      maxSessions: MAX_SESSIONS,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  if (parsedUrl.pathname === "/api/ready") {
    const ready = isRelayReady();
    writeJson(res, ready ? 200 : 503, {
      status: ready ? "ready" : "not_ready",
      service: "cime-flow-relay",
      instanceId: INSTANCE_ID,
      draining: isDraining,
      drainStartedAt,
      sessions: activeSessions.size,
      hubs: channelHubs.size,
      maxSessions: MAX_SESSIONS,
      maxChannelHubs: MAX_CHANNEL_HUBS,
    });
    return;
  }

  // ADMIN_TOKEN이 설정되지 않은 경우 드레인 API를 외부에 노출하지 않습니다.
  if (parsedUrl.pathname === "/api/drain") {
    if (req.method !== "POST" && req.method !== "DELETE") {
      writeJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (!ADMIN_TOKEN) {
      writeJson(res, 404, { error: "NOT_FOUND" });
      return;
    }
    if (!hasBearerToken(req, ADMIN_TOKEN)) {
      writeJson(res, 401, { error: "UNAUTHORIZED" });
      return;
    }

    const changed =
      req.method === "POST" ? startDrain("api") : stopDrain("api");
    writeJson(res, 202, {
      status:
        req.method === "POST"
          ? changed
            ? "draining"
            : "already_draining"
          : changed
            ? "ready"
            : "already_ready",
      service: "cime-flow-relay",
      instanceId: INSTANCE_ID,
      drainStartedAt,
      draining: isDraining,
      activeSessions: activeSessions.size,
      drainTimeoutMs: DRAIN_TIMEOUT_MS,
    });
    return;
  }

  // /api/metrics: JSON 스냅샷, /metrics: Prometheus exposition format
  if (parsedUrl.pathname === "/api/metrics") {
    if (!hasBearerToken(req, METRICS_TOKEN)) {
      writeJson(res, 401, { error: "UNAUTHORIZED" });
      return;
    }
    writeJson(res, 200, getMetricsSnapshot());
    return;
  }

  if (parsedUrl.pathname === "/metrics") {
    if (!hasBearerToken(req, METRICS_TOKEN)) {
      writeText(res, 401, "unauthorized\n");
      return;
    }
    writeText(
      res,
      200,
      getPrometheusMetrics(),
      "text/plain; version=0.0.4; charset=utf-8"
    );
    return;
  }

  if (isDraining) {
    writeJson(res, 503, {
      error: "SERVER_DRAINING",
      message: "Relay is preparing for maintenance. Try another instance.",
    });
    return;
  }

  if (parsedUrl.pathname === "/api/cime/channel" && req.method === "GET") {
    const lookupLimit = await checkRateLimit(
      "channel_lookup",
      clientIp,
      CHANNEL_LOOKUP_RATE_LIMIT_MAX
    );
    if (!lookupLimit.allowed) {
      log("warn", "channel_lookup_rate_limited", { clientIp });
      writeRateLimit(res, lookupLimit.resetAt);
      return;
    }

    const { handle, channelId } = parsedUrl.query;
    if (channelId) {
      const resolved = await resolveById(String(channelId));
      if (!resolved) return writeJson(res, 404, { error: "CHANNEL_NOT_FOUND" });
      return writeJson(res, 200, resolved);
    }
    if (!handle) return writeJson(res, 400, { error: "CHANNEL_QUERY_REQUIRED" });
    const resolved = await resolveByHandle(String(handle));
    if (!resolved) return writeJson(res, 404, { error: "CHANNEL_NOT_FOUND" });
    return writeJson(res, 200, resolved);
  }

  writeJson(res, 404, { error: "Not found" });
});

// ─── WebSocket 업그레이드 ──────────────────────────────────────────────────────

const wss = new WebSocket.Server({ noServer: true });

/**
 * HTTP → WebSocket 업그레이드 요청을 처리합니다.
 * URL 형식: /api/ws/chat/{channelId}[?dedup=1]
 *
 * 업그레이드 전 여러 가드를 순차 실행합니다:
 *   1. URL 패턴 검사
 *   2. CORS 오리진 검사
 *   3. 드레인 여부
 *   4. IP 레이트 리밋
 *   5. IP당 동시 WebSocket 수 (로컬 + 분산)
 *   6. 전체 세션 수
 *   7. 채널당 클라이언트 수 (로컬 + 분산)
 *   8. 채널 허브 수
 */
server.on("upgrade", async (request, socket, head) => {
  const { pathname, query } = parse(request.url, true);
  const match = pathname.match(/^\/api\/ws\/chat\/(.+)$/);
  const clientIp = getClientIp(request);
  metrics.wsUpgradeTotal += 1;

  function reject(status, error) {
    metrics.wsRejectedTotal += 1;
    socket.write(
      `HTTP/1.1 ${status}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify({ error })
    );
    socket.destroy();
  }

  if (!match) {
    socket.destroy();
    return;
  }

  if (!isOriginAllowed(request)) {
    log("warn", "ws_origin_rejected", {
      clientIp,
      origin: request.headers.origin,
    });
    reject("403 Forbidden", "ORIGIN_NOT_ALLOWED");
    return;
  }

  if (isDraining) {
    log("warn", "ws_draining_rejected", { clientIp });
    reject("503 Service Unavailable", "SERVER_DRAINING");
    return;
  }

  const wsLimit = await checkRateLimit("ws_upgrade", clientIp, MAX_WS_PER_IP);
  if (!wsLimit.allowed) {
    log("warn", "ws_rate_limited", { clientIp });
    reject("429 Too Many Requests", "RATE_LIMITED");
    return;
  }

  const channelId = decodeURIComponent(match[1]);

  // 분산 카운터를 우선 사용하고, Redis 미사용 시 로컬 카운터로 폴백합니다.
  const activeForIp =
    (await getDistributedActiveCount("ip", clientIp)) ?? (ipWsCounts.get(clientIp) || 0);
  if (activeForIp >= MAX_WS_PER_IP) {
    log("warn", "ip_ws_limit_exceeded", {
      clientIp,
      activeForIp,
      maxWsPerIp: MAX_WS_PER_IP,
    });
    reject("503 Service Unavailable", "IP_WS_LIMIT_EXCEEDED");
    return;
  }

  if (activeSessions.size >= MAX_SESSIONS) {
    log("warn", "session_limit_exceeded", { clientIp, maxSessions: MAX_SESSIONS });
    reject("503 Service Unavailable", "SESSION_LIMIT_EXCEEDED");
    return;
  }

  const localHub = channelHubs.get(channelId);
  const localClientCount = localHub ? localHub.clients.size : 0;
  const activeForChannel =
    (await getDistributedActiveCount("channel", channelId)) ?? localClientCount;
  if (activeForChannel >= MAX_CLIENTS_PER_CHANNEL) {
    log("warn", "channel_distributed_client_limit_exceeded", {
      clientIp,
      channelId,
      activeForChannel,
      maxClientsPerChannel: MAX_CLIENTS_PER_CHANNEL,
    });
    reject("503 Service Unavailable", "CHANNEL_CLIENT_LIMIT_EXCEEDED");
    return;
  }

  if (localClientCount >= MAX_CLIENTS_PER_CHANNEL) {
    log("warn", "channel_client_limit_exceeded", {
      clientIp,
      channelId,
      maxClientsPerChannel: MAX_CLIENTS_PER_CHANNEL,
    });
    reject("503 Service Unavailable", "CHANNEL_CLIENT_LIMIT_EXCEEDED");
    return;
  }

  if (!localHub && channelHubs.size >= MAX_CHANNEL_HUBS) {
    log("warn", "channel_hub_limit_exceeded", {
      clientIp,
      channelId,
      maxChannelHubs: MAX_CHANNEL_HUBS,
    });
    reject("503 Service Unavailable", "CHANNEL_HUB_LIMIT_EXCEEDED");
    return;
  }

  wss.handleUpgrade(request, socket, head, (clientWs) => {
    const dedup = query.dedup === "1";
    void registerSession(clientWs, channelId, dedup, clientIp);
  });
});

// ─── 프로세스 수명 주기 ────────────────────────────────────────────────────────

/**
 * SIGTERM/SIGINT 수신 시 그레이스풀 드레인을 수행합니다.
 *
 * 순서:
 *   1. isDraining = true → 신규 HTTP/WebSocket 요청 거부
 *   2. HTTP 서버 close (신규 TCP 연결 거부)
 *   3. activeSessions가 0이 될 때까지 대기 (최대 DRAIN_TIMEOUT_MS)
 *   4. 남은 세션에 SERVER_SHUTDOWN 에러 전송 후 강제 종료
 *   5. Redis 헤어트비트 업데이트 후 quit
 */
async function gracefulShutdown(signal) {
  const firstDrain = startDrain(signal);
  log("info", "shutdown_start", {
    signal,
    firstDrain,
    activeSessions: activeSessions.size,
    activeHubs: channelHubs.size,
  });

  // 최대 대기 시간을 초과하면 강제 종료합니다 (무한 대기 방지).
  const forceExitTimer = setTimeout(
    () => process.exit(1),
    DRAIN_TIMEOUT_MS + 10000
  );
  forceExitTimer.unref?.();

  await new Promise((resolve) => server.close(resolve));
  await waitForDrain(DRAIN_TIMEOUT_MS);

  if (activeSessions.size > 0) {
    for (const hub of channelHubs.values()) {
      hub.broadcastError(
        "SERVER_SHUTDOWN",
        "Server maintenance is starting now. Please reconnect shortly."
      );
      hub.close("shutdown");
    }
    await sleep(250);
  }

  await refreshInstanceHeartbeat();
  if (redis) {
    try {
      await redis.quit();
    } catch {}
  }
  log("info", "shutdown_complete");
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  log("error", "uncaught_exception", { error: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { reason: String(reason) });
});

// ─── 진입점 ────────────────────────────────────────────────────────────────────

async function main() {
  if (!METRICS_TOKEN) {
    log("warn", "metrics_unprotected", {
      message:
        "METRICS_TOKEN is not set. /metrics is publicly accessible. Set METRICS_TOKEN in production.",
    });
  }
  if (!ADMIN_TOKEN) {
    log("warn", "admin_drain_disabled", {
      message:
        "ADMIN_TOKEN is not set. /api/drain endpoint is disabled. Set ADMIN_TOKEN to enable remote drain.",
    });
  }
  if (CORS_ORIGIN === "*") {
    log("warn", "cors_open", {
      message:
        "CORS_ORIGIN is set to '*'. All origins are allowed. Restrict CORS_ORIGIN in production.",
    });
  }
  await initRedis();
  await refreshInstanceHeartbeat();
  server.listen(RELAY_PORT, () => {
    log("info", "relay_ready", {
      port: RELAY_PORT,
      maxSessions: MAX_SESSIONS,
      maxChannelHubs: MAX_CHANNEL_HUBS,
      maxClientsPerChannel: MAX_CLIENTS_PER_CHANNEL,
      maxWsPerIp: MAX_WS_PER_IP,
      redisEnabled: Boolean(redis),
      corsOrigin: CORS_ORIGIN,
      trustProxy: TRUST_PROXY,
      metricsProtected: Boolean(METRICS_TOKEN),
      adminDrainEnabled: Boolean(ADMIN_TOKEN),
      mockCimeUpstream: MOCK_CIME_UPSTREAM,
    });
  });
}

main().catch((err) => {
  log("error", "relay_start_failed", { error: err.message, stack: err.stack });
  process.exit(1);
});
