import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CR Clone",
  description: "Clash Royale clone - exact UI from screenshots, MySQL-backed content catalog, 10Hz authoritative server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0F1B3A] text-white antialiased">{children}</body>
    </html>
  );
}
