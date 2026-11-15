/** Explicit, bounded live smoke check. Never runs as part of the offline unit suite. */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { calculateProgram, type CalculatorValues } from "../lib/calculator";
import { loadCalculatorPrograms } from "../lib/calculatorData";

interface Case {
  id: string;
  programId: string;
  inputs: CalculatorValues;
  expectedValue: number;
  source: string;
  sourceLocation: string;
}

const receipt = process.argv[2];
if (!receipt) throw new Error("Provide a durable output receipt path");
const allCases = JSON.parse(
  readFileSync("data/calculator/validation-cases.json", "utf8"),
) as Case[];
const selectedPrograms = process.argv.slice(3);
const cases = allCases.filter(
  (example) =>
    !selectedPrograms.length || selectedPrograms.includes(example.programId),
);
if (!cases.length) throw new Error("No validation cases selected");
if (cases.length > 15)
  throw new Error("Live check exceeds one minute's request budget");
const programs = loadCalculatorPrograms();
const results: unknown[] = [];
for (const example of cases) {
  const program = programs.find((item) => item.id === example.programId);
  if (!program) throw new Error(`Unknown program: ${example.programId}`);
  try {
    const answer = await calculateProgram(program, example.inputs);
    results.push({
      ...example,
      ...answer,
      pass: answer.value === example.expectedValue,
    });
  } catch (error) {
    results.push({
      ...example,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await writeFile(
    resolve(receipt),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        runtimeModelVersion: null,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  const row = results.at(-1) as { pass: boolean };
  console.log(`${example.id}: ${row.pass ? "PASS" : "FAIL"}`);
  if (!row.pass) process.exit(1);
  await pause(4_000);
}
