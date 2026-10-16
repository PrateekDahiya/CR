import DeckBuilder from "../../components/deck/DeckBuilder";

export const metadata = {
  title: "Deck Builder — CR Clone",
};

export default function DeckPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 p-4 text-slate-100 sm:p-8">
      <div className="mb-4 w-full max-w-3xl">
        <a href="/" className="text-xs text-sky-400 hover:text-sky-300">
          ← Back to menu
        </a>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Deck Builder</h1>
        <p className="text-sm text-slate-400">Pick 8 distinct cards, max 2 spells. Auto-saved locally.</p>
      </div>
      <DeckBuilder />
    </main>
  );
}
