import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCoverage, loadStates } from "./loadResearch";
import { isComparisonProgram } from "./inventory";
import { CALCULATOR_YEAR, type CalculatorProgram } from "./calculator";
import metadataSnapshot from "../data/calculator/model-metadata.json";

interface Contract extends Pick<
  CalculatorProgram,
  | "id"
  | "state"
  | "modelVariable"
  | "entity"
  | "kind"
  | "inputs"
  | "notes"
  | "resultLabel"
  | "resultNote"
> {
  year: number;
  sourceEvidence: { packageVersion: string; file: string; sha256: string };
  sources?: { title: string; url: string }[];
}

interface HeldProgram {
  id: string;
  state: string;
  year: number;
  reason: string;
  notes: string[];
  sources: { title: string; url: string }[];
}

export function loadCalculatorContracts(): Contract[] {
  const document = JSON.parse(
    readFileSync(join(process.cwd(), "data/calculator/contracts.json"), "utf8"),
  ) as {
    metadataVersion: string;
    metadataSha256: string;
    contracts: Contract[];
  };
  if (
    document.metadataVersion !== metadataSnapshot.modelVersion ||
    document.metadataSha256 !== metadataSnapshot.sourceSha256
  )
    throw new Error("calculator-metadata-mismatch");
  const ids = document.contracts.map((contract) => contract.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("duplicate-calculator-contract");
  const variables = metadataSnapshot.variables as Record<
    string,
    {
      entity: string;
      unit: string | null;
      valueType: string;
      definitionPeriod: string;
      possibleValues?: { value: string }[];
    }
  >;
  for (const contract of document.contracts) {
    const output = contract.modelVariable
      ? variables[contract.modelVariable]
      : undefined;
    if (
      !output ||
      output.entity !== contract.entity ||
      output.unit !== "currency-USD" ||
      output.valueType !== "float" ||
      output.definitionPeriod !== "year" ||
      (contract.kind === "assessed-value-exemption" &&
        (!contract.resultLabel || !contract.resultNote)) ||
      contract.sourceEvidence.packageVersion !== document.metadataVersion ||
      !/^[a-f0-9]{64}$/.test(contract.sourceEvidence.sha256)
    )
      throw new Error("invalid-calculator-contract");
    const fields = new Set<string>();
    for (const field of contract.inputs) {
      const input = variables[field.variable];
      if (
        !["number", "money", "boolean", "select"].includes(field.kind) ||
        (field.period !== undefined && field.period !== CALCULATOR_YEAR) ||
        (field.kind === "money" && input?.unit !== "currency-USD")
      )
        throw new Error("invalid-calculator-input-contract");
      if (
        !input ||
        input.definitionPeriod !== "year" ||
        input.entity !== field.entity ||
        fields.has(field.variable) ||
        field.variable === contract.modelVariable ||
        [
          "state_code",
          "filing_status",
          "is_tax_unit_head",
          "is_tax_unit_spouse",
          "is_tax_unit_dependent",
          "cohabitating_spouses",
        ].includes(field.variable)
      )
        throw new Error("invalid-calculator-input-contract");
      fields.add(field.variable);
      if (
        (field.kind === "boolean" && input.valueType !== "bool") ||
        (["money", "number"].includes(field.kind) &&
          !["float", "int"].includes(input.valueType)) ||
        (field.kind === "select" &&
          (!field.options?.length ||
            field.options.some(
              (option) =>
                !input.possibleValues?.some(
                  (value) => value.value === option.value,
                ),
            )))
      )
        throw new Error("invalid-calculator-input-contract");
    }
  }
  return document.contracts;
}

/** An inventory record stays visible even when it cannot yet be calculated. */
export function loadCalculatorPrograms(): CalculatorProgram[] {
  const contracts = new Map(
    loadCalculatorContracts().map((contract) => [contract.id, contract]),
  );
  const document = JSON.parse(
    readFileSync(join(process.cwd(), "data/calculator/contracts.json"), "utf8"),
  ) as { heldPrograms?: HeldProgram[] };
  const heldPrograms = document.heldPrograms ?? [];
  const held = new Map(heldPrograms.map((program) => [program.id, program]));
  if (
    held.size !== heldPrograms.length ||
    heldPrograms.some(
      (program) =>
        contracts.has(program.id) ||
        program.year !== CALCULATOR_YEAR ||
        !program.reason ||
        !Array.isArray(program.notes) ||
        !Array.isArray(program.sources),
    )
  )
    throw new Error("invalid-calculator-hold");
  const coverage = new Map(
    loadCoverage()?.programs.map((record) => [record.id, record]),
  );
  return loadStates().flatMap((state) =>
    state.programs.map((program) => {
      const contract = contracts.get(program.id);
      const hold = held.get(program.id);
      if (hold && hold.state !== state.code)
        throw new Error("invalid-calculator-hold");
      if (
        contract &&
        (contract.state !== state.code ||
          contract.year !== CALCULATOR_YEAR ||
          !contract.modelVariable ||
          !program.modelVariables.includes(contract.modelVariable))
      )
        throw new Error("invalid-calculator-contract");
      return {
        id: program.id,
        state: state.code,
        name: program.name,
        modelVariable: contract?.modelVariable ?? null,
        entity: contract?.entity ?? null,
        kind:
          contract?.kind ??
          (program.category === "deduction"
            ? "deduction"
            : program.category === "rebate"
              ? "rebate"
              : isComparisonProgram(program)
                ? "credit"
                : "bill-reduction"),
        inputs: contract?.inputs ?? [],
        notes: hold?.notes ?? contract?.notes ?? [],
        resultLabel: contract?.resultLabel,
        resultNote: contract?.resultNote,
        unavailableReason:
          hold?.reason ??
          (contract
            ? null
            : !isComparisonProgram(program)
              ? "nonmonetary-context"
              : coverage.get(program.id)?.status === "implementation-found"
                ? "missing-input-contract"
                : "missing-model"),
        sources: (hold?.sources ?? contract?.sources ?? program.sources).map(
          ({ title, url }) => ({ title, url }),
        ),
      };
    }),
  );
}
