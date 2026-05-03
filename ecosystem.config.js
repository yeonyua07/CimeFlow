/**
 * PM2 프로세스 설정 파일
 *
 * ⚠️  보안 주의사항:
 *   이 파일에 METRICS_TOKEN, ADMIN_TOKEN, REDIS_URL 등
 *   민감한 시크릿 값을 직접 입력하지 마세요.
 *   프로덕션에서는 .env.local 또는 환경 변수 주입 방식을 사용하거나,
 *   아래 env 블록의 값을 빈 문자열로 유지하고 OS 환경 변수로 전달하세요.
 */
module.exports = {
  apps: [
    {
      name: "cime-flow-ui",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXT_PUBLIC_CIME_RELAY_HTTP_URL: "http://localhost:3001",
        NEXT_PUBLIC_CIME_RELAY_WS_URL: "ws://localhost:3001",
      },
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      out_file: "./logs/ui-out.log",
      error_file: "./logs/ui-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "cime-flow-relay",
      script: "relay-server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        RELAY_PORT: 3001,
        INSTANCE_ID: "",
        MAX_SESSIONS: 1000,
        MAX_CHANNEL_HUBS: 300,
        MAX_CLIENTS_PER_CHANNEL: 100,
        MAX_WS_PER_IP: 50,
        RATE_LIMIT_WINDOW_MS: 60000,
        HTTP_RATE_LIMIT_MAX: 240,
        CHANNEL_LOOKUP_RATE_LIMIT_MAX: 60,
        CHANNEL_IDLE_TTL_MS: 30000,
        BATCH_INTERVAL_MS: 100,
        CORS_ORIGIN: "*",
        TRUST_PROXY: false,
        REDIS_URL: "",
        REDIS_CONNECT_TIMEOUT_MS: 1500,
        // ⚠️  아래 토큰들을 이 파일에 직접 입력하지 마세요.
        // .env.local 또는 OS 환경 변수로 주입하세요.
        METRICS_TOKEN: "",
        ADMIN_TOKEN: "",
        DRAIN_TIMEOUT_MS: 30000,
        LOG_IP_MODE: "hash",
        IP_HASH_SALT: "",
        MOCK_CIME_UPSTREAM: false,
        MOCK_MESSAGE_INTERVAL_MS: 100,
      },
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      out_file: "./logs/relay-out.log",
      error_file: "./logs/relay-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
