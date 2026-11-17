import { appPath, PUBLIC_TOOL_URL } from "@/lib/paths";
import {
  canonicalCommitLabel,
  loadCoverage,
  loadStates,
} from "@/lib/loadResearch";
import { isComparisonProgram } from "@/lib/inventory";

export const metadata = {
  alternates: { canonical: PUBLIC_TOOL_URL + "/methods/" },
  openGraph: { url: PUBLIC_TOOL_URL + "/methods/" },
};

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
            The legal inventory describes official program rules. The source
            audit checks for matching model declarations; it does not determine
            whether a calculation reproduces those rules.
          </p>
        </section>
        <div className="draft-note">
          <strong>National calculation release remains closed.</strong> The
          draft reports program rules and matching model declarations. It
          contains no validated national household benefit estimates.
        </div>
        <section>
          <h2>Research scope</h2>
          <p>
            The inventory has profiles for all 50 states and the District of
            Columbia. Its scope covers income-tax credits, deductions and
            subtractions tied to rent or property taxes, alongside separate
            rebates and property-tax bill programs. Current records cover
            selected provisions; a systematic state-return and statute audit
            remains open. Exemptions, deferrals, assessment limits and local
            options appear as context outside the main comparison.
          </p>
          <p>
            Each profile records a 2025 program reference and its initial
            source-pass date, November 13–14, 2026. Targeted follow-up checks on
            November 17, 2026 supplement that pass. The program-year field
            identifies differences among assessment, income, tax-payment, filing
            and benefit-payment years. The profile includes later changes where
            research identified them. A source-check date does not establish
            that every provision has received a legal audit.
          </p>
          <p>
            Official agency guidance, forms and statutes supply the program
            descriptions. An unrecorded program does not establish that no
            provision exists. The inventory does not enumerate every income-tax
            deduction or subtraction, local program, military benefit, disaster
            provision or parcel-specific exemption. Housing tenure refers to
            ownership or rental of the dwelling. Owners of a dwelling on leased
            land appear under homeowners.
          </p>
        </section>
        <section>
          <h2>Downloads</h2>
          <ul>
            <li>
              <a href={appPath("/data/inventory.json")} download>
                Program inventory (JSON)
              </a>
            </li>
            <li>
              <a href={appPath("/data/inventory.csv")} download>
                Program inventory (CSV)
              </a>
            </li>
            <li>
              <a href={appPath("/data/coverage.json")} download>
                Model-presence audit (JSON)
              </a>
            </li>
            <li>
              <a href={appPath("/data/summary.json")} download>
                Inventory counts and definitions (JSON)
              </a>
            </li>
          </ul>
        </section>
        <section>
          <h2>Housing-expense model routes</h2>
          <p>
            Explore selected source dependencies for personal rent and
            property-tax expenses in all 50 states and the District of Columbia
            for 2025. Route kinds separate deductions, credits and credit
            components, rebates, property-bill reductions and income add-backs.
            Itemization and base fields describe selected state and federal
            source paths.
          </p>
          <p>
            Source snapshot:{" "}
            <a href="https://github.com/PolicyEngine/policyengine-us/tree/5b18694981c758e0ae52042eb103e55e0333c7ef">
              PolicyEngine US, commit 5b18694981
            </a>
            . The index does not validate legal entitlement, household amounts,
            runtime behavior or the live API model version. Missing routes do
            not establish legal absence or a zero benefit. CSV rows retain these
            limits and the false validation flags alongside their source
            records.
          </p>
          <ul>
            <li>
              <a
                href={appPath("/data/housing-expense-model-routes.json")}
                download
              >
                Housing-expense source index (JSON)
              </a>
            </li>
            <li>
              <a
                href={appPath("/data/housing-expense-model-routes.csv")}
                download
              >
                Housing-expense source index (CSV)
              </a>
            </li>
          </ul>
        </section>
        <section>
          <h2>Model-presence audit</h2>
          <p>
            The audit reads declared variable classes in the pinned release and
            compares them with the inventory&apos;s model-variable references.
            It requires an undated formula, a formula starting by 2025, or an
            adds/subtracts declaration; input-only variables and formulas that
            begin later enter the gap list. It does not execute formulas,
            establish legal equivalence or verify all eligibility conditions. We
            record newer canonical source presence separately. This syntactic
            check ignores end dates and does not establish that a declaration
            applies to a claim in 2025.
          </p>
          {coverage && (
            <>
              <p>
                Installed interface:{" "}
                <strong>policyengine {coverage.interfaceVersion}</strong>.
                Installed country model:{" "}
                <strong>policyengine-us {coverage.modelVersion}</strong>.
                Canonical source:{" "}
                <code>
                  {canonicalCommitLabel(coverage.canonicalModelCommit)}
                </code>
                .
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
                    <td>Statewide program records in the main comparison</td>
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
                  Recorded comparison programs requiring implementation or
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
            PolicyEngine run for that scenario. A tax calculation requires the
            correct income definition, household composition, age, disability
            status, housing expenses, prior-year facts and filing assumptions.
            Nonrefundable credits require tax-liability calculations. Deductions
            and subtractions require the relevant taxable-income, itemization,
            election and conformity rules. An allowed deduction is not itself a
            tax saving. Program interactions need explicit checks.
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
              The inventory does not yet enumerate every state-return credit,
              deduction, subtraction, itemization rule or conformity provision.
            </li>
            <li>
              Coverage of local programs and exemptions remains selective.
              External inventories use different program definitions and
              grouping.
            </li>
            <li>
              Some profiles retain unresolved questions about law changes and
              form versions for their stated reference years.
            </li>
            <li>
              The report does not calculate how program interactions, parcel
              details or local levies affect household amounts.
            </li>
            <li>National household calculations remain unvalidated.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
