import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV !== 'production' && {
    allowedDevOrigins: ['jobhunt.local'],
  }),
};

export default nextConfig;
