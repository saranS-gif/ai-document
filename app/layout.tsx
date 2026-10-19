import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClauseClear — Understand Before You Sign",
  description: "Plain-language contract explanations and evidence-based clause flags."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
