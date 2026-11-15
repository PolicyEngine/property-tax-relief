import { describe, expect, it } from "vitest";
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
    expect(receipt.runtimeModelVersion).toBeNull();
    expect(receipt.metadataSnapshotSha256).toBe(metadata.sourceSha256);
    expect(receipt.results.map((row) => row.id).sort()).toEqual(
      cases.map((example: { id: string }) => example.id).sort(),
    );
    for (const example of cases) {
      const actual = receipt.results.find((row) => row.id === example.id)!;
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
      expect(receipt.results.some((row) => row.programId === program.id)).toBe(
        true,
      );
    }
  });
});
