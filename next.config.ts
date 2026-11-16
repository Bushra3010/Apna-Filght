import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the floating dev badge covers bottom-left buttons; it never shows in production
  devIndicators: false,
  experimental: {
    // imports send mapped spreadsheet rows to a server action (Vercel caps bodies at 4.5 MB)
    serverActions: { bodySizeLimit: '4mb' },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
