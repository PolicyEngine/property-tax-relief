import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StateProfile, CoverageAudit } from "./types";

export function loadStates(): StateProfile[] {
  const directory = join(process.cwd(), "data/states");
  return readdirSync(directory)
    .filter((f) => f.endsWith(".json"))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(directory, file), "utf8")) as StateProfile,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loadCoverage(): CoverageAudit | null {
  const file = join(process.cwd(), "public/data/coverage.json");
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as CoverageAudit)
    : null;
}
