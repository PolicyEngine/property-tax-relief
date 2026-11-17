import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader, SiteFooter } from "@/components/Chrome";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-report-inter",
});

export const metadata: Metadata = {
  title: "Rent and property taxes across states | PolicyEngine",
  description:
    "Review selected income-tax credits and deductions for rent and property taxes, alongside rebates and bill programs. The inventory does not enumerate every subtraction or itemization rule.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${inter.variable}`}>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
