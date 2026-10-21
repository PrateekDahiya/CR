"use client";

import { useEffect, useRef } from "react";
import { CARD_LIST } from "../../lib/cards";
import { drawCardSprite, preloadCardSprite } from "../../lib/battle/spriteAnim";

const STATES = [
  { state: "idle" as const, now: 0 },
  { state: "walk" as const, now: 120 },
  { state: "attack" as const, now: 0 },
  { state: "death" as const, now: 0 },
];

const TEAMS = [
  { team: "red" as const, label: "front" },
  { team: "blue" as const, label: "back" },
];

function CardPreview({ id, name, type }: { id: string; name: string; type: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    preloadCardSprite(id, "red");
    preloadCardSprite(id, "blue");
    let timer = 0;
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const c = canvas.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "#0f1b3a";
      c.fillRect(0, 0, canvas.width, canvas.height);
      TEAMS.forEach((row, rowIndex) => {
        STATES.forEach((entry, column) => {
          const cx = 8 + column * 60 + 30;
          const cy = 8 + rowIndex * 60 + 30;
          c.save();
          c.translate(cx, cy);
          drawCardSprite(c, id, entry.state, entry.now, 52, 1, 1, row.team);
          c.restore();
        });
      });
    };
    draw();
    timer = window.setInterval(draw, 250);
    return () => window.clearInterval(timer);
  }, [id]);

  return (
    <div
      data-testid={`anim-card-${id}`}
      className="rounded-lg border border-slate-600 bg-slate-900/70 p-1"
      title={`${name} (${type}) - red front / blue back`}
    >
      <canvas ref={ref} width={248} height={128} className="block h-[128px] w-[248px]" />
      <div className="truncate text-center text-[9px] font-bold text-white/90">{name}</div>
    </div>
  );
}

export default function AnimationsPage() {
  return (
    <main className="min-h-screen bg-[#0F1B3A] p-2 text-white">
      <header className="mb-2 flex items-end justify-between">
        <div>
          <h1 className="text-lg font-extrabold">Animation Lab</h1>
          <p className="text-[10px] text-slate-300">
            {CARD_LIST.length} cards - idle / walk / attack / death, red front view on top, blue back view
            below
          </p>
        </div>
        <span className="text-[10px] text-slate-400">/sprites/&lt;card&gt;-&lt;view&gt;.png (8 frames)</span>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" data-testid="anim-gallery">
        {CARD_LIST.map((card) => (
          <CardPreview key={card.id} id={card.id} name={card.name} type={card.type} />
        ))}
      </div>
    </main>
  );
}
