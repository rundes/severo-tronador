import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a este proyecto (hay otro lockfile en el home
  // del usuario que Next, si no, infiere como raíz).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
