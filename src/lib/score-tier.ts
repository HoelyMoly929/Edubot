/**
 * Colour-codes a score the way the design does. Shared by the quiz list,
 * History and results so one score always reads as one tier.
 *
 * The design's 5-question thresholds (≥4 strong, 3 getting there) scale to
 * ≥80% and ≥60%. Plain data, so client components can import it.
 */
export type Tier = "strong" | "mid" | "low";

export const TIERS: Record<
  Tier,
  { label: string; card: string; ink: string; fill: string; chipBorder: string }
> = {
  strong: { label: "Strong", card: "bg-[#E1F5EA]", ink: "text-[#0A5037]", fill: "bg-[#2F9E6E]", chipBorder: "border-[#CFEBDD]" },
  mid: { label: "Getting there", card: "bg-[#FFF3CE]", ink: "text-[#6B4600]", fill: "bg-[#D9A21B]", chipBorder: "border-[#F3E2A8]" },
  low: { label: "Needs review", card: "bg-[#FFE6E0]", ink: "text-[#8A2A16]", fill: "bg-[#E0705A]", chipBorder: "border-[#F4CFC6]" },
};

export function tierFor(score: number): Tier {
  if (score >= 0.8) return "strong";
  if (score >= 0.6) return "mid";
  return "low";
}
