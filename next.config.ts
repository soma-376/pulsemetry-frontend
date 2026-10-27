import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/auth/callback",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // 주소에 초대 코드가 있으므로 외부로 나가는 Referer에 싣지 않는다.
        source: "/install",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
