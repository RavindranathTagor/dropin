import os from "os";
import type { NextConfig } from "next";

function lanHosts() {
  const hosts: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = entry.family as string | number;
      if (entry.internal || (family !== "IPv4" && family !== 4)) continue;
      hosts.push(entry.address);
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  allowedDevOrigins: lanHosts(),
};

export default nextConfig;
