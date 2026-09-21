import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages load native/WASM assets from disk at runtime and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "unpdf", "mammoth", "nodemailer"],
  experimental: {
    // Large PDF/DOCX/CSV uploads go through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
