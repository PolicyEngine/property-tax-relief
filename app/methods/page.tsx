import { appPath, PUBLIC_TOOL_URL } from "@/lib/paths";
import {
  canonicalCommitLabel,
  loadCoverage,
  loadStates,
} from "@/lib/loadResearch";
import { isComparisonProgram } from "@/lib/inventory";
import { loadCalculatorContracts } from "@/lib/calculatorData";
import calculatorMetadata from "@/data/calculator/model-metadata.json";
import calculationCases from "@/data/calculator/validation-cases.json";

export const metadata = {
  alternates: { canonical: PUBLIC_TOOL_URL + "/methods/" },
  openGraph: { url: PUBLIC_TOOL_URL + "/methods/" },
};

export default function Methods() {
  const coverage = loadCoverage();
  const states = loadStates();
  const contracts = loadCalculatorContracts();
  const programCount = states.reduce(
    (count, state) => count + state.programs.length,
    0,
  );
  const calculatorJurisdictions = new Set(contracts.map(({ state }) => state))
    .size;
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
            The legal inventory describes official program rules. The
            model-presence audit checks for matching model declarations; it does
            not determine whether a calculation reproduces those rules.
          </p>
        </section>
        <div className="draft-note">
          <strong>No national household calculations.</strong> The report
          describes program rules and matching model declarations. It contains
          no validated national household benefit estimates.
        </div>
        <section>
          <h2>Research scope</h2>
          <p>
            The inventory has profiles for all 50 states and the District of
            Columbia. Its scope covers income-tax credits, deductions and
            subtractions tied to rent or property taxes, alongside separate
            rebates and property-tax bill programs. Current records cover
            selected provisions and do not enumerate every state-return or
            statutory provision. Exemptions, deferrals, assessment limits and
            local options appear as context outside the main comparison.
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
          <h2>Household calculations</h2>
          <p>
            The calculator supports 2025 scenarios for one adult filing as
            single, with no spouse or dependents. It calculates{" "}
            {contracts.length} programs across {calculatorJurisdictions}{" "}
            jurisdictions. Enter qualified expenses and any requested tax-form
            amounts. Each program lists the other qualifications it assumes.
            Income tax deductions reduce taxable income. Assessed value
            exemptions reduce the value subject to property tax. California’s
            renter credit estimate precedes the income tax liability limit.
          </p>
          <p>
            Connecticut calculations cover qualified primary-residence taxes
            only, with the tax-liability limit from CT-1040, line 10.
            Motor-vehicle tax claims require the full Schedule 3. Michigan and
            Pennsylvania calculations cover renters; Pennsylvania's preview
            excludes mixed owner-renter claims. Oklahoma calculations cover
            homestead owners. For New Jersey, PolicyEngine selects either the
            deduction or credit; a zero for one can reflect selection of the
            other. Enter the stated form-line values, including Michigan's total
            household resources and New Jersey's income before the property-tax
            deduction.
          </p>
          <p>
            Michigan's preview excludes claims that use the senior status for an
            unremarried surviving spouse whose spouse was 65 or older at death.
            See{" "}
            <a href="https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/MI-1040CR.pdf#page=1">
              2025 Form MI-1040CR, box 5a
            </a>
            .
          </p>
          <p>
            Hawaii excludes taxpayers whom another taxpayer could claim as a
            dependent, even if nobody claims them. The preview cannot evaluate
            that condition, so Hawaii's renter credit remains unavailable. See{" "}
            <a href="https://files.hawaii.gov/tax/forms/2025/n11ins.pdf#page=26">
              2025 Schedule X, Part I
            </a>
            .
          </p>
          <p>
            The calculator sends each entered scenario to PolicyEngine's rules
            engine through the website's household-calculation API. Missing,
            null, and nonnumeric outputs remain unavailable.
          </p>
          <p>
            PolicyEngine US {calculatorMetadata.modelVersion} supplies the
            calculator’s input and output metadata. Each request uses the model
            that PolicyEngine serves at the time of calculation.
          </p>
          <p>
            Saved API responses match the expected amounts in{" "}
            <a href="https://github.com/PolicyEngine/property-tax-relief/blob/162324da25d515fba89021d8d364320b42d45848/data/calculator/validation-cases.json">
              {calculationCases.length} source-derived cases
            </a>{" "}
            for the enabled calculations. Those cases do not validate other
            household scenarios.
          </p>
          <p>
            All 50 states and DC appear in the selector alongside {programCount}{" "}
            selected program and context records. The selector marks programs
            that lack household calculations.
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
                Inventory counts (JSON)
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
            establish legal equivalence or verify all eligibility conditions.
            The audit records newer canonical source presence separately. This
            syntactic check ignores end dates and does not establish that a
            declaration applies to a claim in 2025.
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
                    <td>National household-calculation validation</td>
                    <td>No validated national estimates</td>
                  </tr>
                </tbody>
              </table>
              <p className="small-note">
                Counts describe inventory records. They do not count
                independently validated laws or every state relief program.
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
          <h2>Research boundaries</h2>
          <ul>
            {states
              .filter((s) => s.inventoryStatus === "partial")
              .map((state) => (
                <li key={state.code}>
                  <strong>{state.name}.</strong> {state.researchNotes.join(" ")}
                </li>
              ))}
            <li>
              The inventory does not enumerate every state-return credit,
              deduction, subtraction, itemization rule or conformity provision.
            </li>
            <li>
              The inventory covers selected local programs and exemptions.
              External inventories use different program definitions and
              grouping.
            </li>
            <li>
              Some profiles identify uncertain law changes and form versions for
              their stated reference years.
            </li>
            <li>
              The report does not calculate how program interactions, parcel
              details or local levies affect household amounts.
            </li>
            <li>
              The report provides no validated national household calculations.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
