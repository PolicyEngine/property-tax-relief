"use client";

import { Header, Footer } from "@policyengine/ui-kit";
import { appPath } from "@/lib/paths";

export function SiteHeader() {
  return (
    <>
      <Header
        logoHref="https://www.policyengine.org/us"
        countries={[{ id: "us", label: "United States" }]}
        currentCountry="us"
        navItems={[
          {
            label: "Research",
            href: "https://www.policyengine.org/us/research",
          },
          {
            label: "Model",
            href: "https://www.policyengine.org/us/model/rules",
          },
          { label: "API", href: "https://www.policyengine.org/us/api" },
          { label: "Donate", href: "https://www.policyengine.org/us/donate" },
        ]}
      />
      <nav
        className="page-width report-toc"
        aria-label="Rent and property tax research"
      >
        <a href={appPath("/")}>Explore states</a>
        <a href={appPath("/report/")}>Read the report</a>
        <a href={appPath("/methods/")}>Data and methods</a>
      </nav>
    </>
  );
}

export function SiteFooter() {
  return (
    <Footer
      links={[
        { text: "PolicyEngine", href: "https://www.policyengine.org/us" },
        { text: "Sources and methods", href: appPath("/methods/") },
        {
          text: "Download the inventory",
          href: appPath("/data/inventory.csv"),
        },
      ]}
    />
  );
}
