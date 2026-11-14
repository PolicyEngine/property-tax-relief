"use client";

import { appPath } from "@/lib/paths";

import { useMemo, useState } from "react";
import { Button, Input } from "@policyengine/ui-kit";
import {
  CATEGORY_LABELS,
  filterStates,
  inventoryCsv,
  isComparisonProgram,
  selectPrograms,
} from "@/lib/inventory";
import type {
  Category,
  CoverageAudit,
  StateProfile,
  Tenure,
} from "@/lib/types";
import { ProgramDetail, SourceLinks } from "./ProgramDetail";

type Filters = {
  query: string;
  tenure: Tenure | "all";
  category: Category | "all";
  includeContext: boolean;
};
type ComparisonSlots = [string, string, string];
const INITIAL_FILTERS: Filters = {
  query: "",
  tenure: "all",
  category: "all",
  includeContext: false,
};
const CONTEXT_CATEGORIES = [
  "exemption",
  "deferral",
  "assessment-limit",
  "local-option",
];

function downloadCsv(states: StateProfile[]) {
  const csv = "\uFEFF" + inventoryCsv(states);
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "property-tax-relief-2025.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StateTiles({
  states,
  selectedCode,
  onSelect,
}: {
  states: StateProfile[];
  selectedCode?: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div
      className="state-grid"
      role="group"
      aria-label="States in alphabetical order"
    >
      {states.map((state) => {
        const hasCredit = state.programs.some(isComparisonProgram);
        const status = hasCredit
          ? "statewide tax program recorded"
          : "see other property-tax provisions";
        return (
          <button
            key={state.code}
            type="button"
            className={`state-tile ${selectedCode === state.code ? "selected" : ""} ${hasCredit ? "has-credit" : "context-only"}`}
            aria-pressed={selectedCode === state.code}
            aria-label={`${state.name}: ${status}`}
            title={`${state.name}: ${status}`}
            onClick={() => onSelect(state.code)}
          >
            {state.code}
          </button>
        );
      })}
    </div>
  );
}

function StatePicker({
  states,
  filtered,
  selectedCode,
  filters,
  onChange,
  onSelect,
}: {
  states: StateProfile[];
  filtered: StateProfile[];
  selectedCode?: string;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onSelect: (code: string) => void;
}) {
  const { query, tenure, category, includeContext } = filters;
  return (
    <aside
      className="state-picker"
      aria-label="Search and filter state profiles"
    >
      <div className="section-heading">
        <h2>Find a state</h2>
        <span role="status">
          {filtered.length} / {states.length} shown
        </span>
      </div>
      <label className="field-label" htmlFor="state-search">
        State or program
      </label>
      <Input
        id="state-search"
        type="search"
        placeholder="Search the inventory"
        value={query}
        onChange={(event) => onChange({ query: event.target.value })}
      />
      <div className="filter-pair">
        <label htmlFor="tenure-filter">
          Housing
          <select
            id="tenure-filter"
            aria-label="Housing"
            value={tenure}
            onChange={(event) =>
              onChange({ tenure: event.target.value as Tenure | "all" })
            }
          >
            <option value="all">Owners and renters</option>
            <option value="owner">Homeowners</option>
            <option value="renter">Renters</option>
          </select>
        </label>
        <label htmlFor="category-filter">
          Program type
          <select
            id="category-filter"
            aria-label="Program type"
            value={category}
            onChange={(event) => {
              const value = event.target.value as Category | "all";
              onChange({
                category: value,
                ...(CONTEXT_CATEGORIES.includes(value)
                  ? { includeContext: true }
                  : {}),
              });
            }}
          >
            <option value="all">
              {includeContext ? "All program types" : "Main comparison types"}
            </option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="context-toggle">
        <input
          type="checkbox"
          checked={includeContext}
          onChange={(event) =>
            onChange({
              includeContext: event.target.checked,
              ...(!event.target.checked && CONTEXT_CATEGORIES.includes(category)
                ? { category: "all" }
                : {}),
            })
          }
        />{" "}
        Include exemptions, limits, deferrals and local options
      </label>
      <StateTiles
        states={filtered}
        selectedCode={selectedCode}
        onSelect={onSelect}
      />
      {filtered.length === 0 && (
        <p className="empty-state">
          No states match these filters.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => onChange(INITIAL_FILTERS)}
          >
            Clear filters
          </button>
        </p>
      )}
      <div className="legend">
        <span>
          <i className="legend-credit" aria-hidden="true" /> Tax program
          recorded
        </span>
        <span>
          <i aria-hidden="true" /> Other property-tax provisions
        </span>
      </div>
      <p className="small-note">
        The grid lists states alphabetically. The main comparison includes
        selected income-tax credits and deductions, rebates and bill programs.
        Other property-tax provisions appear with context enabled.
      </p>
      <Button
        variant="outline"
        className="csv-download"
        onClick={() => downloadCsv(states)}
      >
        Download full inventory (CSV)
      </Button>
    </aside>
  );
}

