// The weekly round, in New York time (the US stock market's clock):
//   entries open as soon as the last round settles (Friday after the close),
//   entries close Monday 9:30am (the open), the round ends Friday 4pm (the close).
// Daylight saving is handled by asking Intl for New York's offset.

const NY = "America/New_York";
const MIN = 60_000;

/** New York's UTC offset in minutes at a moment (-240 in summer, -300 in winter). */
export function nyOffsetMin(at: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: NY, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value;
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** The UTC moment of a New York wall-clock time (y, month 0-11, d, h, min). */
export function nyTime(y: number, mo: number, d: number, h: number, min: number): number {
  const wall = Date.UTC(y, mo, d, h, min);
  const guess = wall - nyOffsetMin(wall) * MIN;
  return wall - nyOffsetMin(guess) * MIN;
}

/** New York calendar date (y, month, d, weekday 0=Sun) of a moment. */
function nyDate(at: number) {
  const d = new Date(at + nyOffsetMin(at) * MIN);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay() };
}

/**
 * The next weekly round for a round opened at `now`: entries close at the
 * first Monday 9:30am New York that is at least `minEntryMs` away, and the
 * round ends that Friday at 4pm.
 */
export function nextWeeklyRound(now: number, minEntryMs = 60 * MIN): { entryClose: number; end: number } {
  const { y, mo, d, wd } = nyDate(now);
  for (let add = (8 - wd) % 7; ; add += 7) {
    const entryClose = nyTime(y, mo, d + add, 9, 30);
    if (entryClose - now < minEntryMs) continue;
    return { entryClose, end: nyTime(y, mo, d + add + 4, 16, 0) };
  }
}
