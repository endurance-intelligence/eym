export const COACH_QUESTION_OPTIONS = [
  { key: "why", label: "Warum diese Empfehlung?" },
  { key: "trend", label: "Wie entwickelt sich mein Training?" },
  { key: "goal", label: "Was bedeutet das für mein Ziel?" },
  { key: "data", label: "Wie verlässlich ist die Aussage?" },
];

function fact(id, label, value, detail, source) {
  return { id, label, value, detail, source };
}

export function buildCoachFactPacket(coach = {}) {
  const analytics = coach.analytics || {};
  const metrics = analytics.metrics || {};
  const recovery = coach.recovery || {};
  const week = coach.week || {};
  const goal = coach.goal || {};
  return {
    generatedAt: coach.generatedAt || new Date().toISOString(),
    recommendationId: coach.recommendation?.id || "",
    protection: coach.protectionNote || "",
    facts: [
      fact("coach-status", "Coach-Status", coach.label || "Offen", coach.recommendation?.text || "", "Gemeinsame Coach-Bewertung"),
      fact(
        "recovery",
        "Erholung",
        recovery.label || "Noch offen",
        recovery.reviewed
          ? `Beine ${recovery.legs}/10 · Energie ${recovery.energy}/10 · Belastung ${recovery.rpe}/10`
          : recovery.text || "Noch kein aktuelles Review",
        "Lauf-Reviews",
      ),
      fact(
        "week-load",
        "Wochenbelastung",
        week.projected != null ? `${week.projected} projizierter EYM-Load` : "Noch offen",
        week.average ? `Jüngster Vergleichsrahmen ${week.average}` : "Noch kein belastbarer Vergleichsrahmen",
        "Plan und absolvierte Aktivitäten",
      ),
      fact(
        "volume-trend",
        "Umfangstrend",
        analytics.trend?.label || "Noch offen",
        analytics.trend?.text || "Noch keine ausreichenden Wochen vorhanden",
        "Abgeschlossene Laufwochen",
      ),
      fact(
        "goal-specificity",
        "Zielnähe",
        analytics.specificity ? `${analytics.specificity.score}/100 · ${analytics.specificity.label}` : "Noch offen",
        analytics.specificity?.text || "",
        goal.target?.name ? `Hauptziel ${goal.target.name}` : "Allgemeines Ausdauerprofil",
      ),
      fact(
        "review-coverage",
        "Review-Abdeckung",
        `${metrics.reviewedRuns || 0}/${metrics.runs || 0} Läufe`,
        `${metrics.stableReviews || 0} stabile und ${metrics.warningReviews || 0} auffällige Reviews`,
        "Trainingsreviews",
      ),
      fact(
        "fuel-practice",
        "Fuel-Praxis",
        `${metrics.fuelTracked || 0}/${metrics.fuelRuns || 0} lange Einheiten erfasst`,
        `${metrics.fuelInRange || 0} dokumentierte Einheiten im Zielbereich`,
        "Fuel-Reviews ab 90 Minuten",
      ),
      fact(
        "data-confidence",
        "Datenqualität",
        analytics.confidence ? `${analytics.confidence.score}/100 · ${analytics.confidence.label}` : "Noch offen",
        analytics.confidence?.text || "",
        "Datenabdeckung",
      ),
    ],
  };
}

function selectFacts(packet, ids) {
  return ids.map((id) => packet.facts.find((item) => item.id === id)).filter(Boolean);
}

export function answerCoachQuestion(coach = {}, questionKey = "why") {
  const packet = buildCoachFactPacket(coach);
  const analytics = coach.analytics || {};
  const metrics = analytics.metrics || {};
  const targetName = coach.goal?.target?.name || "dein aktuelles Ausdauerziel";

  if (questionKey === "trend") {
    return {
      key: questionKey,
      title: "Entwicklung im gewählten Trainingsfenster",
      answer: `${analytics.trend?.text || "Für einen Umfangstrend fehlen noch abgeschlossene Wochen."} Du warst in ${metrics.activeWeeks || 0} von ${metrics.weekCount || 0} Wochen läuferisch aktiv, mit durchschnittlich ${Number(metrics.averageKm || 0).toFixed(1)} km pro Woche. Der längste Lauf lag bei ${Number(metrics.longestRun || 0).toFixed(1)} km.`,
      evidence: selectFacts(packet, ["volume-trend", "review-coverage"]),
      protection: packet.protection,
    };
  }

  if (questionKey === "goal") {
    const focus = Array.isArray(coach.goal?.focus) ? coach.goal.focus.join(", ") : "Konstanz und kontrollierter Aufbau";
    return {
      key: questionKey,
      title: `Einordnung für ${targetName}`,
      answer: `${analytics.specificity?.text || "EYM kann die Zielnähe erst mit weiteren Trainingswochen bewerten."} Als relevante Schwerpunkte erkennt EYM aktuell: ${focus}. Daraus entsteht ein Vorschlag, aber keine automatische Änderung deiner Woche.`,
      evidence: selectFacts(packet, ["goal-specificity", "fuel-practice", "volume-trend"]),
      protection: packet.protection,
    };
  }

  if (questionKey === "data") {
    return {
      key: questionKey,
      title: "So belastbar ist die aktuelle Aussage",
      answer: `${analytics.confidence?.text || "Die Datenabdeckung ist noch offen."} Je mehr Distanz, Dauer, Herzfrequenz, externe Belastungswerte und kurze Reviews zusammenkommen, desto genauer kann EYM objektive und subjektive Signale vergleichen.`,
      evidence: selectFacts(packet, ["data-confidence", "review-coverage"]),
      protection: packet.protection,
    };
  }

  return {
    key: "why",
    title: coach.recommendation?.title || "Aktuelle Coach-Einordnung",
    answer: coach.recommendation?.text || "Noch keine persönliche Empfehlung verfügbar.",
    evidence: selectFacts(packet, ["recovery", "week-load", "volume-trend", "goal-specificity"]),
    protection: packet.protection,
  };
}

export function buildGroundedCoachContext(coach = {}) {
  const packet = buildCoachFactPacket(coach);
  return {
    instruction: "Erkläre ausschließlich die gelieferten EYM-Fakten. Erfinde keine Messwerte, stelle keine medizinische Diagnose und ändere keinen Trainingsplan.",
    ...packet,
  };
}
