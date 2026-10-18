"use client";

export interface ActionToastProps {
  message: string | null;
  tone?: "ok" | "warn";
  onDone?: () => void;
}

// Small confirmation strip used after deck edits so "Use" / "Remove" always
// give visible feedback. Auto-clears after `ttl` ms (handled by the caller).
export default function ActionToast({ message, tone = "ok" }: ActionToastProps) {
  if (!message) return null;
  return (
    <div
      data-testid="deck-toast"
      role="status"
      className={[
        "pointer-events-none fixed inset-x-0 bottom-20 z-[70] mx-auto w-fit max-w-[90%] rounded-lg border-2 px-3 py-1.5 text-center text-xs font-extrabold shadow-lg",
        tone === "ok"
          ? "border-emerald-500 bg-[#0b2a1c]/95 text-emerald-200"
          : "border-amber-500 bg-[#2a1c05]/95 text-amber-200",
      ].join(" ")}
    >
      {message}
    </div>
  );
}