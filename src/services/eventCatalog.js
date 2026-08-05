const VERIFIED_EVENTS = [
  {
    id: "hermannslauf-2027",
    name: "Hermannslauf 2027",
    edition: "55. Hermannslauf",
    aliases: ["hermann", "hermannslauf", "55 hermannslauf", "tsve", "detmold bielefeld"],
    date: "2027-04-25",
    time: "11:00",
    location: "Hermannsdenkmal, Detmold → Sparrenburg, Bielefeld",
    targetKm: 31.1,
    goalDiscipline: "auto",
    surface: "mixed",
    courseType: "point_to_point",
    elevationGain: 0,
    elevationLoss: 0,
    sourceName: "Offizielle Hermannslauf-Website",
    sourceUrl: "https://hermannslauf.de/",
    verifiedAt: "2026-08-05",
    status: "verified",
    details: "31,1 km von Detmold nach Bielefeld durch den Teutoburger Wald. Start ab 11:00 Uhr am Hermannsdenkmal.",
  },
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eventSearchScore(event, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const name = normalizeText(event.name);
  const edition = normalizeText(event.edition);
  const aliases = (event.aliases || []).map(normalizeText);
  const haystacks = [name, edition, ...aliases];
  let score = 0;

  if (name === normalizedQuery || edition === normalizedQuery) score += 120;
  if (name.startsWith(normalizedQuery) || edition.startsWith(normalizedQuery)) score += 80;
  if (haystacks.some((value) => value.includes(normalizedQuery))) score += 55;

  queryTokens.forEach((token) => {
    if (name.startsWith(token)) score += 24;
    else if (name.includes(token)) score += 14;
    if (aliases.some((value) => value.startsWith(token))) score += 16;
    else if (aliases.some((value) => value.includes(token))) score += 8;
  });

  return score;
}

export function searchRunningEvents(query, {
  referenceDate = new Date(),
  includePast = false,
  limit = 6,
} = {}) {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) return [];
  const referenceKey = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate.toISOString().slice(0, 10)
    : String(referenceDate || "").slice(0, 10);

  return VERIFIED_EVENTS
    .filter((event) => includePast || !referenceKey || event.date >= referenceKey)
    .map((event) => ({ ...event, searchScore: eventSearchScore(event, normalizedQuery) }))
    .filter((event) => event.searchScore > 0)
    .sort((left, right) => right.searchScore - left.searchScore || left.date.localeCompare(right.date))
    .slice(0, Math.max(1, Number(limit || 6)));
}

export function eventSuggestionMissionPatch(event = {}) {
  return {
    name: event.name || "",
    date: event.date || "",
    time: event.time || "",
    location: event.location || "",
    place: event.place || null,
    targetKm: event.targetKm ?? "",
    goalDiscipline: event.goalDiscipline || "auto",
    elevationGain: event.elevationGain || "",
    elevationLoss: event.elevationLoss || "",
    surface: event.surface || "road",
    courseType: event.courseType || "unspecified",
    eventCatalogId: event.id || "",
    eventSourceName: event.sourceName || "",
    eventSourceUrl: event.sourceUrl || "",
    eventVerifiedAt: event.verifiedAt || "",
    eventDataStatus: event.status || "verified",
    eventSourceDetails: event.details || "",
  };
}

export function eventSuggestionOnboardingPatch(event = {}) {
  return {
    missionName: event.name || "",
    missionDate: event.date || "",
    missionDistanceKm: event.targetKm ?? "",
    missionGoalDiscipline: event.goalDiscipline || "auto",
  };
}

export function eventSourceStatusLabel(status) {
  if (status === "verified") return "Offiziell bestätigt";
  if (status === "adjusted") return "Offizielle Vorlage · von dir angepasst";
  return "Manuell eingetragen";
}

export function allVerifiedRunningEvents() {
  return VERIFIED_EVENTS.map((event) => ({ ...event }));
}
