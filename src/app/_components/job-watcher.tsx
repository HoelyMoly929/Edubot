"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While a background job runs, re-fetches the page's server data every few
 * seconds so the result shows up on its own, even if the user left and came back.
 */
export function JobWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
