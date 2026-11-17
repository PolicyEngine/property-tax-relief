import { appPath, PUBLIC_TOOL_URL } from "@/lib/paths";
import { Explorer } from "@/components/Explorer";
import { loadCoverage, loadStates } from "@/lib/loadResearch";

export const metadata = {
  alternates: { canonical: PUBLIC_TOOL_URL + "/" },
  openGraph: { url: PUBLIC_TOOL_URL + "/" },
};

export default function Home() {
  const states = loadStates();
  const coverage = loadCoverage();
  return (
    <main className="page-width">
      <section className="intro">
        <div className="eyebrow">United States · 2025 program reference</div>
        <h1>
          Rent and property taxes
          <br />
          across states
        </h1>
        <div className="intro-bottom">
          <p>
            Compare selected income-tax credits and deductions for rent and
            property taxes, alongside rebates and property-tax bill programs.
            The inventory does not enumerate every subtraction or itemization
            rule.
          </p>
          <div className="intro-stat">
            <strong>{states.length}</strong>
            <span>jurisdictions</span>
          </div>
        </div>
      </section>
      <div className="draft-note">
        <strong>Research draft.</strong> The profiles cover selected provisions.
        The report provides no validated national household calculations.{" "}
        <a href={appPath("/methods/")}>Read the model-presence audit</a>
      </div>
      <Explorer states={states} coverage={coverage} />
    </main>
  );
}
