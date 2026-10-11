// Line icons (one stroke weight, rounded), drawn in SVG so they look the
// same on iOS, Android and web.

import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName = "league" | "build" | "portfolio" | "results" | "arrow" | "back" | "close" | "plus" | "minus" | "check" | "search" | "wallet" | "info" | "spark";

export function Icon({ name, size = 22, color, strokeWidth = 1.7 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "league" ? (
        <>
          <Path d="M4 19 L9 12 L13 15 L20 6" {...p} />
          <Path d="M15 6 H20 V11" {...p} />
        </>
      ) : name === "build" ? (
        <>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="2" {...p} />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="2" {...p} />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="2" {...p} />
          <Path d="M17 14 V20 M14 17 H20" {...p} />
        </>
      ) : name === "portfolio" ? (
        <>
          <Circle cx="12" cy="12" r="8.5" {...p} />
          <Path d="M12 3.5 V12 L18 18" {...p} />
        </>
      ) : name === "results" ? (
        <>
          <Path d="M5 20 V11 M12 20 V5 M19 20 V14" {...p} />
        </>
      ) : name === "arrow" ? (
        <Path d="M7 17 L17 7 M9 7 H17 V15" {...p} />
      ) : name === "back" ? (
        <Path d="M15 5 L8 12 L15 19" {...p} />
      ) : name === "close" ? (
        <Path d="M6 6 L18 18 M18 6 L6 18" {...p} />
      ) : name === "plus" ? (
        <Path d="M12 5 V19 M5 12 H19" {...p} />
      ) : name === "minus" ? (
        <Path d="M5 12 H19" {...p} />
      ) : name === "check" ? (
        <Path d="M5 12.5 L10 17 L19 7" {...p} />
      ) : name === "search" ? (
        <>
          <Circle cx="11" cy="11" r="6.5" {...p} />
          <Path d="M16 16 L20 20" {...p} />
        </>
      ) : name === "wallet" ? (
        <>
          <Rect x="3.5" y="6" width="17" height="13" rx="3" {...p} />
          <Path d="M3.5 10 H20.5 M16 14.5 H17" {...p} />
        </>
      ) : name === "info" ? (
        <>
          <Circle cx="12" cy="12" r="8.5" {...p} />
          <Path d="M12 11 V16 M12 8 V8.2" {...p} />
        </>
      ) : (
        <Path d="M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z" {...p} />
      )}
    </Svg>
  );
}
