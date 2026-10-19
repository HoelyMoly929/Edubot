"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pill navigation. The active pill is derived from the URL, so a document or a
 * quiz attempt counts as being "in" Upload — that is where you came from.
 */
const LINKS = [
  { href: "/dashboard", label: "Upload", match: ["/dashboard", "/documents", "/attempts"] },
  { href: "/history", label: "History", match: ["/history"] },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map(({ href, label, match }) => {
        const active = match.some((prefix) => pathname.startsWith(prefix));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full px-5 font-bold transition-colors hover:bg-brand-soft ${
              active ? "bg-brand-soft text-brand-ink" : "text-[#3A4068]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
