import { PageShell } from "../../components/ui";
import DeckBuilder from "../../components/deck/DeckBuilder";

export const metadata = { title: "Deck Builder — CR Clone" };

export default function DeckPage() {
  return (
    <PageShell active="cards" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
      <div className="px-3 py-3">
        <header className="mb-3">
          <a href="/" className="text-xs text-sky-300 hover:text-sky-200">← Back to menu</a>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white">Deck Builder</h1>
          <p className="text-sm text-slate-300">Pick 8 distinct cards, max 2 spells. Auto-saved locally.</p>
        </header>
        <DeckBuilder />
      </div>
    </PageShell>
  );
}
