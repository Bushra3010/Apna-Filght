import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the floating dev badge covers bottom-left buttons; it never shows in production
  devIndicators: false,
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
