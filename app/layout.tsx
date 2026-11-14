import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/Chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Property tax relief across America | PolicyEngine",
  description:
    "Explore sourced property-tax credits, circuit breakers and renter credits in all 50 states and the District of Columbia.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
