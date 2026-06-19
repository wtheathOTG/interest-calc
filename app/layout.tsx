import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savings Calculator",
  description: "Project brokerage, retirement, and HSA balances with tax-aware totals."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="dark" lang="en">
      <body>{children}</body>
    </html>
  );
}
