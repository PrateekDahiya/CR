// CR Clone design tokens (Phase 11, MEMORY#18 + #23, exact-UI from user screenshots).
// Backgrounds, rarity card frames, gold/blue buttons, elixir purple, top-bar pills.
// All Tailwind inline; no external CSS files.

export const CR_COLORS = {
  bg: "#0F1B3A",
  bgDark: "#0A1730",
  bgPanel: "#102347",
  blue: "#1E88E5",
  blueDeep: "#1565C0",
  gold: "#F5D000",
  goldDeep: "#B58B00",
  goldLight: "#FFE065",
  elixir: "#C93CFF",
  elixirDeep: "#8A2BE2",
  text: "#FFFFFF",
  textDark: "#0A1730",
  textMuted: "#9DB1D6",
  cardCommon: "#6B7280",
  cardRare: "#F97316",
  cardEpic: "#A855F7",
  cardLegendary: "#FBBF24",
  cardChampion: "#FACC15",
  borderLight: "#2A3D6E",
} as const;

// Diamond-plate background as inline style (no CSS file).
export function crBgStyle(): React.CSSProperties {
  return {
    backgroundColor: CR_COLORS.bg,
    backgroundImage:
      `repeating-linear-gradient(60deg, ${CR_COLORS.bg} 0, ${CR_COLORS.bg} 18px, ${CR_COLORS.bgDark} 18px, ${CR_COLORS.bgDark} 36px)`,
  };
}

export const RARITY_BORDER: Record<string, string> = {
  common: "border-slate-400",
  rare: "border-orange-500",
  epic: "border-purple-500",
  legendary: "border-yellow-400",
  champion: "border-amber-300",
};

export const RARITY_BG: Record<string, string> = {
  common: "from-slate-500/30 to-slate-700/30",
  rare: "from-orange-500/30 to-orange-700/30",
  epic: "from-purple-500/40 to-purple-700/40",
  legendary: "from-yellow-400/40 to-amber-500/40",
  champion: "from-amber-300/50 to-yellow-300/50",
};

export const RARITY_RUNE: Record<string, string> = {
  common: "💠",
  rare: "🔶",
  epic: "🔮",
  legendary: "🌟",
  champion: "👑",
};

export const EMOJI_FALLBACK: Record<string, string> = {
  knight: "⚔️", archers: "🏹", giant: "🗿", skeletons: "💀", musketeer: "🔫",
  babyDragon: "🐲", miniPekka: "🔪", rockGolem: "🪨", fireball: "🔥", arrows: "➶",
  zap: "⚡", cannon: "🏯",
};
