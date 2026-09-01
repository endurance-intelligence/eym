function uniqueByKey(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.key || item.text;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hourNumber(elapsedMinutes = 0) {
  return Math.max(0, Math.floor(Number(elapsedMinutes || 0) / 60));
}

function careLimit(mode) {
  if (mode === "go") return 2;
  if (mode === "quick") return 2;
  if (mode === "compact") return 2;
  return 3;
}

function rank(items = []) {
  return uniqueByKey(items).sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
}

function compactLabel(item) {
  return `${item.icon || "•"} ${item.short || item.title || "Hinweis"}`;
}

/**
 * Pure race-care helper. It never marks anything as done and deliberately
 * avoids medical/treatment language: the output is only a crew memory aid.
 */
export function athleteCareHints({
  round = 1,
  elapsedMinutes = 0,
  minutesToStart = 10,
  mode = "normal",
  flags = [],
  weather = [],
  observation = null,
} = {}) {
  const active = new Set([...(flags || []), ...(weather || [])]);
  const hour = hourNumber(elapsedMinutes);
  const currentRound = Math.max(1, Number(round || 1));
  const minutes = Number(minutesToStart);
  const items = [];

  const add = (key, icon, short, text, priority = 50, urgent = false) => {
    items.push({ key, icon, short, text, priority, urgent });
  };

  if (active.has("rain")) {
    add(
      "wet-feet",
      "🧦",
      "Füße/Socken",
      "Füße und Socken trocken halten. Bei Nässe trockene Socken bereitlegen und Schuhe kurz auf Falten/Fremdkörper prüfen.",
      100,
      true,
    );
    add(
      "dry-top",
      "👕",
      "trockenes Shirt",
      "Nasses Oberteil nicht unnötig lange anlassen – trockenes Shirt bzw. trockene Schicht bereitlegen.",
      90,
      true,
    );
  }

  if (active.has("cold") || active.has("too-cold")) {
    add(
      "warmer-layer",
      "🧥",
      "wärmer anziehen",
      "Wärmere/trockene Schicht bereitlegen; bei Bedarf Buff, Mütze oder Handschuhe. Keine neue Ausrüstung im Rennen ausprobieren.",
      98,
      true,
    );
  }

  if (active.has("hot") || active.has("too-warm")) {
    add(
      "cooler-layer",
      "🧊",
      "kühler anziehen",
      "Überflüssige Schicht raus. Trockenes Shirt bzw. bewährte Kühlung/Sonnenschutz bereitlegen, ohne den Pit unnötig zu verlängern.",
      98,
      true,
    );
  }

  if (active.has("wind") && (active.has("cold") || active.has("too-cold") || Number(observation?.temperature) <= 12)) {
    add(
      "wind-layer",
      "💨",
      "Windschutz",
      "Leichten Windschutz bereitlegen, besonders wenn das Oberteil feucht ist.",
      92,
      true,
    );
  }

  if (active.has("heavy-legs")) {
    add(
      "legs-up",
      "🦵",
      "Beine hoch",
      mode === "normal"
        ? "Wenn genug Pit-Zeit da ist: Beine für 3–5 Minuten hochlegen. Optional nur leichte, kurze Massage – nichts Aggressives anfangen."
        : "Beine nur kurz hoch, wenn es ohne Zeitdruck geht. Keine längere Massage mehr anfangen.",
      88,
    );
  }

  if (active.has("tired")) {
    add(
      "quiet-seat",
      "🪑",
      "ruhig sitzen",
      "Ruhigen Sitzplatz anbieten, unnötige Hektik vermeiden und nur die wirklich nötigen Pit-Aufgaben gleichzeitig machen.",
      72,
    );
  }

  // Periodic reminders. They intentionally appear only in selected hour/round
  // windows instead of becoming a permanent checklist on every loop.
  if (hour >= 3 && currentRound % 3 === 0) {
    add(
      "foot-check",
      "🦶",
      "Füße prüfen",
      "Kurzer Fuß-/Socken-Check: Feuchtigkeit, Falten, Reibestellen oder Hotspots. Bewährte Fußcreme/Anti-Chafe nur so nutzen, wie im Training getestet.",
      62,
    );
  }

  if (hour >= 5 && currentRound % 4 === 1) {
    add(
      "clothing-check",
      "👕",
      "Kleidung prüfen",
      "Kurz prüfen: Shirt noch trocken/angenehm? Temperaturtrend passend? Wechselkleidung jetzt bereitlegen, bevor sie später hektisch gesucht wird.",
      55,
    );
  }

  if (hour >= 6 && currentRound % 3 === 1) {
    add(
      "routine-legs",
      "🦵",
      "Beine entlasten",
      "Wenn der Pit entspannt ist: kurz Beine hochlegen oder Position wechseln. Kein Muss, nur eine Entlastungsoption.",
      48,
    );
  }

  if (hour >= 8 && currentRound % 4 === 0) {
    add(
      "shoe-check",
      "👟",
      "Schuhe prüfen",
      "Schuhe, Schnürung und Sitz kurz prüfen. Druckstellen früh bemerken; Schuhwechsel nur, wenn er vorbereitet und erprobt ist.",
      58,
    );
  }

  let hints = rank(items);

  if (mode === "go") {
    const urgent = hints.filter((item) => item.urgent).slice(0, 1);
    hints = [
      ...urgent,
      {
        key: "start-first",
        icon: "⏱️",
        short: "Start sichern",
        text: "Jetzt keine neue Care-Maßnahme mehr anfangen. Nur akut nötige Kleidung/Fußsache lösen und den nächsten Start sichern.",
        priority: 120,
        urgent: true,
      },
    ];
  } else if (mode === "quick") {
    hints = hints.slice(0, 1);
    hints.push({
      key: "quick-care",
      icon: "⏱️",
      short: "kurz halten",
      text: "Care nur kurz und gezielt. Keine Socken-/Schuhaktion oder Massage anfangen, wenn dadurch der Start unter Zeitdruck gerät.",
      priority: 110,
      urgent: true,
    });
  } else if (mode === "compact" && hints.length) {
    hints = hints.slice(0, careLimit(mode));
  } else {
    hints = hints.slice(0, careLimit(mode));
  }

  const hasUrgent = hints.some((item) => item.urgent);
  const summary = hints.length
    ? `${hints.length} Hinweis${hints.length === 1 ? "" : "e"} · ${hints.slice(0, 2).map(compactLabel).join(" · ")}`
    : "aktuell nichts Besonderes";

  return {
    hints,
    summary,
    urgent: hasUrgent,
    elapsedHours: Math.max(0, Number((Number(elapsedMinutes || 0) / 60).toFixed(1))),
    minutesToStart: Number.isFinite(minutes) ? minutes : null,
  };
}
