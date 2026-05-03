import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    styledComponents: true,
  },
  turbopack: {
    root: __dirname,
  },
  eslint: {
    dirs: ["app", "lib", "styles", "types"],
  },

  /**
   * 보안 응답 헤더
   * 클릭재킹, MIME 스니핑, 레퍼러 유출 등 기본 웹 공격을 방어합니다.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 클릭재킹 방지: 이 페이지를 iframe으로 삽입하는 것을 금지합니다.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // MIME 스니핑 방지: 브라우저가 Content-Type을 임의로 추측하지 않도록 합니다.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // DNS 프리페치 비활성화: 방문 페이지 정보 유출을 최소화합니다.
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // 레퍼러 정책: 동일 오리진 내에서만 전체 URL을 전송하고, 외부로는 오리진만 전송합니다.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 브라우저 기능 권한 제한: 불필요한 API 접근을 차단합니다.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

