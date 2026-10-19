import type { Metadata } from "next";
import "./globals.css";
import { PlayerProvider } from "../lib/playerContext";
import BattleGuard from "../components/ui/BattleGuard";
import AuthGuard from "../components/ui/AuthGuard";

export const metadata: Metadata = {
  title: "CR Clone",
  description: "Clash Royale clone - exact UI from screenshots, MySQL-backed content catalog, 10Hz authoritative server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0F1B3A] text-white antialiased">
        <PlayerProvider>
          <AuthGuard />
          <BattleGuard />
          {children}
        </PlayerProvider>
      </body>
    </html>
  );
}
