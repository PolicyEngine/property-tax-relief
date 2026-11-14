import { Explorer } from "@/components/Explorer";
import { loadCoverage, loadStates } from "@/lib/loadResearch";

export default function Home() {
  const states = loadStates();
  const coverage = loadCoverage();
  return (
    <main className="page-width">
      <section className="intro">
        <div className="eyebrow">United States · 2025 program reference</div>
        <h1>
          Property tax relief
          <br />
          across America.
        </h1>
        <div className="intro-bottom">
          <p>
            Explore who qualifies for property-tax credits, circuit breakers and
            renter credits. Compare eligibility, benefit rules and claiming
            requirements across states.
          </p>
          <div className="intro-stat">
            <strong>{states.length}</strong>
            <span>jurisdictions</span>
          </div>
        </div>
      </section>
      <div className="draft-note">
        <strong>Research draft.</strong> State profiles describe sourced rules.
        Household calculations and the independent review remain incomplete.{" "}
        <a href="/methods/">Read the coverage audit ↗</a>
      </div>
      <Explorer states={states} coverage={coverage} />
    </main>
  );
}
