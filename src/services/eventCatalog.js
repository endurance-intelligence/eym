const VERIFIED_EVENTS = [
  {
    id: "hermannslauf-2027",
    provider: "official",
    providerEventId: "hermannslauf-2027",
    name: "Hermannslauf 2027",
    edition: "55. Hermannslauf",
    aliases: ["hermann", "hermannslauf", "55 hermannslauf", "tsve", "detmold bielefeld"],
    date: "2027-04-25",
    endDate: "2027-04-25",
    time: "11:00",
    location: "Hermannsdenkmal, Detmold → Sparrenburg, Bielefeld",
    countryCode: "DE",
    targetKm: 31.1,
    disciplineName: "Hermannslauf",
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

export function normalizeEventSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function eventSearchScore(event, query) {
  const normalizedQuery = normalizeEventSearchText(query);
  if (!normalizedQuery) return 0;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const name = normalizeEventSearchText(event.name);
  const edition = normalizeEventSearchText(event.edition);
  const disciplineName = normalizeEventSearchText(event.disciplineName);
  const location = normalizeEventSearchText(event.location);
  const aliases = (event.aliases || []).map(normalizeEventSearchText);
  const haystacks = [name, edition, disciplineName, location, ...aliases].filter(Boolean);
  const tokenMatched = (token) => haystacks.some((value) => value.includes(token));
  if (!queryTokens.every(tokenMatched)) return 0;

  let matchScore = 0;

  if (name === normalizedQuery || edition === normalizedQuery || disciplineName === normalizedQuery) matchScore += 120;
  if (name.startsWith(normalizedQuery) || edition.startsWith(normalizedQuery) || disciplineName.startsWith(normalizedQuery)) matchScore += 80;
  if (haystacks.some((value) => value.includes(normalizedQuery))) matchScore += 55;

  queryTokens.forEach((token) => {
    if (name.startsWith(token)) matchScore += 24;
    else if (name.includes(token)) matchScore += 14;
    if (disciplineName.startsWith(token)) matchScore += 18;
    else if (disciplineName.includes(token)) matchScore += 10;
    if (aliases.some((value) => value.startsWith(token))) matchScore += 16;
    else if (aliases.some((value) => value.includes(token))) matchScore += 8;
    if (location.includes(token)) matchScore += 5;
  });

  // Source quality may only break ties between genuine textual matches.
  // It must never turn an unrelated event into a search result.
  if (matchScore <= 0) return 0;
  let qualityBonus = 0;
  if (event.status === "verified") qualityBonus += 8;
  if (event.provider === "raceresult") qualityBonus += 3;
  return matchScore + qualityBonus;
}

function eventSourcePriority(event = {}) {
  if (event.status === "verified" || event.provider === "official") return 400;
  if (event.status === "provider" && event.provider === "raceresult") return 320;
  if (event.status === "provider" && event.provider === "davengo") return 300;
  if (event.status === "provider") return 280;
  if (event.status === "cached" && event.provider === "raceresult") return 240;
  if (event.status === "cached") return 220;
  return 100;
}

function canonicalEventName(value) {
  return normalizeEventSearchText(value)
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/^\d{1,3}\s+/, "")
    .replace(/\b(e v|ev)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalVariant(event = {}) {
  const baseName = canonicalEventName(event.name);
  const discipline = canonicalEventName(event.disciplineName);
  const targetKm = Number(event.targetKm || 0);
  const distanceKey = targetKm > 0 ? targetKm.toFixed(3) : "open";
  const disciplineIsGeneric = !discipline
    || discipline === baseName
    || /^\d+(?: \d+)?\s*(km|kilometer|m)$/.test(discipline.replace(/\./g, " "));
  return disciplineIsGeneric ? distanceKey : `${discipline}|${distanceKey}`;
}

export function eventCanonicalKey(event = {}) {
  return [canonicalEventName(event.name), event.date || "", canonicalVariant(event)].join("|");
}

function mergeEventSources(preferred, alternative) {
  const sourceAlternatives = [
    ...(preferred.sourceAlternatives || []),
    alternative.sourceName,
    ...(alternative.sourceAlternatives || []),
  ].filter(Boolean);
  return {
    ...alternative,
    ...preferred,
    aliases: [...new Set([...(preferred.aliases || []), ...(alternative.aliases || [])])],
    sourceAlternatives: [...new Set(sourceAlternatives)].filter((source) => source !== preferred.sourceName),
  };
}

export function mergeRunningEventSuggestions(...groups) {
  const byKey = new Map();
  groups.flat().filter(Boolean).forEach((event) => {
    const normalized = {
      goalDiscipline: "auto",
      surface: "road",
      courseType: "unspecified",
      status: "provider",
      verifiedAt: "",
      ...event,
    };
    const key = eventCanonicalKey(normalized) || normalized.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      return;
    }
    const preferred = eventSourcePriority(normalized) > eventSourcePriority(existing) ? normalized : existing;
    const alternative = preferred === normalized ? existing : normalized;
    byKey.set(key, mergeEventSources(preferred, alternative));
  });
  return [...byKey.values()];
}

export function searchRunningEvents(query, {
  referenceDate = new Date(),
  includePast = false,
  limit = 6,
} = {}) {
  const normalizedQuery = normalizeEventSearchText(query);
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

export function rankRunningEventSuggestions(events, query, {
  referenceDate = new Date(),
  includePast = false,
  limit = 8,
} = {}) {
  const referenceKey = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate.toISOString().slice(0, 10)
    : String(referenceDate || "").slice(0, 10);
  return mergeRunningEventSuggestions(events)
    .filter((event) => includePast || !event.date || !referenceKey || event.date >= referenceKey)
    .map((event) => ({ ...event, searchScore: eventSearchScore(event, query) }))
    .filter((event) => event.searchScore > 0)
    .sort((left, right) => right.searchScore - left.searchScore || String(left.date || "9999").localeCompare(String(right.date || "9999")))
    .slice(0, Math.max(1, Number(limit || 8)));
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
    eventDataStatus: event.status || "provider",
    eventSourceDetails: event.details || event.disciplineName || "",
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
  if (status === "provider") return "Beim Anbieter veröffentlicht";
  if (status === "cached") return "Anbieterangaben · zwischengespeichert";
  if (status === "adjusted") return "Eventvorlage · von dir angepasst";
  return "Manuell eingetragen";
}

export function eventProviderLabel(provider) {
  if (provider === "raceresult") return "Race Result";
  if (provider === "davengo") return "Davengo";
  if (provider === "official") return "Offizielle Quelle";
  return "Eventquelle";
}

export function allVerifiedRunningEvents() {
  return VERIFIED_EVENTS.map((event) => ({ ...event }));
}
