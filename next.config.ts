import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (
    process.env.PROPERTY_TAX_CANDIDATE_DIR &&
    (process.env.VERCEL || basePath)
  )
    throw new Error("Candidate model data is available only in a local build");
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
