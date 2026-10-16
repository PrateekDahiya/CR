import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CR Clone",
  description: "Clash Royale clone - lobby, deck builder and battle shell (Phase 1 scaffolding)"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
