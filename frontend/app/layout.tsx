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
      <body>
        <nav className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200">
          <a href="/" className="font-bold tracking-tight hover:text-white">
            CR Clone
          </a>
          <a href="/" className="hover:text-white">
            Menu
          </a>
          <a href="/lobby" className="hover:text-white">
            Lobby
          </a>
          <a href="/deck" className="hover:text-white">
            Deck
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
