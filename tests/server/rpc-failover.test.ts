// RPC failover: a refusing or broken primary RPC must not take the API down.

import { afterEach, describe, expect, it, vi } from "vitest";
import { failoverFetch, PRIMARY_RETRY_MS, rpcHost } from "../../server/src/chain/io";

const A = "https://primary.example/?api-key=secret";
const B = "https://fallback.example";

function fakeFetch(answers: Record<string, number | "down">) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const a = answers[url];
    if (a === "down") throw new Error("ECONNRESET");
    return new Response("{}", { status: a });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

afterEach(() => vi.useRealTimers());

describe("failoverFetch", () => {
  it("uses the primary while it answers", async () => {
    const { impl, calls } = fakeFetch({ [A]: 200, [B]: 200 });
    const f = failoverFetch([A, B], () => {}, impl);
    expect((await f(A, {})).status).toBe(200);
    expect(calls).toEqual([A]);
  });

  it.each([401, 403, 429, 503, "down" as const])("moves to the fallback when the primary gives %s", async (bad) => {
    const { impl, calls } = fakeFetch({ [A]: bad, [B]: 200 });
    const logs: string[] = [];
    const f = failoverFetch([A, B], (m) => logs.push(m), impl);
    expect((await f(A, {})).status).toBe(200);
    expect((await f(A, {})).status).toBe(200);
    expect(calls).toEqual([A, B, B]); // sticks with the fallback
    expect(logs.join("\n")).not.toContain("secret");
  });

  it("goes back to the primary after a while", async () => {
    vi.useFakeTimers();
    const answers: Record<string, number> = { [A]: 403, [B]: 200 };
    const { impl, calls } = fakeFetch(answers);
    const f = failoverFetch([A, B], () => {}, impl);
    await f(A, {});
    answers[A] = 200;
    vi.advanceTimersByTime(PRIMARY_RETRY_MS + 1);
    await f(A, {});
    expect(calls).toEqual([A, B, A]);
  });

  it("returns the last refusal when every endpoint refuses", async () => {
    const { impl } = fakeFetch({ [A]: 403, [B]: 429 });
    expect((await failoverFetch([A, B], () => {}, impl)(A, {})).status).toBe(429);
  });

  it("throws when every endpoint is unreachable", async () => {
    const { impl } = fakeFetch({ [A]: "down", [B]: "down" });
    await expect(failoverFetch([A, B], () => {}, impl)(A, {})).rejects.toThrow("ECONNRESET");
  });

  it("logs hosts only", () => expect(rpcHost(A)).toBe("primary.example"));
});
