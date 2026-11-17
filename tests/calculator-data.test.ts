import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createPolicyEngineApiClient } from "@policyengine/api-client";
import type { CalculatorProgram } from "../lib/calculator";
import {
  assertIdentityUnchanged,
  canonicalJson,
  createBatchReceipt,
  createValidationManifest,
  DASHBOARD_CALCULATION_URL,
  mergeBatchReceipts,
  observeDashboardRequest,
  readValidationIdentity,
  recordObservation,
  selectBatch,
  semanticHash,
  validateMergedReceipt,
  type ValidationCase,
  type ValidationIdentity,
} from "../scripts/calculator_receipts";
import { readFileSync } from "node:fs";
import {
  buildHousehold,
  CALCULATOR_YEAR,
  validateInputs,
} from "../lib/calculator";
import {
  loadCalculatorContracts,
  loadCalculatorPrograms,
} from "../lib/calculatorData";
import { loadStates } from "../lib/loadResearch";
import metadata from "../data/calculator/model-metadata.json";
import receipt from "../data/calculator/validation-receipt.json";

describe("calculator source contracts", () => {
  it("keeps Hawaii unavailable when the preview cannot represent claimability", () => {
    const program = loadCalculatorPrograms().find(
      (item) => item.id === "hi-low-income-household-renters-credit",
    )!;
    expect(program).toMatchObject({
      state: "HI",
      modelVariable: null,
      entity: null,
      inputs: [],
      unavailableReason: "unverified-dependency-rule",
    });
    expect(program.sources[0].url).toContain("/forms/2025/n11ins.pdf");
    expect(program.notes.join(" ")).toContain("could claim you");
    expect(() => buildHousehold(program, {})).toThrow("unsupported-program");
  });

  it("preserves every selected inventory record and all 51 jurisdictions", () => {
    const states = loadStates();
    const programs = loadCalculatorPrograms();
    expect(states).toHaveLength(51);
    expect(programs.map((p) => p.id).sort()).toEqual(
      states.flatMap((s) => s.programs.map((p) => p.id)).sort(),
    );
    for (const program of programs) {
      expect(program.unavailableReason === null).toBe(
        Boolean(program.modelVariable && program.entity),
      );
      if (program.unavailableReason)
        expect(() => buildHousehold(program, {})).toThrow(
          "unsupported-program",
        );
    }
  });

  it("uses the audited model's entities, currencies and source code receipts", () => {
    const variables: Record<
      string,
      { entity: string; unit: string | null; valueType: string }
    > = metadata.variables;
    for (const contract of loadCalculatorContracts()) {
      expect(contract.year).toBe(CALCULATOR_YEAR);
      expect(contract.sourceEvidence.packageVersion).toBe(
        metadata.modelVersion,
      );
      expect(contract.sourceEvidence.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(variables[contract.modelVariable!]).toMatchObject({
        entity: contract.entity,
        unit: "currency-USD",
        valueType: "float",
      });
      const names = contract.inputs.map((f) => f.variable);
      expect(new Set(names).size).toBe(names.length);
      expect(names).not.toContain(contract.modelVariable);
      for (const input of contract.inputs) {
        expect(variables[input.variable].entity).toBe(input.entity);
        expect([
          "state_code",
          "filing_status",
          "is_tax_unit_head",
          "is_tax_unit_spouse",
          "is_tax_unit_dependent",
        ]).not.toContain(input.variable);
      }
    }
  });

  it("has no silent defaults for any enabled program", () => {
    for (const program of loadCalculatorPrograms().filter(
      (p) => !p.unavailableReason,
    )) {
      expect(program.inputs.length).toBeGreaterThan(0);
      expect(validateInputs(program, {})).toEqual(
        program.inputs.map((f) => f.variable),
      );
      expect(() => buildHousehold(program, {})).toThrow("incomplete-inputs");
    }
  });

  it("records source-derived cases only for matching enabled contracts", () => {
    const cases = JSON.parse(
      readFileSync("data/calculator/validation-cases.json", "utf8"),
    );
    const programs = loadCalculatorPrograms();
    const seen = new Set<string>();
    for (const example of cases) {
      expect(seen.has(example.id)).toBe(false);
      seen.add(example.id);
      const program = programs.find((p) => p.id === example.programId)!;
      expect(program).toBeDefined();
      expect(validateInputs(program, example.inputs)).toEqual([]);
      expect(Number.isFinite(example.expectedValue)).toBe(true);
      expect(example.source).toMatch(/^https:\/\//);
    }
  });

  it("matches every enabled contract and source case to a successful live receipt", () => {
    const cases = JSON.parse(
      readFileSync("data/calculator/validation-cases.json", "utf8"),
    );
    const manifest = createValidationManifest(
      cases,
      loadCalculatorPrograms(),
      readValidationIdentity(),
      metadata.sourceSha256,
    );
    const bound = validateMergedReceipt(receipt, manifest);
    expect(bound.evidenceKind).toBe("live-dashboard");
    expect(bound.runtimeModelVersion).toBeNull();
    expect(bound.metadataSnapshotSha256).toBe(metadata.sourceSha256);
    expect(bound.results.map((row) => row.id).sort()).toEqual(
      cases.map((example: { id: string }) => example.id).sort(),
    );
    for (const example of cases) {
      const actual = bound.results.find((row) => row.id === example.id)!;
      expect(actual).toMatchObject({
        programId: example.programId,
        inputs: example.inputs,
        expectedValue: example.expectedValue,
        value: example.expectedValue,
        pass: true,
      });
    }
    for (const program of loadCalculatorPrograms().filter(
      (p) => !p.unavailableReason,
    )) {
      expect(bound.results.some((row) => row.programId === program.id)).toBe(
        true,
      );
    }
  });
});

// MOCK transport evidence only. These7s do not represent a public benefit output.
const MOCK_IDENTITY = Object.fromEntries(
  [
    "contractsSha256",
    "adapterSha256",
    "casesSha256",
    "metadataFileSha256",
    "harnessSha256",
    "helperSha256",
    "apiClientSha256",
  ].map((key) => [key, "a".repeat(64)]),
) as ValidationIdentity;
const MOCK_PROGRAM: CalculatorProgram = {
  id: "mock-transport",
  state: "IN",
  name: "MOCK transport fixture",
  modelVariable: "mock_credit",
  entity: "tax_unit",
  kind: "credit",
  inputs: [
    {
      variable: "rent",
      label: "MOCK input",
      entity: "person",
      kind: "money",
      period: 2025,
    },
  ],
  notes: [],
  sources: [],
  unavailableReason: null,
};
const MOCK_CASES: ValidationCase[] = Array.from({ length: 31 }, (_, n) => ({
  id: `mock-${String(n).padStart(2, "0")}`,
  programId: MOCK_PROGRAM.id,
  inputs: { rent: String(n) },
  expectedValue: 7,
  source: "https://example.invalid/mock-transport",
  sourceLocation: "MOCK fixture; no statutory amount",
}));
const mockManifest = () =>
  createValidationManifest(
    MOCK_CASES,
    [MOCK_PROGRAM],
    MOCK_IDENTITY,
    "b".repeat(64),
    "MOCK transport scope",
    "mock-transport",
  );
const MOCK_BODY = JSON.stringify({
  status: "ok",
  result: { tax_units: { tax_unit: { mock_credit: { "2025": 7 } } } },
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const mockBatches = () => {
  const manifest = mockManifest();
  return [0, 1, 2].map((index) => {
    const ids = selectBatch(manifest, index);
    return createBatchReceipt(
      manifest,
      ids,
      ids.map((id) =>
        recordObservation(
          manifest,
          id,
          JSON.stringify(
            manifest.cases.find((c) => c.example.id === id)!.request,
          ),
          MOCK_BODY,
          200,
          "2026-11-17T00:00:00.000Z",
        ),
      ),
    );
  });
};

describe("calculator validation receipt provenance", () => {
  it("deterministically merges31 observed mock tuples from15/15/1 batches", () => {
    const m = mockManifest();
    const batches = mockBatches();
    expect(batches.map((b) => b.results.length)).toEqual([15, 15, 1]);
    const merged = mergeBatchReceipts(batches, m);
    expect(merged.results).toHaveLength(31);
    expect(merged.evidenceKind).toBe("mock-transport");
    expect(merged.metadataSnapshotSha256).toBe(m.metadataSnapshotSha256);
    expect(merged.qualificationScope).toBe(m.qualificationScope);
    expect(merged.runtimeModelVersion).toBeNull();
    expect(merged.results.every((r) => r.runtimeModelVersion === null)).toBe(
      true,
    );
    expect(mergeBatchReceipts([...batches].reverse(), m)).toEqual(merged);
    expect(validateMergedReceipt(merged, m)).toEqual(merged);
    expect(() => selectBatch(m, 0, 16)).toThrow("invalid-batch-selection");
  });
  it("rejects duplicate, missing, unknown, failed and unobserved tuples", () => {
    const m = mockManifest();
    const batches = mockBatches();
    expect(() => mergeBatchReceipts([...batches, batches[0]], m)).toThrow(
      "duplicate-validation-case",
    );
    expect(() => mergeBatchReceipts(batches.slice(0, 2), m)).toThrow(
      "incomplete-validation-receipt",
    );
    for (const [error, change] of [
      [
        "unknown-observation",
        (b: typeof batches) => {
          b[0].results[0].id = "unknown";
        },
      ],
      [
        "validation-observation-differs",
        (b: typeof batches) => {
          b[0].results[0].pass = false;
        },
      ],
      [
        "unobserved-validation-tuple",
        (b: typeof batches) => {
          delete (b[0].results[0] as Partial<(typeof b)[0]["results"][0]>)
            .request;
        },
      ],
      [
        "observation-bytes-differ",
        (b: typeof batches) => {
          b[0].results[0].response.body += " ";
        },
      ],
      [
        "validation-observation-differs",
        (b: typeof batches) => {
          b[0].results[0].expectedValue = 99;
        },
      ],
    ] as const) {
      const changed = clone(batches);
      change(changed);
      expect(() => mergeBatchReceipts(changed, m)).toThrow(error);
    }
    expect(() => validateMergedReceipt({ results: [] }, m)).toThrow(
      "no-validation-batches",
    );
  });
  it("rejects mixed scopes, metadata, manifests and source identities", () => {
    const m = mockManifest();
    const batches = mockBatches();
    for (const [error, change] of [
      [
        "validation-context-differs",
        (b: typeof batches) => {
          b[0].qualificationScope = "other scope";
        },
      ],
      [
        "validation-context-differs",
        (b: typeof batches) => {
          b[0].metadataSnapshotSha256 = "f".repeat(64);
        },
      ],
      [
        "validation-source-changed",
        (b: typeof batches) => {
          b[0].validationIdentity.adapterSha256 = "f".repeat(64);
        },
      ],
      [
        "validation-context-differs",
        (b: typeof batches) => {
          b[0].manifestSha256 = "f".repeat(64);
        },
      ],
    ] as const) {
      const changed = clone(batches);
      change(changed);
      expect(() => mergeBatchReceipts(changed, m)).toThrow(error);
    }
    const changedProgram = clone(MOCK_PROGRAM);
    changedProgram.inputs[0].entity = "tax_unit";
    const changed = createValidationManifest(
      MOCK_CASES,
      [changedProgram],
      MOCK_IDENTITY,
      m.metadataSnapshotSha256,
      m.qualificationScope,
      "mock-transport",
    );
    expect(() => mergeBatchReceipts(batches, changed)).toThrow(
      "validation-context-differs",
    );
  });
  it("keeps semantic hashes stable under object-key ordering", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^[a-z]{1,8}$/), fc.integer()),
        (fields) => {
          const a = {
            country: "us",
            household: {
              tax_units: { tax_unit: { ...fields, output: { "2025": null } } },
            },
          };
          const b = {
            household: {
              tax_units: {
                tax_unit: Object.fromEntries(
                  Object.entries(a.household.tax_units.tax_unit).reverse(),
                ),
              },
            },
            country: "us",
          };
          expect(semanticHash(a)).toBe(semanticHash(b));
          expect(canonicalJson(a)).toBe(canonicalJson(b));
        },
      ),
      { numRuns: 100, seed: 20261117 },
    );
  });
  it("rejects observed entity, period and structural mutations", () => {
    const m = mockManifest();
    const expected = m.cases[0];
    const bodies = [
      clone(expected.request),
      clone(expected.request),
      clone(expected.request),
    ];
    bodies[0].household.tax_units.tax_unit.rent =
      bodies[0].household.people.claimant.rent;
    delete bodies[0].household.people.claimant.rent;
    bodies[1].household.people.claimant.rent = { "2024": 0 };
    bodies[2].household.tax_units.tax_unit.filing_status = { "2025": "JOINT" };
    for (const body of bodies) {
      expect(semanticHash(body)).not.toBe(expected.requestSha256);
      expect(() =>
        recordObservation(
          m,
          expected.example.id,
          JSON.stringify(body),
          MOCK_BODY,
          200,
          "2026-11-17T00:00:00Z",
        ),
      ).toThrow("observed-request-differs");
    }
  });
  it("captures the actual official-client request and raw response without headers", async () => {
    const m = mockManifest();
    const expected = m.cases[0];
    const fakeFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(MOCK_BODY, {
          headers: { authorization: "FAKE_HEADER_NOT_RECORDED" },
        }),
    );
    const check = vi.fn();
    const observed = observeDashboardRequest(
      m,
      expected.example.id,
      fakeFetch,
      check,
    );
    expect(() => observed.observation()).toThrow("unobserved-validation-tuple");
    const client = createPolicyEngineApiClient({ fetch: observed.fetch });
    await client.calculateHousehold(expected.request);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(fakeFetch.mock.calls[0][0]).toBe(DASHBOARD_CALCULATION_URL);
    expect(check).toHaveBeenCalledTimes(2);
    expect(observed.observation().response.body).toBe(MOCK_BODY);
    expect(observed.observation().request.semanticSha256).toBe(
      expected.requestSha256,
    );
    expect(JSON.stringify(observed.observation())).not.toContain("FAKE_HEADER");
  });
  it("rejects source changes during a response and never records that observation", async () => {
    const m = mockManifest();
    const expected = m.cases[0];
    let current = clone(MOCK_IDENTITY);
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      current.adapterSha256 = "f".repeat(64);
      return new Response(MOCK_BODY);
    });
    const observed = observeDashboardRequest(
      m,
      expected.example.id,
      fakeFetch,
      () => assertIdentityUnchanged(MOCK_IDENTITY, current),
    );
    await expect(
      observed.fetch(DASHBOARD_CALCULATION_URL, {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify(expected.request),
      }),
    ).rejects.toThrow("validation-source-changed");
    expect(() => observed.observation()).toThrow("unobserved-validation-tuple");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
  it("refuses an altered request before sending or recording anything", async () => {
    const m = mockManifest();
    const fakeFetch = vi.fn<typeof fetch>();
    const observed = observeDashboardRequest(
      m,
      m.cases[0].example.id,
      fakeFetch,
      () => {},
    );
    await expect(
      observed.fetch(DASHBOARD_CALCULATION_URL, {
        method: "POST",
        credentials: "omit",
        body: "{}",
      }),
    ).rejects.toThrow("observed-request-differs");
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(() => observed.observation()).toThrow("unobserved-validation-tuple");
  });
});
