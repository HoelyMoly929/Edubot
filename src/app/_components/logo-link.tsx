"use client";

import Link from "next/link";
import { useState } from "react";

/** Confetti burst directions (px) and colours, from the app's pastel set. */
const CONFETTI = [
  { dx: -30, dy: -34, c: "var(--sun)" },
  { dx: 0, dy: -42, c: "var(--good-soft)" },
  { dx: 30, dy: -34, c: "var(--info-soft)" },
  { dx: -38, dy: -8, c: "var(--bad-soft)" },
  { dx: 38, dy: -8, c: "var(--sun)" },
  { dx: 16, dy: -40, c: "var(--brand-soft)" },
];

/**
 * The EduBot logo. Clicking it tosses the graduation cap, squashes the tile
 * and pops confetti. The header lives in the layout, so the animation keeps
 * playing while the page navigates to home.
 */
export function LogoLink() {
  const [plays, setPlays] = useState(0);

  return (
    <Link
      href="/"
      onClick={() => setPlays((n) => n + 1)}
      className="flex items-center gap-3 text-ink"
    >
      {/* Remounting on each click restarts the CSS animations from the top. */}
      <span
        key={plays}
        data-playing={plays > 0}
        className="logo-tile relative flex size-11 items-center justify-center rounded-[14px] bg-brand"
      >
        <svg
          aria-hidden="true"
          className="logo-cap"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8l9-4 9 4-9 4-9-4z" />
          <path d="M7 10.5V15c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5" />
        </svg>
        {plays > 0 &&
          CONFETTI.map(({ dx, dy, c }, i) => (
            <i
              key={i}
              aria-hidden
              className="logo-confetti"
              style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, background: c } as React.CSSProperties}
            />
          ))}
      </span>
      {/* Letters hop in a left-to-right wave, trailing the tile's hop. */}
      <span
        key={`w${plays}`}
        data-playing={plays > 0}
        aria-label="EduBot"
        className="logo-word display text-[26px] font-semibold"
      >
        {"EduBot".split("").map((ch, i) => (
          <span key={i} aria-hidden style={{ "--i": i } as React.CSSProperties}>
            {ch}
          </span>
        ))}
      </span>
    </Link>
  );
}
