import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    output: "export",
    basePath,
    assetPrefix:
      basePath && phase !== PHASE_DEVELOPMENT_SERVER
        ? "/_zones/property-tax-relief"
        : undefined,
    trailingSlash: true,
    images: { unoptimized: true },
    experimental: { cpus: 4 },
  };
}
