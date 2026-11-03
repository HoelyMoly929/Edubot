"use client";

import { Fragment, useState } from "react";
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

export function NotesView({
  sections,
  sources,
}: {
  sections: CitedSection[];
  sources: Record<string, string>;
}) {
  const [openSource, setOpenSource] = useState<string | null>(null);

  function renderChip(block: CitedBlock, id: string, tone: Tone) {
    const open = openSource === id;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenSource(open ? null : id)}
          aria-expanded={open}
          title="Show the text this came from"
          className={`ml-0.5 inline-flex cursor-pointer items-center rounded-full bg-white/80 px-2 py-0.5 align-[1px] text-xs font-bold hover:bg-white ${tone.chip}`}
        >
          {formatPages(block.sourcePage, block.endPage)}
        </button>
        {open && (
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
            <div className="mt-1.5">
              {renderChip(block, `${s}-${b}`, tone)}
            </div>
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
            <div className="mt-1.5">
              {renderChip(block, `${s}-${b}`, tone)}
            </div>
          </div>,
        );
      }
    });
    flush();
    return out;
  }

  return (
    <div className="mx-auto flex w-full max-w-[780px] flex-col gap-10">
      {groupByChapter(sections).map((group, g) => (
        <section key={g} className="flex flex-col gap-4">
          {group.chapter && (
            <h3 className="display border-b-2 border-brand-soft pb-2 text-[28px] font-medium text-brand-ink">
              {group.chapter}
            </h3>
          )}
          <div className="flex flex-col gap-4">
            {group.items.map(({ section, index }) => {
              const tone = section.memory ? MEMORY_TONE : TONES[index % TONES.length];
              return (
                <article
                  key={index}
                  className={`flex flex-col gap-4 rounded-[24px] p-[clamp(20px,3vw,28px)] text-[17px] ${tone.card} ${tone.text}`}
                >
                  <h4 className="display text-2xl font-medium">{section.heading}</h4>
                  {renderBlocks(section, index, tone)}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
