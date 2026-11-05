/**
 * Providers in JSON mode still wrap their reply in prose or backticks often
 * enough that every parser needs the same recovery: strip fences, then fall
 * back to the widest braces in the text.
 */
export function parseJsonObject(
  raw: string,
  label: string,
): Record<string, unknown> {
  const fail = (message: string): never => {
    throw new Error(`bad ${label}: ${message}`);
  };

  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      fail(`response was not JSON: ${JSON.stringify(text.slice(0, 200))}`);
    }
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      fail(`response was not JSON: ${JSON.stringify(text.slice(0, 200))}`);
    }
  }

  if (typeof parsed !== "object" || parsed === null) {
    fail("response was not an object");
  }
  return parsed as Record<string, unknown>;
}

export function asString(value: unknown, field: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`bad ${label}: ${field} must be a non-empty string`);
  }
  return value;
}

export function asStringArray(value: unknown, field: string, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`bad ${label}: ${field} was not an array`);
  }
  return value.map((entry, index) =>
    asString(entry, `${field}[${index}]`, label),
  );
}
