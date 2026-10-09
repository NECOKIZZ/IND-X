import { describe, expect, it } from "vitest";
import { nextWeeklyRound, nyTime } from "../../packages/core/src/schedule";

const iso = (t: number) => new Date(t).toISOString();

describe("weekly schedule (New York time)", () => {
  it("opens midweek for next Monday's open to Friday's close (EDT)", () => {
    const r = nextWeeklyRound(Date.UTC(2026, 9, 7, 9, 0)); // Wed 7 Oct
    expect(iso(r.entryClose)).toBe("2026-10-12T13:30:00.000Z");
    expect(iso(r.end)).toBe("2026-10-16T20:00:00.000Z");
  });

  it("opened after Friday's close, runs the following week", () => {
    const r = nextWeeklyRound(Date.UTC(2026, 9, 16, 20, 20)); // Fri 16 Oct, 4:20pm New York
    expect(iso(r.entryClose)).toBe("2026-10-19T13:30:00.000Z");
    expect(iso(r.end)).toBe("2026-10-23T20:00:00.000Z");
  });

  it("follows daylight saving (EST after 1 Nov 2026)", () => {
    const r = nextWeeklyRound(Date.UTC(2026, 9, 30, 21, 0)); // Fri 30 Oct
    expect(iso(r.entryClose)).toBe("2026-11-02T14:30:00.000Z");
    expect(iso(r.end)).toBe("2026-11-06T21:00:00.000Z");
  });

  it("on a Monday morning too close to the open, takes the next Monday", () => {
    expect(iso(nextWeeklyRound(nyTime(2026, 9, 12, 9, 0)).entryClose)).toBe("2026-10-19T13:30:00.000Z");
    expect(iso(nextWeeklyRound(nyTime(2026, 9, 12, 7, 0)).entryClose)).toBe("2026-10-12T13:30:00.000Z");
  });
});
