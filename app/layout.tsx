import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enablement OS",
  description: "Assess your business, choose priorities, execute a 90-day plan and track results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
