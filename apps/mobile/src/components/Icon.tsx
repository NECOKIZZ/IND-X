// Line icons (one stroke weight, rounded), drawn in SVG so they look the
// same on iOS, Android and web. The tab icons are our own: a line crossing
// the median, two blocks with a plus, a ring with a slice, a podium.

import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "league"
  | "build"
  | "portfolio"
  | "results"
  | "arrow"
  | "back"
  | "close"
  | "plus"
  | "minus"
  | "check"
  | "search"
  | "wallet"
  | "info"
  | "spark"
  | "more"
  | "send"
  | "receive"
  | "flask"
  | "signout"
  | "faceid"
  | "mail"
  | "key"
  | "google"
  | "apple"
  | "rules"
  | "docs"
  | "shield"
  | "copy";

export function Icon({ name, size = 22, color, strokeWidth = 1.7 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const fill = { fill: color, stroke: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "league" ? (
        <>
          <Path d="M3 12.5 H21" {...p} strokeDasharray="1.5 3" opacity={0.55} />
          <Path d="M3 17 L8 12 L12 15 L18 7" {...p} />
          <Circle cx="19.5" cy="6" r="1.6" {...fill} />
        </>
      ) : name === "build" ? (
        <>
          <Rect x="3.5" y="12" width="7" height="8.5" rx="2" {...p} />
          <Rect x="13.5" y="7.5" width="7" height="13" rx="2" {...p} />
          <Path d="M7 3.5 V8.5 M4.5 6 H9.5" {...p} />
        </>
      ) : name === "portfolio" ? (
        <>
          <Circle cx="12" cy="12.5" r="8" {...p} />
          <Path d="M12 4.5 A8 8 0 0 1 20 12.5 H12 Z" {...fill} opacity={0.85} />
        </>
      ) : name === "results" ? (
        <>
          <Path d="M3 20.5 H21 M5 20.5 V14.5 H9 V20.5 M10 20.5 V10.5 H14 V20.5 M15 20.5 V12.5 H19 V20.5" {...p} />
          <Path d="M12 3.2 L12.8 4.8 L14.6 5.1 L13.3 6.3 L13.6 8.1 L12 7.2 L10.4 8.1 L10.7 6.3 L9.4 5.1 L11.2 4.8 Z" {...fill} />
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
      ) : name === "more" ? (
        <>
          <Circle cx="5" cy="12" r="1.7" {...fill} />
          <Circle cx="12" cy="12" r="1.7" {...fill} />
          <Circle cx="19" cy="12" r="1.7" {...fill} />
        </>
      ) : name === "send" ? (
        <Path d="M4 12 L19 5 L14 20 L11.5 13.5 Z" {...p} />
      ) : name === "receive" ? (
        <Path d="M12 4 V15 M7 10.5 L12 15.5 L17 10.5 M5 19.5 H19" {...p} />
      ) : name === "flask" ? (
        <Path d="M9 3.5 H15 M10 3.5 V9 L5 18 A2 2 0 0 0 6.8 20.8 H17.2 A2 2 0 0 0 19 18 L14 9 V3.5 M7.5 14.5 H16.5" {...p} />
      ) : name === "signout" ? (
        <Path d="M14 4.5 H18.5 V19.5 H14 M10 8 L6 12 L10 16 M6 12 H15" {...p} />
      ) : name === "faceid" ? (
        <Path d="M4 8 V6.5 A2.5 2.5 0 0 1 6.5 4 H8 M16 4 H17.5 A2.5 2.5 0 0 1 20 6.5 V8 M20 16 V17.5 A2.5 2.5 0 0 1 17.5 20 H16 M8 20 H6.5 A2.5 2.5 0 0 1 4 17.5 V16 M9 9.5 V10.7 M15 9.5 V10.7 M12 9.5 V13 H11 M9.3 15.5 A4 4 0 0 0 14.7 15.5" {...p} />
      ) : name === "mail" ? (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="3" {...p} />
          <Path d="M4 7 L12 13 L20 7" {...p} />
        </>
      ) : name === "key" ? (
        <>
          <Circle cx="8" cy="15" r="4" {...p} />
          <Path d="M11 12 L19 4 M16 7 L18 9 M14 9 L15.5 10.5" {...p} />
        </>
      ) : name === "google" ? (
        <Path d="M20 12.2 C20 16.8 16.8 20 12.2 20 A8 8 0 1 1 17.6 6.1 M12.5 12 H20" {...p} strokeWidth={2.4} />
      ) : name === "apple" ? (
        <Path
          d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3.1.7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z"
          {...fill}
        />
      ) : name === "rules" ? (
        <Path d="M3 20.5 H21 M5 20.5 V14.5 H9 V20.5 M10 20.5 V10.5 H14 V20.5 M15 20.5 V12.5 H19 V20.5" {...p} />
      ) : name === "docs" ? (
        <Path d="M5 4.5 H14 L19 9.5 V19.5 H5 Z M14 4.5 V9.5 H19 M8.5 13.5 H15.5 M8.5 16.5 H12.5" {...p} />
      ) : name === "shield" ? (
        <Path d="M12 3 L19.5 6.5 V11.5 C19.5 16.2 16.3 19.5 12 20.7 C7.7 19.5 4.5 16.2 4.5 11.5 V6.5 Z M8.8 12.2 L11 14.4 L15.2 10" {...p} />
      ) : name === "copy" ? (
        <>
          <Rect x="8" y="8" width="12" height="12" rx="2.5" {...p} />
          <Path d="M16 8 V5.5 A1.5 1.5 0 0 0 14.5 4 H5.5 A1.5 1.5 0 0 0 4 5.5 V14.5 A1.5 1.5 0 0 0 5.5 16 H8" {...p} />
        </>
      ) : (
        <Path d="M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z" {...p} />
      )}
    </Svg>
  );
}
