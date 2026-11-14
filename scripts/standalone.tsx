import React from "react";
import { createRoot } from "react-dom/client";
import { Header, Footer } from "@policyengine/ui-kit";
import { Explorer } from "../components/Explorer";
import inventory from "../public/data/inventory.json";
import audit from "../public/data/coverage.json";
import type { CoverageAudit, StateProfile } from "../lib/types";

const states = inventory as StateProfile[];
const coverage = audit as CoverageAudit;

function OfflineResearch() {
  return (
    <>
      <Header
        logoHref="https://www.policyengine.org/us"
        navItems={[
          { label: "Explore states", href: "index.html" },
          { label: "Read the report", href: "report.html" },
          { label: "Data and methods", href: "methods.html" },
        ]}
      />
      <main className="page-width">
        <section className="intro">
          <div className="eyebrow">United States · 2025 program reference</div>
          <h1>
            Rent and property taxes
            <br />
            across states.
          </h1>
          <div className="intro-bottom">
            <p>
              Explore income-tax credits and deductions, circuit breakers,
              renter credits, separate rebates and property-bill programs.
              Compare eligibility, benefit rules and claiming requirements
              across states.
            </p>
            <div className="intro-stat">
              <strong>{states.length}</strong>
              <span>jurisdictions</span>
            </div>
          </div>
        </section>
        <div className="draft-note">
          <strong>Research draft.</strong> State profiles describe sourced
          rules. Household calculations and independent review remain
          incomplete. <a href="methods.html">Read the coverage audit ↗</a>
        </div>
        <Explorer
          states={states}
          coverage={coverage}
          methodsHref="methods.html"
        />
      </main>
      <Footer
        links={[
          { text: "PolicyEngine", href: "https://www.policyengine.org/us" },
          { text: "Sources and methods", href: "methods.html" },
          { text: "Download the inventory", href: "inventory.csv" },
        ]}
      />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing research viewer root");
createRoot(root).render(<OfflineResearch />);
