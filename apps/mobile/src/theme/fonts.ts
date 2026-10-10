// Loads the app's fonts under the family names in tokens.ts.
// To switch to Aeonik once licensed: put Aeonik-Light/Regular/Medium/Bold
// files in assets/fonts and map them here instead of Geist.

import { useFonts } from "expo-font";
import { Geist_300Light } from "@expo-google-fonts/geist/300Light";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { font } from "./tokens";

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    [font.light]: Geist_300Light,
    [font.regular]: Geist_400Regular,
    [font.medium]: Geist_500Medium,
    [font.semibold]: Geist_600SemiBold,
    [font.mono]: GeistMono_400Regular,
  });
  // Never block the app on fonts: fall back to the system font on error.
  return loaded || !!error;
}
