import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPolicyEngineApiClient } from "@policyengine/api-client";
import { buildHousehold, readModelResult } from "../lib/calculator";
import { loadCalculatorPrograms } from "../lib/calculatorData";
import type { ValidationCase } from "./calculator_receipts";

type Fixture = ValidationCase & {
  expectedSupplemental?: { label: string; value: number }[];
};

const cases = JSON.parse(
  readFileSync("data/calculator/candidates/cases.json", "utf8"),
) as Fixture[];
const programs = loadCalculatorPrograms({ includeCandidates: true }).filter(
  ({ runtime }) => runtime === "candidate",
);
assert(programs.length > 0, "Set PROPERTY_TAX_CANDIDATE_DIR");
assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length);
assert.deepEqual(
  [...new Set(cases.map(({ programId }) => programId))].sort(),
  programs.map(({ id }) => id).sort(),
);

const client = createPolicyEngineApiClient({
  baseUrl: "http://127.0.0.1:3085/__candidate",
});
const rows = [];
for (const fixture of cases) {
  const program = programs.find(({ id }) => id === fixture.programId)!;
  const household = buildHousehold(program, fixture.inputs);
  const request = { country: "us" as const, household };
  const payload = await client.calculateHousehold(request, {
    signal: AbortSignal.timeout(120_000),
  });
  const result = readModelResult(program, payload);
  if (program.kind === "assessed-value-exemption") {
    // Verify the country test's cent tolerance and the preview's whole-dollar display.
    assert(Math.abs(result.value - fixture.expectedValue) <= 0.01, fixture.id);
    assert.equal(Math.round(result.value), Math.round(fixture.expectedValue));
  } else {
    assert.equal(result.value, fixture.expectedValue, fixture.id);
  }
  assert.deepEqual(
    result.supplemental,
    fixture.expectedSupplemental,
    fixture.id,
  );
  rows.push({
    id: fixture.id,
    programId: program.id,
    source: fixture.source,
    sourceLocation: fixture.sourceLocation,
    expectedValue: fixture.expectedValue,
    request,
    value: result.value,
    supplemental: result.supplemental,
  });
}
console.log(
  JSON.stringify({ evidence: "local-candidate", cases: rows }, null, 2),
);