function StateDetail({
  state,
  programs,
  coverage,
  isCompared,
  comparisonFull,
  onCompare,
  onShowAll,
  methodsHref,
}: {
  state: StateProfile;
  programs: ReturnType<typeof selectPrograms>;
  coverage: CoverageAudit | null;
  isCompared: boolean;
  comparisonFull: boolean;
  onCompare: () => void;
  onShowAll: () => void;
  methodsHref: string;
}) {
  const cannotAdd = comparisonFull && !isCompared;
  return (
    <section className="state-profile" aria-labelledby="state-profile-heading">
      <div className="state-heading">
        <div>
          <div className="eyebrow">State profile · 2025 reference</div>
          <h2 id="state-profile-heading">{state.name}</h2>
        </div>
        <div className="compare-action">
          <button
            type="button"
            className="text-button"
            aria-pressed={isCompared}
            disabled={cannotAdd}
            aria-describedby={cannotAdd ? "comparison-limit" : undefined}
            onClick={onCompare}
          >
            {isCompared ? "Remove from comparison" : "Compare this state"}
          </button>
          {cannotAdd && (
            <p className="small-note" id="comparison-limit">
              Three states selected.{" "}
              <a href="#compare">Replace or remove one</a> to add this state.
            </p>
          )}
        </div>
      </div>
      <p className="state-overview">{state.overview}</p>
      <div className="profile-meta">
        Source check: {state.verifiedAt} ·{" "}
        {state.inventoryStatus === "partial"
          ? "Some research remains open"
          : "Initial source pass recorded"}
      </div>
      {programs.map((program) => (
        <ProgramDetail
          key={program.id}
          methodsHref={methodsHref}
          program={program}
          coverage={coverage?.programs.find((row) => row.id === program.id)}
        />
      ))}
      {programs.length === 0 && (
        <div className="no-credit">
          <h3>No matching program recorded</h3>
          <p>
            See this state&apos;s other provisions and official sources. This
            result does not establish that a household has no applicable rent or
            property-tax provision.
          </p>
          <button type="button" className="text-button" onClick={onShowAll}>
            Show all recorded programs
          </button>
        </div>
      )}
      {state.laterChanges.length > 0 && (
        <details className="later-changes">
          <summary>Later changes and timing</summary>
          <ul>
            {state.laterChanges.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      {state.researchNotes.length > 0 && (
        <details className="research-notes">
          <summary>Research boundaries</summary>
          <ul>
            {state.researchNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      <SourceLinks sources={state.sources} className="state-sources" />
    </section>
  );
}

function Comparison({
  states,
  slots,
  announcement,
  onChange,
  methodsHref,
}: {
  states: StateProfile[];
  slots: ComparisonSlots;
  announcement: string;
  onChange: (index: number, code: string) => void;
  methodsHref: string;
}) {
  return (
    <section
      className="comparison-section"
      id="compare"
      aria-labelledby="comparison-heading"
    >
      <div className="section-heading">
        <div>
          <div className="eyebrow">Compare program designs</div>
          <h2 id="comparison-heading">Compare state rules</h2>
        </div>
        <span>Choose up to three states</span>
      </div>
      <div className="comparison-selectors">
        {slots.map((code, index) => (
          <label key={index} htmlFor={`comparison-state-${index}`}>
            State {index + 1}
            <select
              id={`comparison-state-${index}`}
              aria-label={`State ${index + 1}`}
              value={code}
              onChange={(event) => onChange(index, event.target.value)}
            >
              <option value="">Choose a state</option>
              {states.map((state) => (
                <option
                  value={state.code}
                  key={state.code}
                  disabled={state.code !== code && slots.includes(state.code)}
                >
                  {state.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="comparison-status small-note" role="status">
        {announcement ||
          "The columns follow your selected order. Choose a blank option to remove a state."}
      </p>
      <div className="comparison-grid">
        {slots.map((code, index) => {
          const state = states.find((item) => item.code === code);
          const programs = state?.programs.filter(isComparisonProgram) ?? [];
          return (
            <article
              key={index}
              aria-label={
                state
                  ? `${state.name} comparison`
                  : `Comparison position ${index + 1}`
              }
            >
              <h3>{state?.name ?? `State ${index + 1}`}</h3>
              {!state && <p className="small-note">Choose a state above.</p>}
              {programs.map((program) => (
                <div className="comparison-program" key={program.id}>
                  <h4>{program.name}</h4>
                  <p className="eyebrow">{CATEGORY_LABELS[program.category]}</p>
                  <dl>
                    <div>
                      <dt>Housing</dt>
                      <dd>
                        {program.tenures
                          .map((tenure) =>
                            tenure === "owner" ? "Homeowners" : "Renters",
                          )
                          .join(" and ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Age</dt>
                      <dd>{program.ageRule}</dd>
                    </div>
                    <div>
                      <dt>Income definition</dt>
                      <dd>{program.incomeDefinition}</dd>
                    </div>
                    <div>
                      <dt>Income limits</dt>
                      <dd>{program.incomeLimits}</dd>
                    </div>
                    <div>
                      <dt>Benefit measure</dt>
                      <dd>{program.maximumBenefit}</dd>
                    </div>
                    <div>
                      <dt>Timing</dt>
                      <dd>{program.programYear}</dd>
                    </div>
                    <div>
                      <dt>Claiming</dt>
                      <dd>{program.application}</dd>
                    </div>
                  </dl>
                  <SourceLinks sources={program.sources} />
                </div>
              ))}
              {state && programs.length === 0 && (
                <p>
                  No statewide program recorded in the main comparison; see the
                  state profile for other provisions.
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="method-footnote">
        <strong>Research draft.</strong> These columns compare documented
        program rules. No validated national household estimates are available.
        Program maxima describe different eligibility rules and payment
        mechanisms; they do not rank states or estimate a household&apos;s tax
        change. <a href={methodsHref}>Read the calculation audit</a>.
      </p>
    </section>
  );
}

export function Explorer({
  states,
  coverage,
  methodsHref = appPath("/methods/"),
}: {
  states: StateProfile[];
  coverage: CoverageAudit | null;
  methodsHref?: string;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedCode, setSelectedCode] = useState("MA");
  const [comparison, setComparison] = useState<ComparisonSlots>([
    "CA",
    "MA",
    "MN",
  ]);
  const [announcement, setAnnouncement] = useState("");
  const { query, tenure, category, includeContext } = filters;
  const filtered = useMemo(
    () => filterStates(states, query, tenure, category, includeContext),
    [states, query, tenure, category, includeContext],
  );
  const selected =
    filtered.find((state) => state.code === selectedCode) ?? filtered[0];
  const programs = selected
    ? selectPrograms(selected, tenure, category, includeContext)
    : [];
  const comparisonFull = comparison.every(Boolean);

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }
  function changeComparison(index: number, code: string) {
    if (
      code &&
      comparison.some((value, position) => position !== index && value === code)
    )
      return;
    setComparison(
      (current) =>
        current.map((value, position) =>
          position === index ? code : value,
        ) as ComparisonSlots,
    );
    const state = states.find((item) => item.code === code);
    setAnnouncement(
      state
        ? `${state.name} selected in comparison position ${index + 1}.`
        : `Comparison position ${index + 1} cleared.`,
    );
  }
  function toggleComparison(code: string) {
    const existing = comparison.indexOf(code);
    const index = existing >= 0 ? existing : comparison.indexOf("");
    if (index < 0) return;
    changeComparison(index, existing >= 0 ? "" : code);
  }

  return (
    <>
      <section
        className="workspace"
        id="explore"
        aria-label="National program explorer"
      >
        <StatePicker
          states={states}
          filtered={filtered}
          selectedCode={selected?.code}
          filters={filters}
          onChange={updateFilters}
          onSelect={setSelectedCode}
        />
        {selected ? (
          <StateDetail
            methodsHref={methodsHref}
            state={selected}
            programs={programs}
            coverage={coverage}
            isCompared={comparison.includes(selected.code)}
            comparisonFull={comparisonFull}
            onCompare={() => toggleComparison(selected.code)}
            onShowAll={() =>
              updateFilters({
                includeContext: true,
                category: "all",
                tenure: "all",
              })
            }
          />
        ) : (
          <div className="no-credit">
            <h2>No matching state profiles</h2>
            <p>
              Clear or broaden the filters to explore the national inventory.
            </p>
          </div>
        )}
      </section>
      <Comparison
        states={states}
        slots={comparison}
        announcement={announcement}
        onChange={changeComparison}
        methodsHref={methodsHref}
      />
    </>
  );
}
