/** Explicit, bounded live check; prepare/merge never send a calculation. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { createPolicyEngineApiClient } from "@policyengine/api-client";
import { loadCalculatorPrograms } from "../lib/calculatorData";
import {
  assertIdentityUnchanged,
  createBatchReceipt,
  createValidationManifest,
  mergeBatchReceipts,
  observeDashboardRequest,
  selectBatch,
  readValidationIdentity,
  type BatchReceipt,
  type Observation,
  type ValidationCase,
} from "./calculator_receipts";
const write = (path: string, value: unknown) =>
  writeFileSync(resolve(path), JSON.stringify(value, null, 2) + "\n");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

async function main() {
  const [mode, output, ...args] = process.argv.slice(2);
  if (!output || !["prepare", "batch", "merge"].includes(mode))
    throw new Error("invalid-validation-command");
  const identity = readValidationIdentity();
  const metadata = read("data/calculator/model-metadata.json");
  const manifest = createValidationManifest(
    read("data/calculator/validation-cases.json") as ValidationCase[],
    loadCalculatorPrograms(),
    identity,
    metadata.sourceSha256,
  );
  const verifyIdentity = () =>
    assertIdentityUnchanged(identity, readValidationIdentity());
  verifyIdentity();
  if (mode === "prepare") {
    if (args.length) throw new Error("unexpected-validation-arguments");
    write(output, manifest);
    return;
  }
  if (mode === "merge") {
    if (!args.length) throw new Error("missing-validation-batches");
    const merged = mergeBatchReceipts(
      args.map((path) => read(path) as BatchReceipt),
      manifest,
    );
    verifyIdentity();
    write(output, merged);
    return;
  }
  if (args.length !== 1 || !/^\d+$/.test(args[0]))
    throw new Error("invalid-batch-index");
  const ids = selectBatch(manifest, Number(args[0]));
  const rows: Observation[] = [];
  for (const id of ids) {
    verifyIdentity();
    const example = manifest.cases.find((c) => c.example.id === id)!;
    const observed = observeDashboardRequest(
      manifest,
      id,
      globalThis.fetch,
      verifyIdentity,
    );
    const client = createPolicyEngineApiClient({ fetch: observed.fetch });
    await client.calculateHousehold(example.request, {
      signal: AbortSignal.timeout(120_000),
    });
    verifyIdentity();
    rows.push(observed.observation());
    write(output, createBatchReceipt(manifest, ids, rows));
    console.log(`${id}: ${rows.at(-1)!.pass ? "PASS" : "FAIL"}`);
    if (!rows.at(-1)!.pass) throw new Error("validation-value-differs");
    // No retries. The final wait also separates successive batch processes.
    await pause(4_000);
  }
  verifyIdentity();
}

await main();
