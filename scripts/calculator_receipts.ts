import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildHousehold,
  readModelResult,
  type CalculatorProgram,
  type CalculatorValues,
} from "../lib/calculator";

export const DASHBOARD_CALCULATION_URL =
  "https://www.policyengine.org/api/household/calculate";
export const QUALIFICATION_SCOPE =
  "Source-qualified single-adult scenarios; validation covers only the listed cases.";
export interface ValidationCase {
  id: string;
  programId: string;
  inputs: CalculatorValues;
  expectedValue: number;
  source: string;
  sourceLocation: string;
}
export type ValidationIdentity = Record<
  | "contractsSha256"
  | "adapterSha256"
  | "casesSha256"
  | "metadataFileSha256"
  | "harnessSha256"
  | "helperSha256"
  | "apiClientSha256",
  string
>;
export function sha256(body: string | Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
export function readValidationIdentity(
  root = process.cwd(),
): ValidationIdentity {
  const read = (path: string) => readFileSync(join(root, path));
  return {
    contractsSha256: sha256(read("data/calculator/contracts.json")),
    adapterSha256: sha256(read("lib/calculator.ts")),
    casesSha256: sha256(read("data/calculator/validation-cases.json")),
    metadataFileSha256: sha256(read("data/calculator/model-metadata.json")),
    harnessSha256: sha256(read("scripts/calculator_live_qa.ts")),
    helperSha256: sha256(read("scripts/calculator_receipts.ts")),
    apiClientSha256: sha256(
      ["package.json", "dist/client.js", "dist/errors.js"]
        .map((path) =>
          read(`node_modules/@policyengine/api-client/${path}`).toString(
            "utf8",
          ),
        )
        .join("\n"),
    ),
  };
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    typeof value === "object" &&
    value &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  throw new Error("invalid-receipt-json");
}
export const semanticHash = (value: unknown) => sha256(canonicalJson(value));
function requireReceipt(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export interface ValidationManifest {
  schemaVersion: 2;
  evidenceKind: "live-dashboard" | "mock-transport";
  metadataSnapshotSha256: string;
  qualificationScope: string;
  validationIdentity: ValidationIdentity;
  cases: {
    example: ValidationCase;
    request: { country: "us"; household: ReturnType<typeof buildHousehold> };
    requestSha256: string;
    modelVariable: string;
    entity: string;
  }[];
}
export function createValidationManifest(
  cases: ValidationCase[],
  programs: CalculatorProgram[],
  validationIdentity: ValidationIdentity,
  metadataSnapshotSha256: string,
  qualificationScope = QUALIFICATION_SCOPE,
  evidenceKind: ValidationManifest["evidenceKind"] = "live-dashboard",
): ValidationManifest {
  requireReceipt(
    cases.length > 0 && new Set(cases.map((c) => c.id)).size === cases.length,
    "invalid-case-ids",
  );
  requireReceipt(
    Object.values(validationIdentity).length === 7 &&
      Object.values(validationIdentity).every((h) => /^[a-f0-9]{64}$/.test(h)),
    "invalid-validation-identity",
  );
  requireReceipt(
    /^[a-f0-9]{64}$/.test(metadataSnapshotSha256) &&
      qualificationScope.length > 0,
    "invalid-validation-scope",
  );
  return {
    schemaVersion: 2,
    evidenceKind,
    metadataSnapshotSha256,
    qualificationScope,
    validationIdentity,
    cases: [...cases]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((example) => {
        const program = programs.find((p) => p.id === example.programId);
        requireReceipt(
          program?.modelVariable &&
            program.entity &&
            Number.isFinite(example.expectedValue),
          "invalid-validation-case",
        );
        const request = {
          country: "us" as const,
          household: buildHousehold(program, example.inputs),
        };
        return {
          example,
          request,
          requestSha256: semanticHash(request),
          modelVariable: program.modelVariable,
          entity: program.entity,
        };
      }),
  };
}
export function assertIdentityUnchanged(
  expected: ValidationIdentity,
  current: ValidationIdentity,
) {
  requireReceipt(
    canonicalJson(expected) === canonicalJson(current),
    "validation-source-changed",
  );
}
export function selectBatch(
  manifest: ValidationManifest,
  index: number,
  size = 15,
): string[] {
  requireReceipt(
    Number.isInteger(index) &&
      index >= 0 &&
      Number.isInteger(size) &&
      size >= 1 &&
      size <= 15,
    "invalid-batch-selection",
  );
  const ids = manifest.cases
    .slice(index * size, (index + 1) * size)
    .map((c) => c.example.id);
  requireReceipt(ids.length > 0, "empty-validation-batch");
  return ids;
}
function assertPublicBody(body: string) {
  requireReceipt(
    !/(?:\/Users\/|\/home\/|Bearer\s|"(?:access_token|client_secret|authorization|set-cookie)"\s*:)/i.test(
      body,
    ),
    "unsafe-validation-body",
  );
}
export interface Observation extends ValidationCase {
  modelVariable: string;
  calculatedAt: string;
  value: number;
  pass: boolean;
  runtimeModelVersion: null;
  request: {
    url: string;
    method: "POST";
    body: string;
    bodySha256: string;
    semanticSha256: string;
  };
  response: { status: number; body: string; bodySha256: string };
}
export function recordObservation(
  manifest: ValidationManifest,
  id: string,
  requestBody: string,
  responseBody: string,
  status: number,
  calculatedAt: string,
): Observation {
  const expected = manifest.cases.find((c) => c.example.id === id);
  requireReceipt(
    expected && Number.isFinite(Date.parse(calculatedAt)),
    "unknown-observation",
  );
  assertPublicBody(requestBody);
  assertPublicBody(responseBody);
  requireReceipt(
    semanticHash(JSON.parse(requestBody)) === expected.requestSha256,
    "observed-request-differs",
  );
  const response = JSON.parse(responseBody);
  requireReceipt(
    status === 200 && response?.status === "ok",
    "unsuccessful-observation",
  );
  const answer = readModelResult(
    {
      modelVariable: expected.modelVariable,
      entity: expected.entity,
    } as CalculatorProgram,
    response.result,
  );
  return {
    ...expected.example,
    value: answer.value,
    modelVariable: expected.modelVariable,
    calculatedAt,
    pass: answer.value === expected.example.expectedValue,
    runtimeModelVersion: null,
    request: {
      url: DASHBOARD_CALCULATION_URL,
      method: "POST",
      body: requestBody,
      bodySha256: sha256(requestBody),
      semanticSha256: expected.requestSha256,
    },
    response: { status, body: responseBody, bodySha256: sha256(responseBody) },
  };
}
export interface BatchReceipt {
  schemaVersion: 2;
  evidenceKind: ValidationManifest["evidenceKind"];
  metadataSnapshotSha256: string;
  qualificationScope: string;
  validationIdentity: ValidationIdentity;
  manifestSha256: string;
  runtimeModelVersion: null;
  caseIds: string[];
  results: Observation[];
}
export function observeDashboardRequest(
  manifest: ValidationManifest,
  id: string,
  fetchImplementation: typeof fetch,
  verifyIdentity: () => void,
) {
  let observed: Observation | undefined;
  let calls = 0;
  const fetchObserved: typeof fetch = async (input, init) => {
    requireReceipt(
      ++calls === 1 &&
        input === DASHBOARD_CALCULATION_URL &&
        init?.method === "POST" &&
        init.credentials === "omit" &&
        typeof init.body === "string",
      "unexpected-validation-transport",
    );
    const headers = new Headers(init.headers);
    requireReceipt(
      !headers.has("authorization") &&
        !headers.has("cookie") &&
        !headers.has("origin"),
      "unexpected-validation-credentials",
    );
    const expected = manifest.cases.find((c) => c.example.id === id);
    requireReceipt(
      expected &&
        semanticHash(JSON.parse(init.body)) === expected.requestSha256,
      "observed-request-differs",
    );
    verifyIdentity();
    const response = await fetchImplementation(input, init);
    const body = await response.clone().text();
    verifyIdentity();
    observed = recordObservation(
      manifest,
      id,
      init.body,
      body,
      response.status,
      new Date().toISOString(),
    );
    return response;
  };
  return {
    fetch: fetchObserved,
    observation: () => {
      requireReceipt(observed && calls === 1, "unobserved-validation-tuple");
      return observed;
    },
  };
}
export function createBatchReceipt(
  manifest: ValidationManifest,
  caseIds: string[],
  results: Observation[],
): BatchReceipt {
  requireReceipt(
    caseIds.length >= 1 &&
      caseIds.length <= 15 &&
      new Set(caseIds).size === caseIds.length,
    "invalid-batch-size",
  );
  requireReceipt(
    caseIds.every((id) => manifest.cases.some((c) => c.example.id === id)),
    "unknown-batch-case",
  );
  return {
    schemaVersion: 2,
    evidenceKind: manifest.evidenceKind,
    metadataSnapshotSha256: manifest.metadataSnapshotSha256,
    qualificationScope: manifest.qualificationScope,
    validationIdentity: manifest.validationIdentity,
    manifestSha256: semanticHash(manifest),
    runtimeModelVersion: null,
    caseIds: [...caseIds],
    results: [...results],
  };
}
function validateRows(
  receipt: BatchReceipt,
  manifest: ValidationManifest,
): Observation[] {
  requireReceipt(
    receipt?.schemaVersion === 2 &&
      receipt.runtimeModelVersion === null &&
      receipt.evidenceKind === manifest.evidenceKind,
    "unbound-validation-receipt",
  );
  requireReceipt(
    receipt.manifestSha256 === semanticHash(manifest) &&
      receipt.metadataSnapshotSha256 === manifest.metadataSnapshotSha256 &&
      receipt.qualificationScope === manifest.qualificationScope,
    "validation-context-differs",
  );
  assertIdentityUnchanged(
    manifest.validationIdentity,
    receipt.validationIdentity,
  );
  requireReceipt(
    Array.isArray(receipt.results),
    "missing-validation-observations",
  );
  return receipt.results.map((row) => {
    requireReceipt(
      row?.request?.method === "POST" &&
        row.request.url === DASHBOARD_CALCULATION_URL &&
        row.response,
      "unobserved-validation-tuple",
    );
    requireReceipt(
      row.request.bodySha256 === sha256(row.request.body) &&
        row.response.bodySha256 === sha256(row.response.body),
      "observation-bytes-differ",
    );
    const observed = recordObservation(
      manifest,
      row.id,
      row.request.body,
      row.response.body,
      row.response.status,
      row.calculatedAt,
    );
    requireReceipt(
      canonicalJson(row) === canonicalJson(observed) && row.pass,
      "validation-observation-differs",
    );
    return observed;
  });
}
export function mergeBatchReceipts(
  batches: BatchReceipt[],
  manifest: ValidationManifest,
) {
  requireReceipt(batches.length > 0, "no-validation-batches");
  const observations: Observation[] = [];
  for (const batch of batches) {
    requireReceipt(
      Array.isArray(batch.caseIds) &&
        batch.caseIds.length >= 1 &&
        batch.caseIds.length <= 15 &&
        new Set(batch.caseIds).size === batch.caseIds.length,
      "invalid-batch-size",
    );
    const rows = validateRows(batch, manifest);
    requireReceipt(
      canonicalJson([...batch.caseIds].sort()) ===
        canonicalJson(rows.map((r) => r.id).sort()),
      "incomplete-validation-batch",
    );
    observations.push(...rows);
  }
  const ids = observations.map((r) => r.id);
  requireReceipt(new Set(ids).size === ids.length, "duplicate-validation-case");
  requireReceipt(
    canonicalJson([...ids].sort()) ===
      canonicalJson(manifest.cases.map((c) => c.example.id).sort()),
    "incomplete-validation-receipt",
  );
  return {
    schemaVersion: 2 as const,
    evidenceKind: manifest.evidenceKind,
    checkedAt: observations
      .map((r) => r.calculatedAt)
      .sort()
      .at(-1)!,
    metadataSnapshotSha256: manifest.metadataSnapshotSha256,
    qualificationScope: manifest.qualificationScope,
    validationIdentity: manifest.validationIdentity,
    manifestSha256: semanticHash(manifest),
    runtimeModelVersion: null,
    results: observations.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export function validateMergedReceipt(
  receipt: unknown,
  manifest: ValidationManifest,
) {
  const value = receipt as ReturnType<typeof mergeBatchReceipts>;
  const batches = Array.from(
    { length: Math.ceil((value?.results?.length ?? 0) / 15) },
    (_, index) => {
      const rows = value.results.slice(index * 15, (index + 1) * 15);
      return {
        ...value,
        caseIds: rows.map((r) => r.id),
        results: rows,
      } as BatchReceipt;
    },
  );
  const merged = mergeBatchReceipts(batches, manifest);
  requireReceipt(
    canonicalJson(merged) === canonicalJson(receipt),
    "merged-validation-receipt-differs",
  );
  return merged;
}
