import Constants from "expo-constants";
import { Platform } from "react-native";
import type { SupportIdentity } from "../../../shared/diagnostics/support";

function coarseBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const agent = navigator.userAgent;
  const match = agent.match(/(Edg|Chrome|Firefox|Safari)\/(\d+)/);
  if (!match) return "unknown";
  return `${match[1]}/${match[2]}`;
}

function coarseOs(): string {
  if (Platform.OS === "web") {
    const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(agent)) return "ios";
    if (/Android/.test(agent)) return "android";
    if (/Mac OS X/.test(agent)) return "macos";
    if (/Windows/.test(agent)) return "windows";
    if (/Linux/.test(agent)) return "linux";
    return "web";
  }
  return `${Platform.OS} ${String(Platform.Version)}`;
}

function routeTemplate(): string | undefined {
  if (typeof location === "undefined") return undefined;
  // Replace opaque ids so a support bundle never carries a story capability.
  const path = location.pathname
    .replace(/\/story\/[^/]+/g, "/story/[storyId]")
    .replace(/\/[A-Za-z0-9]{20,}/g, "/[id]");
  return path || "/";
}

export function clientIdentity(): SupportIdentity {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  return {
    appVersion: version,
    buildId: process.env.EXPO_PUBLIC_BUILD_ID ?? version,
    platform: Platform.OS,
    osVersion: coarseOs(),
    runtime:
      Platform.OS === "web"
        ? coarseBrowser()
        : `react-native ${String(Platform.Version)}`,
    route: routeTemplate(),
  };
}

export function clientEnvironment(): string {
  return (
    process.env.EXPO_PUBLIC_ENVIRONMENT ??
    (typeof __DEV__ !== "undefined" && __DEV__ ? "development" : "production")
  );
}
