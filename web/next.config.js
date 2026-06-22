/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Firebase App Hosting / Hosting framework deploy handles SSR.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
