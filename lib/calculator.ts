import {
  createPolicyEngineApiClient,
  PolicyEngineApiError,
} from "@policyengine/api-client";

export const CALCULATOR_YEAR = 2025;

export interface CalculatorInput {
  variable: string;
  label: string;
  entity: string;
  kind: "number" | "money" | "boolean" | "select";
  options?: { value: string; label: string }[];
  description?: string;
  minimum?: number;
  maximum?: number;
  period?: number;
}

export interface CalculatorProgram {
  id: string;
  state: string;
  name: string;
  modelVariable: string | null;
  entity: string | null;
  kind: "credit" | "rebate" | "deduction" | "bill-reduction";
  resultLabel?: string;
  resultNote?: string;
  inputs: CalculatorInput[];
  notes: string[];
  unavailableReason: string | null;
  sources: { title: string; url: string }[];
}

export type CalculatorValues = Record<string, string>;

export interface CalculatorResponse {
  value: number;
  modelVariable: string;
  calculatedAt: string;
}

type Value = string | boolean | number | null;
type Entity = Record<string, Record<string, Value> | string[]>;
export type CalculatorHousehold = Record<string, Record<string, Entity>>;

// Transport mappings only: policy formulas and eligibility remain in the model.
const ENTITIES = {
  person: ["people", "claimant"],
  family: ["families", "family"],
  marital_unit: ["marital_units", "marital_unit"],
  tax_unit: ["tax_units", "tax_unit"],
  spm_unit: ["spm_units", "spm_unit"],
  household: ["households", "household"],
} as const;

function entityAddress(entity: string) {
  if (!Object.hasOwn(ENTITIES, entity)) throw new Error("unsupported-program");
  return ENTITIES[entity as keyof typeof ENTITIES];
}

function parseInput(field: CalculatorInput, raw: string | undefined): Value {
  if (raw === undefined || raw.trim() === "")
    throw new Error("incomplete-inputs");
  if (field.kind === "boolean") {
    if (raw !== "true" && raw !== "false") throw new Error("incomplete-inputs");
    return raw === "true";
  }
  if (field.kind === "select") {
    if (!field.options?.some((option) => option.value === raw))
      throw new Error("incomplete-inputs");
    return raw;
  }
  // Number() also accepts hex and Infinity; the form accepts plain decimal input.
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()))
    throw new Error("incomplete-inputs");
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (field.minimum !== undefined && value < field.minimum) ||
    (field.maximum !== undefined && value > field.maximum)
  )
    throw new Error("incomplete-inputs");
  return value;
}

export function validateInputs(
  program: CalculatorProgram,
  values: CalculatorValues,
): string[] {
  return program.inputs.flatMap((field) => {
    try {
      parseInput(field, values[field.variable]);
      return [];
    } catch {
      return [field.variable];
    }
  });
}

/** A single adult, single filer, with no spouse or dependents. */
export function buildHousehold(
  program: CalculatorProgram,
  values: CalculatorValues,
): CalculatorHousehold {
  if (!program.modelVariable || !program.entity || program.unavailableReason)
    throw new Error("unsupported-program");
  if (validateInputs(program, values).length)
    throw new Error("incomplete-inputs");

  const household: CalculatorHousehold = {
    people: {
      claimant: {
        is_tax_unit_head: { [CALCULATOR_YEAR]: true },
        is_tax_unit_spouse: { [CALCULATOR_YEAR]: false },
        is_tax_unit_dependent: { [CALCULATOR_YEAR]: false },
      },
    },
  };
  for (const [plural, id] of Object.values(ENTITIES)) {
    if (plural !== "people")
      household[plural] = { [id]: { members: ["claimant"] } };
  }
  household.households.household.state_code = {
    [CALCULATOR_YEAR]: program.state,
  };
  household.tax_units.tax_unit.filing_status = { [CALCULATOR_YEAR]: "SINGLE" };
  household.tax_units.tax_unit.cohabitating_spouses = {
    [CALCULATOR_YEAR]: false,
  };

  for (const field of program.inputs) {
    const [plural, id] = entityAddress(field.entity);
    household[plural][id][field.variable] = {
      [field.period ?? CALCULATOR_YEAR]: parseInput(
        field,
        values[field.variable],
      ),
    };
  }
  const [plural, id] = entityAddress(program.entity);
  household[plural][id][program.modelVariable] = { [CALCULATOR_YEAR]: null };
  return household;
}

export function readModelResult(
  program: CalculatorProgram,
  result: unknown,
): CalculatorResponse {
  if (!program.modelVariable || !program.entity)
    throw new Error("unsupported-program");
  const [plural, id] = entityAddress(program.entity);
  let value: unknown = result;
  for (const key of [
    plural,
    id,
    program.modelVariable,
    String(CALCULATOR_YEAR),
  ]) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !Object.hasOwn(value, key)
    )
      throw new Error("invalid-model-result");
    value = (value as Record<string, unknown>)[key];
  }
  // A missing variable, null, string or array is not a modelled zero.
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("invalid-model-result");
  return {
    value,
    modelVariable: program.modelVariable,
    calculatedAt: new Date().toISOString(),
  };
}

const client = createPolicyEngineApiClient();
const answers = new Map<string, CalculatorResponse>();
let requestedAt: number[] = [];
let retryAfter = 0;

export async function calculateProgram(
  program: CalculatorProgram,
  values: CalculatorValues,
  signal?: AbortSignal,
): Promise<CalculatorResponse> {
  const household = buildHousehold(program, values);
  if (signal?.aborted) throw new Error("cancelled");
  const key = JSON.stringify(household);
  const cached = answers.get(key);
  if (cached) return cached;
  const now = Date.now();
  requestedAt = requestedAt.filter((time) => now - time < 60_000);
  if (now < retryAfter || requestedAt.length >= 15)
    throw new Error("rate-limit");
  requestedAt.push(now);
  // One call per explicit action, no automatic retries or per-keystroke requests.
  const timeout = AbortSignal.timeout(120_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const result = await client.calculateHousehold(
      { country: "us", household },
      { signal: requestSignal },
    );
    if (signal?.aborted) throw new Error("cancelled");
    const answer = readModelResult(program, result);
    if (answers.size >= 20) answers.delete(answers.keys().next().value!);
    answers.set(key, answer);
    return answer;
  } catch (error) {
    if (signal?.aborted) throw new Error("cancelled");
    if (timeout.aborted) throw new Error("timeout");
    if (error instanceof PolicyEngineApiError) {
      if (error.status === 429) {
        retryAfter =
          Date.now() + Math.max(60, error.retryAfterSeconds ?? 60) * 1000;
        throw new Error("rate-limit");
      }
      if (error.status === null) {
        // Cross-origin firewall failures can be indistinguishable from a network error.
        retryAfter = Date.now() + 60_000;
        throw new Error("network");
      }
      throw new Error("service-unavailable");
    }
    throw error;
  }
}
