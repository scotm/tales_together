export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function createCapability() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function capabilityHash(capability: string) {
  if (!/^[a-f0-9]{64}$/.test(capability))
    throw new Error(
      "This idea session is unavailable. Please reopen the editor.",
    );
  return digest(capability);
}
