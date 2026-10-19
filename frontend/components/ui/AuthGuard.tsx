"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * AuthGuard — the app requires an account (register/login). Without a signed-in
 * playerId every route bounces to /login. No more auto-generated guest names.
 */
export default function AuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onLoginRoute = pathname?.startsWith("/login") === true;
    let id = "";
    try {
      id = window.localStorage.getItem("cr-player-id") ?? "";
    } catch {
      id = "";
    }
    const signedIn = id.length > 0;
    if (!signedIn && !onLoginRoute) {
      router.replace("/login");
      return;
    }
    if (signedIn && onLoginRoute) {
      router.replace("/");
      return;
    }
    setChecked(true);
  }, [pathname, router]);

  // Render nothing until the check settles to avoid flashing a protected page.
  if (!checked && pathname?.startsWith("/login") !== true) return null;
  return null;
}