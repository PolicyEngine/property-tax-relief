import type { Metadata } from "next";
import { Calculator } from "@/components/Calculator";
import { loadCalculatorPrograms } from "@/lib/calculatorData";
import { loadStates } from "@/lib/loadResearch";
import { PUBLIC_TOOL_URL } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Household estimates for rent and property taxes | PolicyEngine",
  description:
    "Calculate selected rent and property-tax program amounts with PolicyEngine for a single adult, and review model coverage across states.",
  alternates: { canonical: `${PUBLIC_TOOL_URL}/calculator/` },
  openGraph: { url: `${PUBLIC_TOOL_URL}/calculator/` },
};

export default function CalculatorPage() {
  const states = loadStates().map(({ code, name }) => ({ code, name }));
  const programs = loadCalculatorPrograms();

  return (
    <main className="page-width">
      <section className="intro">
        <div className="eyebrow">Rent and property taxes</div>
        <h1>Household estimates</h1>
        <div className="intro-bottom">
          <p>
            Enter household facts to calculate a selected credit, rebate, or
            deduction with PolicyEngine.
          </p>
        </div>
      </section>
      <div className="draft-note">
        <strong>Calculator preview.</strong> Model coverage varies by program.
      </div>
      <Calculator programs={programs} states={states} />
    </main>
  );
}
