/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lighter production bundles.
  compiler: {
    removeConsole: { exclude: ["error", "warn"] },
  },
  // Firebase Hosting framework deploy handles SSR.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    optimizePackageImports: ["firebase", "chart.js", "react-chartjs-2"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        // Long-cache immutable build assets → snappy repeat loads.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;
