import { ProgramDetail } from "@/components/ProgramDetail";
import { isComparisonProgram } from "@/lib/inventory";
import { loadCoverage, loadStates } from "@/lib/loadResearch";

export default function Report() {
  const states = loadStates();
  const coverage = loadCoverage();
  const cash = states.flatMap((s) => s.programs.filter(isComparisonProgram));
  const records = states.reduce((n, s) => n + s.programs.length, 0);
  return (
    <main className="page-width">
      <div className="reading-width">
        <section className="intro">
          <div className="eyebrow">National review · Research draft</div>
          <h1>Who gets property tax relief?</h1>
          <p>
            State credits, circuit breakers and renter credits use different
            definitions of income, housing costs and eligibility. This review
            records the rules in all 50 states and the District of Columbia,
            using program-specific 2025 reference periods and official sources
            checked on November 13–14, 2026.
          </p>
        </section>
        <div className="draft-note">
          <strong>Scope of this draft.</strong> The inventory covers{" "}
          {states.length} jurisdictions and records {records} programs,
          including selected context. The {cash.length} statewide credit/rebate
          records describe legal rules; validated national household
          calculations remain outstanding. The inventory does not establish
          exhaustive program coverage.
        </div>
        <nav className="report-toc" aria-label="Report contents">
          <a href="#findings">Findings</a>
          <a href="#comparison">Comparison framework</a>
          <a href="#timing">Timing and interactions</a>
          <a href="#profiles">All state profiles</a>
          <a href="/methods/">Methods and model audit</a>
          <a href="/data/inventory.csv" download>
            Download CSV
          </a>
        </nav>
        <section id="findings">
          <h2>Program names conceal different mechanisms</h2>
          <p>
            A threshold circuit breaker links relief to housing costs above a
            specified share of program income. Flat credits, income-tiered
            rebates, exemptions and repayable deferrals measure relief
            differently. The inventory classifies the mechanism separately from
            the program name.
          </p>
          <p>
            North Carolina calls one program a circuit breaker but{" "}
            <a href="https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-277.1B.html">
              defers qualifying property taxes
            </a>
            . California provides a{" "}
            <a href="https://www.ftb.ca.gov/file/personal/credits/nonrefundable-renters-credit.html">
              flat, nonrefundable renter credit
            </a>
            . Massachusetts offers qualifying seniors a{" "}
            <a href="https://www.mass.gov/info-details/senior-circuit-breaker-tax-credit">
              refundable credit based on housing expenses and income
            </a>
            . A comparison should retain these distinctions.
          </p>
        </section>
        <section id="comparison">
          <h2>Compare eligibility and usable relief</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>What the comparison records</th>
                <th>Why it changes the result</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Housing tenure</td>
                <td>Homeowners, renters, or both</td>
                <td>
                  A homeowner program may offer tenants no corresponding credit.
                </td>
              </tr>
              <tr>
                <td>Age and disability</td>
                <td>Program-specific qualifying conditions</td>
                <td>
                  A nominal maximum does not describe eligibility for a younger
                  household.
                </td>
              </tr>
              <tr>
                <td>Income</td>
                <td>Definition, people counted and income year</td>
                <td>
                  Federal adjusted gross income and program household income can
                  produce different eligibility.
                </td>
              </tr>
              <tr>
                <td>Refundability</td>
                <td>
                  Refundable payment, liability-limited credit, or bill
                  reduction
                </td>
                <td>
                  Income-tax liability may limit the value of a nonrefundable
                  credit.
                </td>
              </tr>
              <tr>
                <td>Housing expenses</td>
                <td>
                  Eligible taxes, statutory rent proxy and other allowed costs
                </td>
                <td>
                  Rent proxies serve legal calculations; they do not estimate
                  tax incidence.
                </td>
              </tr>
              <tr>
                <td>Administration</td>
                <td>Claiming route, documentation and deadlines</td>
                <td>
                  Eligibility alone does not establish actual participation.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            The interactive compares documented program designs across three
            selected states. Program maxima retain their source definitions. The
            draft does not combine maxima into state generosity rankings or
            calculated household totals.
          </p>
        </section>
        <section id="timing">
          <h2>Separate the income, tax and payment years</h2>
          <p>
            A 2025 reference can describe income, an assessment, property taxes
            paid, rent paid, or an application. Those events need separate
            labels. Each profile records the relevant dates and later changes.
          </p>
          <p>
            Minnesota{" "}
            <a href="https://www.revenue.state.mn.us/homeowners-homestead-credit-refund">
              increased its 2025 homeowner refund after a 2026 law change
            </a>
            . New Jersey&apos;s{" "}
            <a href="https://www.nj.gov/treasury/taxation/staynj/index.shtml">
              current Stay NJ guidance for the 2025 tax year
            </a>{" "}
            describes payments in 2027 and income-tiered annualized caps.
            Reproducing an older schedule would miss those revisions.
          </p>
          <h3>Account for overlapping relief</h3>
          <p>
            Some programs require a choice; others reduce an existing tax bill
            or offset another benefit. The profiles record these interactions.
            Kansas offers alternative refund routes, New Jersey coordinates
            ANCHOR, Senior Freeze and Stay NJ, and Wisconsin shows some credits
            directly on property-tax bills. Adding published maxima without
            those rules would overstate relief.
          </p>
          <p>
            Sources:{" "}
            <a href={states.find((s) => s.code === "KS")?.sources[0]?.url}>
              Kansas Department of Revenue
            </a>
            ,{" "}
            <a href="https://www.nj.gov/treasury/taxation/staynj/index.shtml">
              New Jersey Division of Taxation
            </a>
            , and{" "}
            <a href={states.find((s) => s.code === "WI")?.sources[0]?.url}>
              Wisconsin Department of Revenue
            </a>
            .
          </p>
        </section>
        <section>
          <h2>Build from existing national research</h2>
          <p>
            <a href="https://itep.org/circuit-breaker-credits-the-best-tools-for-property-tax-affordability/">
              ITEP&apos;s November 2026 circuit-breaker report
            </a>{" "}
            summarizes national policy features. The{" "}
            <a href="https://www.lincolninst.edu/data/">
              Lincoln Institute&apos;s Significant Features of the Property Tax
              database
            </a>{" "}
            provides state policy information and historical context. This
            inventory links program-level official sources and records the
            implementation work required for household comparisons.
          </p>
        </section>
        <section id="profiles">
          <h2>All {states.length} jurisdiction profiles</h2>
          <nav className="report-toc" aria-label="State profiles">
            {states.map((state) => (
              <a key={state.code} href={`#state-${state.code}`}>
                {state.code}
              </a>
            ))}
          </nav>
          {states.map((state) => (
            <article
              className="report-profile"
              key={state.code}
              id={`state-${state.code}`}
            >
              <div className="eyebrow">
                {state.code} ·{" "}
                {state.inventoryStatus === "partial"
                  ? "Open research question"
                  : "Initial source pass"}
              </div>
              <h2>{state.name}</h2>
              <p>{state.overview}</p>
              {state.programs.map((program) => (
                <ProgramDetail
                  key={program.id}
                  program={program}
                  coverage={coverage?.programs.find(
                    (row) => row.id === program.id,
                  )}
                />
              ))}
              {state.laterChanges.length > 0 && (
                <p>
                  <strong>Timing and later changes.</strong>{" "}
                  {state.laterChanges.join(" ")}
                </p>
              )}
              <p className="small-note">{state.researchNotes.join(" ")}</p>
              <div className="source-links">
                {state.sources.map((source) => (
                  <a key={source.url} href={source.url}>
                    {source.title} ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
        <section className="method-footnote">
          <p>
            Sources and definitions accompany each program. The inventory
            includes selected exemptions, deferrals, deductions, assessment
            limits and local options as context. Local relief and program
            interactions require further validation. See{" "}
            <a href="/methods/">the calculation audit and methods</a> for the
            release boundary.
          </p>
        </section>
      </div>
    </main>
  );
}
