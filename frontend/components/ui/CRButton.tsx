"use client";

import { useRouter } from "next/navigation";

type Variant = "gold" | "blue" | "gray" | "red" | "purple";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<Variant, string> = {
  gold: "from-amber-300 via-yellow-400 to-amber-500 text-amber-950 border-amber-700",
  blue: "from-sky-400 via-sky-500 to-blue-600 text-white border-blue-800",
  gray: "from-slate-400 via-slate-500 to-slate-600 text-white border-slate-700",
  red: "from-rose-500 via-red-500 to-red-700 text-white border-red-800",
  purple: "from-fuchsia-400 via-fuchsia-500 to-purple-700 text-white border-purple-800",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-base rounded-xl",
  lg: "px-6 py-3 text-lg rounded-2xl",
  xl: "px-8 py-4 text-2xl rounded-3xl",
};

export interface CRButtonProps {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  onClick?: () => void;
  href?: string;
  icon?: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
}

// 3D CR-style button (gold/blue/gray/red/purple) used for BATTLE, Shop, Daily Bonus, etc.
export default function CRButton({
  children,
  variant = "blue",
  size = "md",
  onClick,
  href,
  icon,
  testId,
  className = "",
  disabled = false,
}: CRButtonProps) {
  const router = useRouter();
  const handle = () => {
    if (disabled) return;
    if (href) router.push(href);
    else if (onClick) onClick();
  };
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={handle}
      disabled={disabled}
      className={`inline-flex select-none items-center justify-center gap-2 border-b-4 bg-gradient-to-b font-extrabold uppercase tracking-wide shadow-md transition-transform active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      style={{ textShadow: "0 1px 0 rgba(0,0,0,0.25)" }}
    >
      {icon && <span aria-hidden="true" className="text-xl leading-none">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
