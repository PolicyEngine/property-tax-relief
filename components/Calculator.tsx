"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, SelectInput } from "@policyengine/ui-kit";
import {
  calculateProgram,
  CALCULATOR_YEAR,
  validateInputs,
  type CalculatorInput,
  type CalculatorProgram,
  type CalculatorResponse,
  type CalculatorValues,
} from "@/lib/calculator";
import { appPath } from "@/lib/paths";
import styles from "./Calculator.module.css";

interface CalculatorProps {
  programs: CalculatorProgram[];
  states: { code: string; name: string }[];
}

interface SavedEstimate {
  result: CalculatorResponse;
  signature: string;
  programId: string;
}

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function scenarioSignature(
  program: CalculatorProgram,
  values: CalculatorValues,
): string {
  return JSON.stringify([
    program.id,
    program.inputs.map((input) => [
      input.variable,
      values[input.variable] ?? "",
    ]),
  ]);
}

function calculationError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "incomplete-inputs") {
    return "Complete each household field before calculating.";
  }
  if (code === "invalid-model-result") {
    return "PolicyEngine did not return a numerical result for this scenario. The estimate remains unavailable.";
  }
  if (code === "unsupported-program") {
    return "This program does not yet support household calculations here.";
  }
  if (code === "rate-limit") {
    return "People on the same network share a calculation limit. Wait at least one minute before calculating again.";
  }
  if (code === "timeout") {
    return "The calculation took too long. You can try again later.";
  }
  if (code === "service-unavailable") {
    return "PolicyEngine cannot calculate this scenario right now. You can try again later.";
  }
  if (code === "network" || code === "network-error") {
    return "The calculator could not reach PolicyEngine. People on the same network share a calculation limit; check your connection and wait one minute before trying again.";
  }
  return "The calculation did not return a result. You can try again later.";
}

function availabilityReason(reason: string | null): string {
  switch (reason) {
    case "missing-model":
      return "PolicyEngine does not yet provide a calculation for this program here.";
    case "aggregate-output":
      return "The model combines this program with other deductions or credits. It does not provide a separate amount here.";
    case "nonmonetary-context":
      return "This provision supplies context for the state comparison. The calculator does not provide a household amount for it.";
    case "missing-input-contract":
    case "unvalidated-contract":
    default:
      return "Household calculations for this program remain unavailable here.";
  }
}

function inputError(input: CalculatorInput, value: string): string | null {
  if (input.kind === "boolean") {
    return value === "true" || value === "false"
      ? null
      : `Choose yes or no for ${input.label.toLowerCase()}.`;
  }
  if (input.kind === "select") {
    return input.options?.some((option) => option.value === value)
      ? null
      : `Choose ${input.label.toLowerCase()}.`;
  }
  if (!value.trim()) return `Enter ${input.label.toLowerCase()}.`;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return `Enter a number for ${input.label.toLowerCase()}.`;
  }
  if (input.minimum !== undefined && number < input.minimum) {
    return `Enter ${input.minimum} or more for ${input.label.toLowerCase()}.`;
  }
  if (input.maximum !== undefined && number > input.maximum) {
    return `Enter ${input.maximum} or less for ${input.label.toLowerCase()}.`;
  }
  return null;
}

