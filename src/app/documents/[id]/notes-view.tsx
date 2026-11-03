"use client";

import { Fragment, useEffect, useState } from "react";
import type { CitedBlock, CitedSection } from "@/lib/queries";
import { formatPages, formatPagesLong } from "@/lib/pages";

/** The design's key-point palette, cycled across topic cards. */
export const TONES = [
  { card: "bg-warn-soft", number: "text-warn", text: "text-[#3B2D00]", chip: "text-warn" },
  { card: "bg-info-soft", number: "text-info", text: "text-[#0B2F52]", chip: "text-info" },
  { card: "bg-good-soft", number: "text-good", text: "text-[#08362A]", chip: "text-good" },
  { card: "bg-bad-soft", number: "text-bad", text: "text-[#4A1A0E]", chip: "text-bad" },
];

/** The closing memory card gets the sun yellow, apart from the cycle. */
const MEMORY_TONE = { card: "bg-sun", number: "text-warn", text: "text-[#3B2D00]", chip: "text-warn" };

/**
 * Renders `**term**` as bold. Text stays as React text nodes, so nothing the
 * model writes can turn into markup.
 */
export function withKeyTerms(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-bold">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Tone = (typeof TONES)[number];

/** Consecutive sections sharing a chapter sit under one chapter heading. */
function groupByChapter(sections: CitedSection[]) {
  const groups: { chapter?: string; items: { section: CitedSection; index: number }[] }[] = [];
  sections.forEach((section, index) => {
    const last = groups.at(-1);
    if (last && last.chapter === section.chapter) last.items.push({ section, index });
    else groups.push({ chapter: section.chapter, items: [{ section, index }] });
  });
  return groups;
}

/** One entry in the jump list. `sections` are the cards it should open. */
interface JumpEntry {
  label: string;
  target: string;
  sections: number[];
}

/**
 * Jump list: chapters when the notes have two or more; otherwise every card,
 * so a PDF without chapters can still be navigated.
 */
function jumpEntries(groups: ReturnType<typeof groupByChapter>): JumpEntry[] {
  const chapters = groups.filter((g) => g.chapter).length;
  if (chapters >= 2) {
    return groups.map((g, i) => ({
      label: g.chapter ?? g.items[0].section.heading,
      target: `group-${i}`,
      sections: g.items.map((x) => x.index),
    }));
  }
  return groups.flatMap((g) =>
    g.items.map(({ section, index }) => ({
      label: section.heading,
      target: `section-${index}`,
      sections: [index],
    })),
  );
}

export function NotesView({
  sections,
  sources,
}: {
  sections: CitedSection[];
  sources: Record<string, string>;
}) {
  const [openSource, setOpenSource] = useState<string | null>(null);
  // Cards start collapsed except the first, so a long document reads as an outline.
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const [active, setActive] = useState(0);

  const groups = groupByChapter(sections);
  const entries = jumpEntries(groups);
  const allOpen = open.size === sections.length;

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  // Highlights the jump entry whose heading is nearest the top of the screen.
  const targets = entries.map((e) => e.target).join("|");
  useEffect(() => {
    const els = targets.split("|").map((id) => document.getElementById(id));
    const io = new IntersectionObserver(
      (records) => {
        const top = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(els.indexOf(top.target as HTMLElement));
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [targets]);

  function jump(entry: JumpEntry, i: number) {
    setOpen((prev) => new Set([...prev, entry.sections[0]]));
    setActive(i);
  }

  function renderChip(block: CitedBlock, id: string, tone: Tone) {
    const isOpen = openSource === id;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenSource(isOpen ? null : id)}
          aria-expanded={isOpen}
          title="Show the text this came from"
          className={`ml-0.5 inline-flex cursor-pointer items-center rounded-full bg-white/80 px-2 py-0.5 align-[1px] text-xs font-bold hover:bg-white ${tone.chip}`}
        >
          {formatPages(block.sourcePage, block.endPage)}
        </button>
        {isOpen && (
          <blockquote className="mt-2 block rounded-[14px] bg-white/85 p-3.5 text-sm leading-relaxed text-ink-soft">
            <span className={`mb-1.5 block text-xs font-bold ${tone.chip}`}>
              From your document, {formatPagesLong(block.sourcePage, block.endPage)}
            </span>
            <span className="block whitespace-pre-wrap">
              {sources[block.chunkId] || "This excerpt is no longer available."}
            </span>
          </blockquote>
        )}
      </>
    );
  }

  function renderBlocks(section: CitedSection, s: number, tone: Tone) {
    // Consecutive bullets share one list; steps and tables stand alone.
    const out: React.ReactNode[] = [];
    let run: { block: CitedBlock & { kind: "bullet" }; b: number }[] = [];
    const flush = () => {
      if (!run.length) return;
      const items = run;
      run = [];
      out.push(
        <ul key={`ul-${items[0].b}`} className="flex list-disc flex-col gap-3 pl-5 marker:text-current">
          {items.map(({ block, b }) => (
            <li key={b} className="leading-relaxed">
              {block.lead && <strong className="font-bold">{block.lead}: </strong>}
              {withKeyTerms(block.text)} {renderChip(block, `${s}-${b}`, tone)}
            </li>
          ))}
        </ul>,
      );
    };

    section.blocks.forEach((block, b) => {
      if (block.kind === "bullet") {
        run.push({ block, b });
        return;
      }
      flush();
      if (block.kind === "steps") {
        out.push(
          <div key={b}>
            {block.title && <p className="mb-1 font-bold">{block.title}</p>}
            <ol className="flex list-decimal flex-col gap-1 pl-6 leading-normal">
              {block.items.map((item, i) => (
                <li key={i}>{withKeyTerms(item)}</li>
              ))}
            </ol>
            <div className="mt-1.5">{renderChip(block, `${s}-${b}`, tone)}</div>
          </div>,
        );
      } else {
        out.push(
          <div key={b}>
            <div className="overflow-x-auto rounded-[14px] bg-white/70">
              <table className="w-full min-w-[320px] border-collapse text-left text-[15px]">
                <thead>
                  <tr>
                    {block.columns.map((c, i) => (
                      <th key={i} scope="col" className="border-b border-black/10 px-3 py-2 font-bold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r} className="border-b border-black/5 last:border-0">
                      {row.map((cell, i) => (
                        <td key={i} className="px-3 py-2 align-top">
                          {withKeyTerms(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5">{renderChip(block, `${s}-${b}`, tone)}</div>
          </div>,
        );
      }
    });
    flush();
    return out;
  }

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
      {/* Jump list: a sticky column on wide screens, a scrolling strip on narrow ones. */}
      <nav
        aria-label="Jump to"
        className="lg:sticky lg:top-6 lg:w-52 lg:flex-none lg:self-start"
      >
        <p className="mb-2 hidden text-sm font-bold text-muted lg:block">Jump to</p>
        <ul className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-h-[70vh] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:pb-0">
          {entries.map((entry, i) => (
            <li key={entry.target} className="flex-none">
              <a
                href={`#${entry.target}`}
                onClick={() => jump(entry, i)}
                aria-current={i === active ? "true" : undefined}
                className={`block rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors lg:whitespace-normal lg:rounded-[14px] ${
                  i === active
                    ? "bg-brand-soft text-brand-ink"
                    : "bg-card text-[#3A4068] hover:bg-brand-softer lg:bg-transparent"
                }`}
              >
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 max-w-[780px] flex-1 flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((_, i) => i)))}
            className="min-h-10 cursor-pointer rounded-full border-2 border-brand-dash bg-card px-5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-softer"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>

        {groups.map((group, g) => (
          <section key={g} id={`group-${g}`} className="flex scroll-mt-6 flex-col gap-3">
            {group.chapter && (
              <h3 className="display mt-4 border-b-2 border-brand-soft pb-2 text-[28px] font-medium text-brand-ink">
                {group.chapter}
              </h3>
            )}
            {group.items.map(({ section, index }) => {
              const tone = section.memory ? MEMORY_TONE : TONES[index % TONES.length];
              const isOpen = open.has(index);
              return (
                <article
                  key={index}
                  id={`section-${index}`}
                  className={`scroll-mt-6 rounded-[24px] ${tone.card} ${tone.text}`}
                >
                  <h4>
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={isOpen}
                      aria-controls={`panel-${index}`}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-[24px] p-[clamp(18px,3vw,24px)] text-left"
                    >
                      <span className="display flex-1 text-2xl font-medium">{section.heading}</span>
                      <span className="flex-none rounded-full bg-white/80 px-3 py-1 text-sm font-bold">
                        {section.blocks.length} {section.blocks.length === 1 ? "point" : "points"}
                      </span>
                      <svg
                        aria-hidden="true"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`flex-none transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </h4>
                  {/* Grid-row trick animates height; `inert` keeps a collapsed card out of the tab order. */}
                  <div
                    id={`panel-${index}`}
                    inert={!isOpen}
                    className={`grid transition-[grid-template-rows] duration-300 ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-4 px-[clamp(18px,3vw,24px)] pb-[clamp(18px,3vw,24px)] text-[17px]">
                        {renderBlocks(section, index, tone)}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
