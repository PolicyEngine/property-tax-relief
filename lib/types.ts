export type Tenure = "owner" | "renter";
export type PaymentMechanism =
  | "property-tax-bill-reduction"
  | "taxable-property-value-exemption"
  | "income-tax-credit"
  | "cash-rebate"
  | "income-tax-deduction"
  | "tax-deferral"
  | "assessment-or-tax-limit"
  | "varies-by-locality"
  | "not-established";
export type Category =
  | "threshold-circuit-breaker"
  | "income-tested-relief"
  | "property-tax-credit"
  | "renter-credit"
  | "rebate"
  | "exemption"
  | "deduction"
  | "deferral"
  | "assessment-limit"
  | "local-option";

export interface Source {
  title: string;
  url: string;
  kind: "agency" | "statute" | "form" | "regulation";
}

export interface Program {
  id: string;
  name: string;
  category: Category;
  scope: "statewide" | "local-option";
  tenures: Tenure[];
  refundable: boolean | null;
  paymentMechanism?: PaymentMechanism;
  ageRule: string;
  incomeDefinition: string;
  incomeLimits: string;
  maximumBenefit: string;
  formulaSummary: string;
  application: string;
  eligibilityNotes: string[];
  interactions: string[];
  programYear: string;
  rentProxy: number | null;
  sources: Source[];
  modelVariables: string[];
}

export interface StateProfile {
  code: string;
  name: string;
  taxYear: number;
  verifiedAt: string;
  overview: string;
  inventoryStatus: "researched" | "partial";
  statewideCreditStatus: "identified" | "none-identified" | "uncertain";
  programs: Program[];
  laterChanges: string[];
  researchNotes: string[];
  sources: Source[];
}

export interface ProgramCoverage {
  id: string;
  state: string;
  variables: string[];
  missingVariables: string[];
  status: "implementation-found" | "implementation-missing" | "context";
}

export interface CoverageAudit {
  interfaceVersion: string;
  modelVersion: string;
  canonicalModelCommit: string;
  programs: ProgramCoverage[];
  releaseReady: boolean;
  limitations: string[];
}
