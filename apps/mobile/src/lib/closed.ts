// Why you can't stake right now, in words: rounds run one at a time, and the
// next one opens for entries only when the live one has finished.

import { when } from "./format";

export function closedReason(r: { id: string; phase: string; end: number }): { title: string; body: string } {
  const next = String(Number(r.id) + 1);
  if (r.phase === "live") {
    return {
      title: "Staking opens Friday",
      body: `Entries for round ${r.id} are closed while it plays out. It ends ${when(r.end)}, and round ${next} opens for entries right after.`,
    };
  }
  if (r.phase === "settling") {
    return { title: "Paying out round " + r.id, body: `Round ${r.id} is being settled. Round ${next} opens for entries in a few minutes.` };
  }
  return { title: "The next round opens soon", body: `Round ${next} opens for entries in a few minutes.` };
}
