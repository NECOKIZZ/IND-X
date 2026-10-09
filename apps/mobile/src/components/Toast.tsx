// A small toast for results ("Entered!", errors).

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useColors } from "@/theme";
import { Text } from "./ui";

type Kind = "ok" | "error" | "info";
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; kind: Kind } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (msg: string, kind: Kind = "info") => {
      setToast({ msg, kind });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null)), kind === "error" ? 5000 : 2800);
    },
    [opacity],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: space.lg, right: space.lg, top: insets.top + space.sm, opacity }}>
          <View style={{ backgroundColor: toast.kind === "error" ? c.down : toast.kind === "ok" ? c.up : c.text, borderRadius: radius.md, padding: space.md }}>
            <Text v="smallStrong" color={toast.kind === "info" ? c.bg : "#fff"}>
              {toast.msg}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
