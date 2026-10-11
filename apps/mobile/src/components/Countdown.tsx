import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";
import { Num } from "./ui";

/** Live countdown to a unix time, corrected by the server's clock. */
export function Countdown({ to, serverTime, v = "heading", color }: { to: number; serverTime?: number; v?: "heading" | "title" | "hero" | "display" | "bodyStrong"; color?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The server's clock, carried forward by this device's.
    const skew = serverTime ? serverTime - Math.floor(Date.now() / 1000) : 0;
    const update = () => setNow(Math.floor(Date.now() / 1000) + skew);
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [serverTime]);
  if (now === null) return <Num v={v} color={color}>—</Num>;
  return (
    <Num v={v} color={color}>
      {countdown(to - now)}
    </Num>
  );
}
