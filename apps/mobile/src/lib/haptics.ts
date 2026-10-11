import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const on = Platform.OS !== "web";
export const tap = () => on && Haptics.selectionAsync().catch(() => {});
export const success = () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const failure = () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
