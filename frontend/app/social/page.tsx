"use client";

import { useEffect, useState } from "react";
import { PageShell, CRButton } from "../../components/ui";
import { backendUrl, getCatalog } from "../../lib/api";

// Clan tab only. The dedicated /leaderboard tab owns ranking; this screen must
// not duplicate it with an embedded table or link.
export default function SocialPage() {
  const [cardCount, setCardCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCatalog(backendUrl())
      .then((cat) => {
        if (!cancelled) setCardCount(cat.catalog.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell active="social" topBarCurrencies={{ cards: 0, coins: 0, gems: 0 }}>
      <div className="px-3 py-3">
        <section
          data-testid="social-clan"
          className="rounded-xl border-2 border-amber-700 bg-gradient-to-b from-amber-900/40 to-amber-950/40 p-4 text-center"
        >
          <h1 className="text-xl font-extrabold text-white">Clan</h1>
          <p className="mt-2 text-sm text-slate-200">
            Clan chat, donations and war tracking are coming soon.
          </p>
          <div className="mt-3 flex justify-center">
            <CRButton variant="blue" size="md" testId="clan-join" icon="+">
              Join a Clan
            </CRButton>
          </div>
        </section>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Catalog backed by <code className="text-amber-300">{cardCount}</code> cards.
        </p>
      </div>
    </PageShell>
  );
}
