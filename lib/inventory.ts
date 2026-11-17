import type {
  Category,
  PaymentMechanism,
  Program,
  StateProfile,
  Tenure,
} from "./types";

export const PAYMENT_MECHANISM_LABELS: Record<PaymentMechanism, string> = {
  "property-tax-bill-reduction": "Property-tax bill reduction",
  "taxable-property-value-exemption": "Exemption of taxable property value",
  "income-tax-credit": "Income-tax credit",
  "cash-rebate": "Cash rebate",
  "income-tax-deduction": "Deduction from taxable income",
  "tax-deferral": "Repayable tax deferral",
  "assessment-or-tax-limit": "Assessment or tax limit",
  "varies-by-locality": "Varies by locality",
  "not-established": "Payment mechanism not established in this inventory",
};

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

export const CONTEXT_CATEGORIES: readonly string[] = [
  "exemption",
  "deferral",
  "assessment-limit",
  "local-option",
];

export function isComparisonProgram(program: Program): boolean {
  return (
    program.scope === "statewide" &&
    !CONTEXT_CATEGORIES.includes(program.category)
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

export function displayedRefundability(program: Program): boolean | null {
  const mechanism = program.paymentMechanism ?? "not-established";
  return mechanism === "income-tax-credit" || mechanism === "not-established"
    ? program.refundable
    : null;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function inventoryCsv(states: StateProfile[]): string {
  const headings = [
    "state",
    "code",
    "tax_year",
    "program_id",
    "program",
    "category",
    "scope",
    "tenures",
    "refundable",
    "payment_mechanism",
    "age_rule",
    "income_definition",
    "income_limits",
    "maximum_benefit",
    "formula",
    "application",
    "program_year",
    "source_urls",
    "research_status",
    "state_research_notes",
  ];
  const rows = states.flatMap((state) => {
    if (!state.programs.length)
      return [
        [
          state.name,
          state.code,
          state.taxYear,
          "",
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
          "",
          [...new Set(state.sources.map((source) => source.url))].join(" | "),
          state.inventoryStatus,
          state.researchNotes.join(" | "),
        ],
      ];
    return state.programs.map((p) => [
      state.name,
      state.code,
      state.taxYear,
      p.id,
      p.name,
      p.category,
      p.scope,
      p.tenures.join(" | "),
      displayedRefundability(p) === null
        ? ""
        : String(displayedRefundability(p)),
      p.paymentMechanism ?? "not-established",
      p.ageRule,
      p.incomeDefinition,
      p.incomeLimits,
      p.maximumBenefit,
      p.formulaSummary,
      p.application,
      p.programYear,
      [
        ...new Set(
          [...p.sources, ...state.sources].map((source) => source.url),
        ),
      ].join(" | "),
      state.inventoryStatus,
      state.researchNotes.join(" | "),
    ]);
  });
  return [headings, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
