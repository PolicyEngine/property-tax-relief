import { appPath, PUBLIC_TOOL_URL } from "@/lib/paths";
import { ProgramDetail } from "@/components/ProgramDetail";
import { isComparisonProgram } from "@/lib/inventory";
import { loadCoverage, loadStates } from "@/lib/loadResearch";

export const metadata = {
  alternates: { canonical: PUBLIC_TOOL_URL + "/report" },
  openGraph: { url: PUBLIC_TOOL_URL + "/report" },
};

export default function Report() {
  const states = loadStates();
  const coverage = loadCoverage();
  const comparison = states.flatMap((s) =>
    s.programs.filter(isComparisonProgram),
  );
  const records = states.reduce((n, s) => n + s.programs.length, 0);
  return (
    <main className="page-width">
      <div className="reading-width">
        <section className="intro">
          <div className="eyebrow">National review · Research draft</div>
          <h1>Rent and property taxes across states</h1>
          <p>
            State income-tax credits, deductions and subtractions for rent and
            property taxes sit alongside separate rebates and property-tax bill
            programs. This review records selected provisions in all 50 states
            and the District of Columbia, using program-specific 2025 reference
            periods and official sources checked on November 13–14, 2026.
          </p>
        </section>
        <div className="draft-note">
          <strong>Scope of this draft.</strong> The inventory covers{" "}
          {states.length} jurisdictions and records {records} programs,
          including selected context. The {comparison.length} statewide records
          in the main comparison describe program rules; validated national
          household calculations remain outstanding. The systematic audit of
          deductions, subtractions and itemization rules remains open. This
          inventory does not establish exhaustive program coverage.
        </div>
        <nav className="report-toc" aria-label="Report contents">
          <a href="#findings">Findings</a>
          <a href="#comparison">Comparison framework</a>
          <a href="#timing">Timing and interactions</a>
          <a href="#benchmarks">Other research and coverage gaps</a>
          <a href="#profiles">All state profiles</a>
          <a href={appPath("/methods/")}>Methods and model audit</a>
          <a href={appPath("/data/inventory.csv")} download>
            Download CSV
          </a>
        </nav>
        <section id="findings">
          <h2>Program names conceal different mechanisms</h2>
          <p>
            A threshold circuit breaker links a credit to housing costs above a
            specified share of program income. Other credits reduce tax
            liability, deductions and subtractions reduce taxable income, and
            rebates may arrive as separate payments. Exemptions, tax limits and
            repayable deferrals have their own effects. The inventory records
            the mechanism separately from the program name.
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
          <h2>Compare eligibility and tax treatment</h2>
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
                <td>Deduction or subtraction</td>
                <td>Allowed income reduction and its limits</td>
                <td>
                  A deductible amount is not a dollar-for-dollar tax reduction;
                  its value depends on the tax return.
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
        <section id="benchmarks">
          <h2>Other research and coverage gaps</h2>
          <p>
            Existing inventories provide different views of rent and property
            taxes. Their dates, program definitions and geographic coverage
            differ, so their totals cannot be compared directly with this
            inventory&apos;s record count.
          </p>
          <ul>
            <li>
              The{" "}
              <a href="https://apps.lincolninst.edu/data/significant-features-property-tax/access-database/residential-property-tax-relief-programs">
                Lincoln Institute&apos;s Significant Features of the Property
                Tax residential database
              </a>{" "}
              supplies 2024 program records spanning credits, exemptions,
              assessment freezes, deferrals and local options. A record can
              describe an umbrella program or a subgroup.
            </li>
            <li>
              <a href="https://itep.org/circuit-breaker-credits-the-best-tools-for-property-tax-affordability/">
                ITEP&apos;s November 9, 2026 circuit-breaker report
              </a>{" "}
              lists 47 program rows in Appendix B, with income limits described
              as current in July 2026 and some older source data. Its
              circuit-breaker definition includes some income-based exemptions.
            </li>
            <li>
              <a href="https://my.aarpfoundation.org/property-taxes/programs-by-state/">
                AARP Foundation&apos;s Property Tax-Aide state guides
              </a>{" "}
              update on a rolling basis and combine statewide programs with
              county variants. They do not supply a single comparable reference
              year or normalized national program total.
            </li>
            <li>
              The{" "}
              <a href="https://legislature.maine.gov/doc/12515">
                Progress and Poverty Institute and Center for Land Economics
                mid-2026 Maine report
              </a>{" "}
              examines Maine&apos;s Property Tax Fairness Credit, homestead
              exemption and state property-tax deferral. Its Maine focus does
              not constitute a national program inventory.
            </li>
          </ul>
          <p>
            Current income-tax coverage includes selected renter credits,
            Massachusetts and Indiana rent deductions, and Indiana and New
            Jersey property-tax deductions. Separate records describe selected
            circuit breakers, rebates and bill credits. Exemptions, deferrals,
            assessment limits and local options remain contextual categories.
            State-return subtractions, itemization rules and federal-state
            conformity still require a systematic audit.
          </p>
          <p>
            Cross-checks also identify programs that this draft has not yet
            enumerated, including Montana disabled-veteran assistance,
            Washington veteran-survivor grants, South Dakota&apos;s paraplegic
            tax reduction, Hawaii county circuit breakers, and Maine&apos;s
            homestead exemption and property-tax deferral. Some existing records
            group several qualifying categories. These differences prevent an
            exhaustive-coverage claim or a national completeness percentage.
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
            includes selected income-tax provisions, rebates and bill programs,
            with exemptions, deferrals, assessment limits and local options as
            context. Coverage, local rules and program interactions require
            further validation. See{" "}
            <a href={appPath("/methods/")}>the calculation audit and methods</a>{" "}
            for the release boundary.
          </p>
        </section>
      </div>
    </main>
  );
}
