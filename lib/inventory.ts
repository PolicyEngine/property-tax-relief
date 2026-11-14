import type { Category, Program, StateProfile, Tenure } from "./types";

export const STATE_CODES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  );

export const CATEGORY_LABELS: Record<Category, string> = {
  "threshold-circuit-breaker": "Threshold circuit breaker",
  "income-tested-relief": "Other income-tested relief",
  "property-tax-credit": "Property-tax credit",
  "renter-credit": "Renter credit",
  rebate: "Rebate",
  exemption: "Exemption",
  deduction: "Deduction",
  deferral: "Deferral",
  "assessment-limit": "Assessment or tax limit",
  "local-option": "Local option",
};

export function isComparisonProgram(program: Program): boolean {
  return (
    program.scope === "statewide" &&
    !["exemption", "deferral", "assessment-limit", "local-option"].includes(
      program.category,
    )
  );
}

export function selectPrograms(
  state: StateProfile,
  tenure: Tenure | "all",
  category: Category | "all",
  includeContext: boolean,
): Program[] {
  return state.programs.filter(
    (program) =>
      (tenure === "all" || program.tenures.includes(tenure)) &&
      (category === "all" || program.category === category) &&
      (includeContext || isComparisonProgram(program)),
  );
}

export function filterStates(
  states: StateProfile[],
  query: string,
  tenure: Tenure | "all",
  category: Category | "all",
  includeContext: boolean,
): StateProfile[] {
  const search = query.trim().toLowerCase();
  return states.filter((state) => {
    const matchesText =
      !search ||
      `${state.code} ${state.name} ${state.programs.map((p) => p.name).join(" ")}`
        .toLowerCase()
        .includes(search);
    const matchesProgram =
      (tenure === "all" && category === "all") ||
      selectPrograms(state, tenure, category, includeContext).length > 0;
    return matchesText && matchesProgram;
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function inventoryCsv(states: StateProfile[]): string {
  const headings = [
    "state",
    "code",
    "tax_year",
    "program",
    "category",
    "scope",
    "tenures",
    "refundable",
    "age_rule",
    "income_definition",
    "income_limits",
    "maximum_benefit",
    "formula",
    "application",
    "program_year",
    "source_urls",
    "research_status",
  ];
  const rows = states.flatMap((state) => {
    if (!state.programs.length)
      return [
        [
          state.name,
          state.code,
          state.taxYear,
          "No program recorded",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          state.sources.map((s) => s.url).join(" | "),
          state.inventoryStatus,
        ],
      ];
    return state.programs.map((p) => [
      state.name,
      state.code,
      state.taxYear,
      p.name,
      p.category,
      p.scope,
      p.tenures.join(" | "),
      p.refundable === null ? "Not specified" : String(p.refundable),
      p.ageRule,
      p.incomeDefinition,
      p.incomeLimits,
      p.maximumBenefit,
      p.formulaSummary,
      p.application,
      p.programYear,
      p.sources.map((s) => s.url).join(" | "),
      state.inventoryStatus,
    ]);
  });
  return [headings, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
