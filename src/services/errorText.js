function meaningfulText(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : "";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return meaningfulText(value.message, depth + 1);
  if (typeof value !== "object") return "";

  for (const key of ["message", "error", "details", "hint"]) {
    const text = meaningfulText(value[key], depth + 1);
    if (text) return text;
  }

  const code = meaningfulText(value.code, depth + 1);
  return code ? `Technischer Fehler ${code}.` : "";
}

export function readableErrorText(value, fallback = "Die Anfrage ist fehlgeschlagen.") {
  return meaningfulText(value) || fallback;
}
