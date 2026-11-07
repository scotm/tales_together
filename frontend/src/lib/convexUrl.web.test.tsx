/// <reference types="jest" />
import { resolveConvexUrl } from "./convexUrl.web";

it.each(["127.0.0.1", "localhost", "[::1]"])(
  "uses the browser's host for a loopback dev backend (%s)",
  (host) => {
    expect(resolveConvexUrl(`http://${host}:3210`, "192.168.50.176")).toBe(
      "http://192.168.50.176:3210",
    );
  },
);

it("preserves explicit remote backends and server rendering configuration", () => {
  expect(
    resolveConvexUrl("https://example.convex.cloud", "192.168.50.176"),
  ).toBe("https://example.convex.cloud");
  expect(resolveConvexUrl("http://127.0.0.1:3210", "")).toBe(
    "http://127.0.0.1:3210",
  );
});
