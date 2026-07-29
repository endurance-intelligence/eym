type StorageProblem = "missing" | "permission" | "unavailable";

function meaningfulText(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.trim();
    return text && text !== "[object Object]" ? text : "";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return meaningfulText(value.message, depth + 1);
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["message", "error", "details", "hint"]) {
    const text = meaningfulText(record[key], depth + 1);
    if (text) return text;
  }

  const code = meaningfulText(record.code, depth + 1);
  return code ? `Technischer Fehler ${code}.` : "";
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  return String((error as Record<string, unknown>).code || "").trim().toUpperCase();
}

export function readableIntervalsError(
  error: unknown,
  fallback = "Die Intervals.icu-Anfrage ist fehlgeschlagen.",
) {
  return meaningfulText(error) || fallback;
}

export function intervalsStorageProblem(error: unknown): StorageProblem {
  const code = errorCode(error);
  const message = readableIntervalsError(error, "").toLowerCase();
  if (
    ["42P01", "PGRST204", "PGRST205"].includes(code)
    || /does not exist|schema cache|relation .*intervals_connections/.test(message)
  ) return "missing";
  if (
    ["42501", "PGRST301"].includes(code)
    || /permission denied|row-level security|not authorized/.test(message)
  ) return "permission";
  return "unavailable";
}

export function intervalsStorageMessage(
  error: unknown,
  action: "read" | "save" | "delete" = "read",
) {
  const problem = intervalsStorageProblem(error);
  if (problem === "missing") {
    return "Die sichere Intervals.icu-Ablage ist in Supabase noch nicht bereit. Führe die Datenbankmigration aus und deploye danach die Funktion „intervals“ erneut.";
  }
  if (problem === "permission") {
    return "Die sichere Intervals.icu-Ablage hat noch nicht die benötigten Datenbankrechte. Führe die aktuelle Datenbankmigration aus und deploye danach die Funktion „intervals“ erneut.";
  }

  const detail = readableIntervalsError(error, "unbekannter Supabase-Fehler");
  const operation = action === "save"
    ? "Der geprüfte API-Key konnte nicht sicher gespeichert werden"
    : action === "delete"
      ? "Die persönliche Intervals.icu-Verbindung konnte nicht getrennt werden"
      : "Die sichere Intervals.icu-Ablage konnte nicht gelesen werden";
  return `${operation}: ${detail}`;
}
