import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/Chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rent and property taxes across states | PolicyEngine",
  description:
    "Review selected income-tax credits and deductions for rent and property taxes, alongside rebates and bill programs. Subtractions and itemization remain under review.",
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