export function Calculator({ programs, states }: CalculatorProps) {
  const [stateCode, setStateCode] = useState("");
  const [programId, setProgramId] = useState("");
  const [values, setValues] = useState<CalculatorValues>({});
  const [estimate, setEstimate] = useState<SavedEstimate | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestRef = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const errorsRef = useRef<HTMLDivElement>(null);

  const statePrograms = programs.filter(
    (program) => program.state === stateCode,
  );
  const selectedProgram = statePrograms.find(
    (program) => program.id === programId,
  );
  const selectedState = states.find((state) => state.code === stateCode);
  const available = Boolean(
    selectedProgram &&
    selectedProgram.modelVariable &&
    selectedProgram.entity &&
    !selectedProgram.unavailableReason,
  );
  const currentSignature = selectedProgram
    ? scenarioSignature(selectedProgram, values)
    : "";
  const displayedEstimate = estimate?.programId === programId ? estimate : null;
  const stale = Boolean(
    displayedEstimate && displayedEstimate.signature !== currentSignature,
  );
  const upToDate = Boolean(displayedEstimate && !stale);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  function cancelCalculation() {
    requestNumber.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setPending(false);
  }

  function selectState(code: string) {
    cancelCalculation();
    setStateCode(code);
    setProgramId("");
    setValues({});
    setEstimate(null);
    setErrors([]);
    setFieldErrors({});
  }

  function selectProgram(id: string) {
    cancelCalculation();
    setProgramId(id);
    setValues({});
    setEstimate(null);
    setErrors([]);
    setFieldErrors({});
  }

  function updateValue(variable: string, value: string) {
    cancelCalculation();
    setValues((previous) => ({ ...previous, [variable]: value }));
    setErrors([]);
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[variable];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProgram || !available || requestRef.current || upToDate)
      return;

    const nextFieldErrors: Record<string, string> = {};
    const validation = validateInputs(selectedProgram, values);
    for (const input of selectedProgram.inputs) {
      const error = inputError(input, values[input.variable] ?? "");
      if (error || validation.includes(input.variable))
        nextFieldErrors[input.variable] =
          error ?? `Enter a number for ${input.label.toLowerCase()}.`;
    }
    const nextErrors = Object.values(nextFieldErrors);
    if (!nextErrors.length && validation.length) {
      nextErrors.push("Check the household fields before calculating.");
    }
    setFieldErrors(nextFieldErrors);
    setErrors(nextErrors);
    if (nextErrors.length) return;

    const controller = new AbortController();
    requestRef.current = controller;
    const number = ++requestNumber.current;
    const signature = currentSignature;
    const submittedProgramId = selectedProgram.id;
    setPending(true);
    try {
      const result = await calculateProgram(
        selectedProgram,
        values,
        controller.signal,
      );
      if (controller.signal.aborted || requestNumber.current !== number) return;
      if (!Number.isFinite(result.value)) {
        throw new Error("invalid-model-result");
      }
      setEstimate({ result, signature, programId: submittedProgramId });
    } catch (error) {
      if (controller.signal.aborted || requestNumber.current !== number) return;
      setErrors([calculationError(error)]);
    } finally {
      if (requestNumber.current === number) {
        requestRef.current = null;
        setPending(false);
      }
    }
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.inputs} aria-labelledby="household-heading">
        <div className={styles.sectionHeading}>
          <span className="eyebrow">Your household</span>
          <span className={styles.year}>{CALCULATOR_YEAR} reference year</span>
        </div>
        <h2 id="household-heading">Choose a program</h2>
        <p className={styles.scope}>
          Calculate a scenario for one adult filing as single, with no spouse or
          dependents.
        </p>
        <form onSubmit={submit} noValidate>
          <div className={styles.selectionFields}>
            <SelectInput
              id="calculator-state"
              label="State or District of Columbia"
              value={stateCode}
              onChange={selectState}
              placeholder="Choose a state"
              options={states.map((state) => ({
                value: state.code,
                label: state.name,
              }))}
              className={styles.select}
            />
            {stateCode && statePrograms.length > 0 && (
              <SelectInput
                id="calculator-program"
                label="Program"
                value={programId}
                onChange={selectProgram}
                placeholder="Choose a program"
                options={statePrograms.map((program) => ({
                  value: program.id,
                  label: `${program.name}${program.unavailableReason ? " — unavailable" : ""}`,
                }))}
                className={styles.select}
              />
            )}
          </div>

          {stateCode && statePrograms.length === 0 && (
            <div className={styles.availability} role="status">
              <h3>Calculation unavailable</h3>
              <p>
                This calculator has no household calculation for{" "}
                {selectedState?.name}. Explore the state profile for the
                selected programs and sources.
              </p>
              <a href={appPath("/")}>Explore state programs</a>
            </div>
          )}

          {selectedProgram && !available && (
            <div className={styles.availability} role="status">
              <h3>Calculation unavailable</h3>
              <p>{availabilityReason(selectedProgram.unavailableReason)}</p>
              <a href={appPath("/methods/")}>Read the coverage details</a>
            </div>
          )}

          {selectedProgram && available && (
            <fieldset className={styles.facts}>
              <legend>Household facts</legend>
              <p className={styles.fieldInstructions}>
                Enter each amount in dollars for the stated year. Choose yes or
                no for each question.
              </p>
              {selectedProgram.inputs.map((input) => {
                const id = `calculator-${input.variable}`;
                const descriptionId = `${id}-description`;
                const errorId = `${id}-error`;
                const error = fieldErrors[input.variable];
                const describedBy =
                  [input.description ? descriptionId : "", error ? errorId : ""]
                    .filter(Boolean)
                    .join(" ") || undefined;
                const options =
                  input.kind === "boolean"
                    ? [
                        { value: "true", label: "Yes" },
                        { value: "false", label: "No" },
                      ]
                    : (input.options ?? []);
                return (
                  <div className={styles.field} key={input.variable}>
                    <label htmlFor={id}>
                      {input.label}
                      {input.period && input.period !== CALCULATOR_YEAR && (
                        <span className={styles.fieldPeriod}>
                          {" "}
                          · {input.period}
                        </span>
                      )}
                    </label>
                    {input.description && (
                      <p id={descriptionId} className={styles.fieldDescription}>
                        {input.description}
                      </p>
                    )}
                    {input.kind === "boolean" || input.kind === "select" ? (
                      <SelectInput
                        id={id}
                        name={input.variable}
                        value={values[input.variable] ?? ""}
                        onChange={(value) => updateValue(input.variable, value)}
                        placeholder="Choose an answer"
                        options={options}
                        required
                        aria-invalid={Boolean(error)}
                        aria-describedby={describedBy}
                        className={styles.select}
                      />
                    ) : (
                      <div className={styles.numericInput}>
                        {input.kind === "money" && (
                          <span
                            className={styles.currencyPrefix}
                            aria-hidden="true"
                          >
                            $
                          </span>
                        )}
                        <Input
                          id={id}
                          name={input.variable}
                          type="number"
                          inputMode={
                            input.kind === "money" ? "decimal" : "numeric"
                          }
                          step="any"
                          min={input.minimum}
                          max={input.maximum}
                          required
                          value={values[input.variable] ?? ""}
                          onChange={(event) =>
                            updateValue(input.variable, event.target.value)
                          }
                          aria-invalid={Boolean(error)}
                          aria-describedby={describedBy}
                          className={`${styles.number} ${input.kind === "money" ? styles.money : ""}`}
                        />
                      </div>
                    )}
                    {error && (
                      <p id={errorId} className={styles.fieldError}>
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </fieldset>
          )}

          {errors.length > 0 && (
            <div
              className={styles.errors}
              ref={errorsRef}
              role="alert"
              tabIndex={-1}
            >
              <h3>Check the calculation</h3>
              {errors.length === 1 ? (
                <p>{errors[0]}</p>
              ) : (
                <ul>
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedProgram && available && (
            <div className={styles.actions}>
              <Button
                type="submit"
                disabled={pending || upToDate}
                className={styles.calculate}
              >
                {pending
                  ? "Calculating…"
                  : upToDate
                    ? "Estimate up to date"
                    : "Calculate estimate"}
              </Button>
              {pending && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={cancelCalculation}
                  className={styles.cancel}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </form>
      </section>

      <aside className={styles.results} aria-labelledby="estimate-heading">
        <div className={styles.resultHeading}>
          <span className="eyebrow">PolicyEngine</span>
          <span className={styles.status} aria-live="polite">
            {pending
              ? "Calculating"
              : stale
                ? "Inputs changed"
                : displayedEstimate
                  ? "Calculated"
                  : "No estimate yet"}
          </span>
        </div>
        <h2 id="estimate-heading">Model estimate</h2>
        <div
          className={styles.resultBody}
          aria-live="polite"
          aria-busy={pending}
        >
          {displayedEstimate && selectedProgram ? (
            <>
              {stale && (
                <p className={styles.stale}>
                  Previous estimate. Calculate again to use your current inputs.
                </p>
              )}
              <p className={styles.amount}>
                {dollars.format(displayedEstimate.result.value)}
              </p>
              <p className={styles.resultLabel}>
                {selectedProgram.resultLabel ??
                  (selectedProgram.kind === "deduction"
                    ? "Deduction from taxable income"
                    : selectedProgram.kind === "bill-reduction"
                      ? "Property-tax bill reduction"
                      : selectedProgram.kind === "rebate"
                        ? "Rebate amount"
                        : "Credit amount")}
              </p>
              <p className={styles.programName}>{selectedProgram.name}</p>
              {selectedProgram.resultNote ? (
                <p className={styles.resultNote}>
                  {selectedProgram.resultNote}
                </p>
              ) : selectedProgram.kind === "deduction" ? (
                <p className={styles.resultNote}>
                  A deduction reduces taxable income. The amount does not
                  measure a cash payment or your tax savings.
                </p>
              ) : null}
              <p className={styles.resultNote}>
                This estimate follows the model and the facts you entered. Check
                the program notes and agency sources before claiming an amount.
              </p>
              <details className={styles.calculationDetails}>
                <summary>Calculation details</summary>
                <dl>
                  <div>
                    <dt>Reference year</dt>
                    <dd>{CALCULATOR_YEAR}</dd>
                  </div>
                  <div>
                    <dt>Model variable</dt>
                    <dd>{displayedEstimate.result.modelVariable}</dd>
                  </div>
                  <div>
                    <dt>Calculated</dt>
                    <dd>
                      {new Date(
                        displayedEstimate.result.calculatedAt,
                      ).toLocaleString("en-US")}
                    </dd>
                  </div>
                </dl>
              </details>
            </>
          ) : (
            <div className={styles.emptyResult}>
              <span className={styles.emptyRule} aria-hidden="true" />
              <p>
                {selectedProgram && !available
                  ? "This program has no household estimate available here."
                  : selectedProgram
                    ? "Enter the household facts, then calculate the estimate."
                    : "Choose a state and program to see the household facts you need."}
              </p>
              <p className={styles.resultNote}>
                Missing inputs or model coverage do not indicate a zero benefit.
              </p>
            </div>
          )}
        </div>

        {selectedProgram &&
          (selectedProgram.notes.length > 0 ||
            selectedProgram.sources.length > 0) && (
            <section
              className={styles.programContext}
              aria-labelledby="program-notes-heading"
            >
              <h3 id="program-notes-heading">Program notes and sources</h3>
              {selectedProgram.notes.length > 0 && (
                <ul className={styles.notes}>
                  {selectedProgram.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
              {selectedProgram.sources.length > 0 && (
                <ul className={styles.sourceLinks}>
                  {selectedProgram.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

        <p className={styles.methodLink}>
          <a href={appPath("/methods/")}>Data, model coverage, and methods</a>
        </p>
      </aside>
    </div>
  );
}
