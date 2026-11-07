export function resolveConvexUrl(
  configuredUrl: string,
  pageHostname = typeof window === "undefined" ? "" : window.location.hostname,
): string {
  const url = new URL(configuredUrl);
  const isLoopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);

  // A phone/tablet's loopback address is that device, not the dev server.
  if (__DEV__ && isLoopback(url.hostname) && pageHostname) {
    url.hostname = pageHostname;
  }
  return url.toString().replace(/\/$/, "");
}
