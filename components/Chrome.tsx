"use client";

import { Header, Footer } from "@policyengine/ui-kit";

export function SiteHeader() {
  return (
    <Header
      logoHref="https://www.policyengine.org/us"
      countries={[{ id: "us", label: "United States" }]}
      currentCountry="us"
      navItems={[
        { label: "Explore states", href: "/" },
        { label: "Read the report", href: "/report/" },
        { label: "Data and methods", href: "/methods/" },
      ]}
    />
  );
}

export function SiteFooter() {
  return (
    <Footer
      links={[
        { text: "PolicyEngine", href: "https://www.policyengine.org/us" },
        { text: "Sources and methods", href: "/methods/" },
        { text: "Download the inventory", href: "/data/inventory.csv" },
      ]}
    />
  );
}
