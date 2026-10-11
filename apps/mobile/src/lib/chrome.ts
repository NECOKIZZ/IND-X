// App chrome a screen can tuck away (the floating tab bar while the weight
// keypad is open).

import { useSyncExternalStore } from "react";

let tabBarHidden = false;
const listeners = new Set<() => void>();

export function setTabBarHidden(v: boolean) {
  if (tabBarHidden === v) return;
  tabBarHidden = v;
  listeners.forEach((l) => l());
}

export function useTabBarHidden() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => tabBarHidden,
    () => tabBarHidden,
  );
}
