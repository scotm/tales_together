/** Stable context fingerprints include references and explicit fictional gender, never names. */
export function contextKey(context: {
  character: object;
  outfit: object;
  quirk: object;
  details?: object;
  kidGender: string;
}) {
  const ref = (value: object | undefined) => {
    if (!value) return null;
    const row = value as {
      kind?: string;
      ideaId?: string;
      part?: string;
      optionId?: string;
      revision?: number;
    };
    return row.kind === "custom"
      ? ["custom", row.ideaId, row.part]
      : ["catalog", row.optionId, row.revision];
  };
  return JSON.stringify([
    ref(context.character),
    ref(context.outfit),
    ref(context.quirk),
    ref(context.details),
    context.kidGender,
  ]);
}
