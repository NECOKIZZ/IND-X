// Fixed-point helpers shared by the settlement engine. BigInt only, no floats.

/** Fixed-point scale for accuracy weights: 1e6 = 1.0. */
export const SCALE = 1_000_000n;

/** a = (1 / (1 + r))^gamma in fixed point, where r is fixed point too. */
export function accuracyWeight(r: bigint, gamma: number): bigint {
  const base = (SCALE * SCALE) / (SCALE + r);
  let result = SCALE;
  for (let i = 0; i < gamma; i++) result = (result * base) / SCALE;
  return result;
}
