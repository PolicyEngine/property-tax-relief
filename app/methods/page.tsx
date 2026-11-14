import { loadCoverage, loadStates } from "@/lib/loadResearch";
import { isComparisonProgram } from "@/lib/inventory";

export default function Methods() {
  const coverage = loadCoverage();
  const states = loadStates();
  const comparison =
    coverage?.programs.filter((p) => p.status !== "context") ?? [];
  const found = comparison.filter((p) => p.status === "implementation-found");
  const missing = comparison.filter(
    (p) => p.status === "implementation-missing",
  );
  return (
    <main className="page-width">
      <div className="reading-width">
        <section className="intro">
          <div className="eyebrow">Data, provenance and boundaries</div>
          <h1>Sources and methods.</h1>
          <p>
            The legal inventory and model audit answer different questions: what
            an official source describes, which implementation exists, and
            whether a calculation reproduces the rule.
          </p>
        </section>
        <div className="draft-note">
          <strong>National calculation release remains closed.</strong> The
          draft reports program rules and source-level implementation presence.
          It contains no validated national household benefit estimates.
        </div>
        <section>
          <h2>Research scope</h2>
          <p>
            The inventory covers all 50 states and the District of Columbia. It
            focuses on statewide property-tax credits, circuit breakers, rebates
            and renter credits. It includes selected exemptions, deductions,
            deferrals, tax limits and local options to explain relief outside
            the cash-credit comparison.
          </p>
          <p>
            Each profile records a 2025 program reference and a source-check
            date of November 13, 2026. The program-year field identifies
            differences among assessment, income, tax-payment, filing and
            benefit-payment years. The profile includes later changes where
            research identified them. A source-check date does not establish
            that every provision has received a legal audit.
          </p>
          <p>
            Official agency guidance, forms and statutes supply the program
            descriptions. “No statewide credit identified” describes the
            research result, not proof that no relief exists. The inventory does
            not enumerate every local program, military benefit, disaster
            provision or parcel-specific exemption. Housing tenure refers to
            ownership or rental of the dwelling. Owners of a dwelling on leased
            land appear under homeowners.
          </p>
        </section>
        <section>
          <h2>Downloads</h2>
          <ul>
            <li>
              <a href="/data/inventory.json" download>
                Program inventory (JSON)
              </a>
            </li>
            <li>
              <a href="/data/inventory.csv" download>
                Program inventory (CSV)
              </a>
            </li>
            <li>
              <a href="/data/coverage.json" download>
                Model-presence audit (JSON)
              </a>
            </li>
            <li>
              <a href="/data/summary.json" download>
                Inventory counts and definitions (JSON)
              </a>
            </li>
          </ul>
        </section>
        <section>
          <h2>Model-presence audit</h2>
          <p>
            The audit reads declared variable classes in the pinned release and
            compares them with the inventory&apos;s model-variable references.
            It requires a formula or declarative calculation available by 2025;
            input-only variables and formulas that begin later enter the gap
            list. It does not execute formulas, establish legal equivalence or
            verify all eligibility conditions. Newer canonical source presence
            is recorded separately.
          </p>
          {coverage && (
            <>
              <p>
                Installed interface:{" "}
                <strong>policyengine {coverage.interfaceVersion}</strong>.
                Installed country model:{" "}
                <strong>policyengine-us {coverage.modelVersion}</strong>.
                Canonical source inspected:{" "}
                <code>{coverage.canonicalModelCommit.slice(0, 12)}</code>.
              </p>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Audit measure</th>
                    <th>Program records</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Statewide credit/rebate records in the comparison</td>
                    <td>{comparison.length}</td>
                  </tr>
                  <tr>
                    <td>Matching calculation declaration found</td>
                    <td>{found.length}</td>
                  </tr>
                  <tr>
                    <td>Implementation or mapping gap</td>
                    <td>{missing.length}</td>
                  </tr>
                  <tr>
                    <td>Validated household-calculation coverage</td>
                    <td>Outstanding</td>
                  </tr>
                </tbody>
              </table>
              <p className="small-note">
                Counts describe inventory records, not a count of independently
                validated laws or an exhaustive count of state relief programs.
              </p>
            </>
          )}
        </section>
        <section>
          <h2>Calculation gaps by state</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>State</th>
                <th>
                  Recorded credit/rebate programs requiring implementation or
                  mapping
                </th>
              </tr>
            </thead>
            <tbody>
              {states.map((state) => {
                const gaps = state.programs
                  .filter(isComparisonProgram)
                  .filter((program) =>
                    missing.some((row) => row.id === program.id),
                  );
                return gaps.length ? (
                  <tr key={state.code}>
                    <td>{state.name}</td>
                    <td>{gaps.map((p) => p.name).join("; ")}</td>
                  </tr>
                ) : null;
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Household-calculation requirements</h2>
          <p>
            Every displayed household amount must come from an actual
            PolicyEngine run for that scenario. A usable credit requires the
            correct income definition, household composition, age, disability
            status, housing expenses, prior-year facts and filing assumptions.
            Nonrefundable credits also require tax-liability calculations.
            Program interactions need explicit checks.
          </p>
          <p>
            Source-derived examples, boundary tests, accounting and cap
            invariants, and comparison with official schedules must precede
            publication of national totals. A missing implementation must never
            appear as a $0 benefit. A statutory percentage of rent is a
            calculation input, not measured tax incidence. Eligibility estimates
            do not establish take-up or fiscal expenditure.
          </p>
        </section>
        <section>
          <h2>Open research</h2>
          <ul>
            {states
              .filter((s) => s.inventoryStatus === "partial")
              .map((state) => (
                <li key={state.code}>
                  <strong>{state.name}.</strong> {state.researchNotes.join(" ")}
                </li>
              ))}
            <li>
              Reconcile retrospective law changes and form revisions with the
              relevant program year.
            </li>
            <li>
              Verify interactions and parcel or local-levy requirements before
              combining benefits.
            </li>
            <li>Complete independent review before public release.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
