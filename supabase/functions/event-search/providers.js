const GERMAN_MONTHS = {
  januar: 1,
  februar: 2,
  maerz: 3,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

const COUNTRY_CODES = {
  deutschland: "DE",
  germany: "DE",
  oesterreich: "AT",
  österreich: "AT",
  austria: "AT",
  schweiz: "CH",
  switzerland: "CH",
};

export function cleanText(value, max = 400) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeProviderText(value) {
  return cleanText(value, 1000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function decodeHtml(value) {
  const entities = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    auml: "ä",
    ouml: "ö",
    uuml: "ü",
    Auml: "Ä",
    Ouml: "Ö",
    Uuml: "Ü",
    szlig: "ß",
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name] ?? match);
}

function htmlToLines(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|dd|dt|h\d|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .split(/\r?\n/)
    .map((line) => cleanText(line, 1000))
    .filter(Boolean);
}

export function stripHtml(value) {
  return cleanText(htmlToLines(value).join(" "), 5000);
}

export function parseDistanceKm(value) {
  const text = cleanText(value, 1000).replace(/,/g, ".");
  const match = text.match(/(?:^|\s|\()(?:(?:ca\.|circa)\s*)?(\d{1,3}(?:\.\d{1,3})?)\s*(km|kilometer|m)(?=\s|\)|,|;|$)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const km = match[2].toLowerCase() === "m" ? amount / 1000 : amount;
  return km >= 0.1 && km <= 1000 ? Number(km.toFixed(3)) : null;
}

function isoDate(year, month, day) {
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(value.getTime())) return "";
  if (value.getUTCFullYear() !== Number(year) || value.getUTCMonth() !== Number(month) - 1 || value.getUTCDate() !== Number(day)) return "";
  return value.toISOString().slice(0, 10);
}

export function parseProviderDate(value) {
  const text = cleanText(value, 300);
  const dotNet = text.match(/\/Date\((\d{10,13})/i);
  if (dotNet) {
    const raw = Number(dotNet[1]);
    const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(iso[1], iso[2], iso[3]);
  const germanNumeric = text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (germanNumeric) return isoDate(germanNumeric[3], germanNumeric[2], germanNumeric[1]);
  const germanLong = text.match(/\b(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(20\d{2})\b/);
  if (germanLong) {
    const month = GERMAN_MONTHS[germanLong[2].toLowerCase()];
    if (month) return isoDate(germanLong[3], month, germanLong[1]);
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return isoDate(slash[3], slash[2], slash[1]);
  return "";
}

export function parseProviderDateRange(value) {
  const text = cleanText(value, 500);
  const sameMonth = text.match(/\b(\d{1,2})\.\s*(?:-|–|bis)\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(20\d{2})\b/i);
  if (sameMonth) {
    const month = GERMAN_MONTHS[sameMonth[3].toLowerCase()];
    if (month) return {
      date: isoDate(sameMonth[4], month, sameMonth[1]),
      endDate: isoDate(sameMonth[4], month, sameMonth[2]),
    };
  }
  const longRange = text.match(/\b(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(?:-|–|bis)\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(20\d{2})\b/i);
  if (longRange) {
    const startMonth = GERMAN_MONTHS[longRange[2].toLowerCase()];
    const endMonth = GERMAN_MONTHS[longRange[4].toLowerCase()];
    if (startMonth && endMonth) return {
      date: isoDate(longRange[5], startMonth, longRange[1]),
      endDate: isoDate(longRange[5], endMonth, longRange[3]),
    };
  }
  const date = parseProviderDate(text);
  return { date, endDate: date };
}

export function parseProviderTime(value) {
  const text = cleanText(value, 300);
  const isoTime = text.match(/T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?/i);
  if (isoTime) return `${isoTime[1]}:${isoTime[2]}`;
  const match = text.match(/\b([01]?\d|2[0-3])(?::|\.)([0-5]\d)\s*(?:Uhr)?\b/i);
  if (match) return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  const hour = text.match(/\b([01]?\d|2[0-3])\s*Uhr\b/i);
  return hour ? `${String(hour[1]).padStart(2, "0")}:00` : "";
}

export function slugify(value) {
  return normalizeProviderText(value).replace(/\s+/g, "-").replace(/^-|-$/g, "");
}

function countryCode(value) {
  const raw = cleanText(value, 80);
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_CODES[normalizeProviderText(raw)] || "";
}

function queryMatches(event, query) {
  const normalizedQuery = normalizeProviderText(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeProviderText([
    event.name,
    event.disciplineName,
    event.location,
    ...(event.aliases || []),
  ].join(" "));
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return haystack.includes(normalizedQuery) || tokens.every((token) => haystack.includes(token));
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (typeof value === "number") {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return parseProviderDate(String(value));
}

export function parseJsonResponseText(value) {
  const text = String(value || "").trim().replace(/^\uFEFF/, "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const jsonp = text.match(/^[^(]+\((.*)\)\s*;?$/s);
    if (!jsonp) return null;
    try {
      return JSON.parse(jsonp[1]);
    } catch {
      return null;
    }
  }
}

function findEventArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["events", "data", "results", "items", "topResults", "list", "Events", "Data", "Results"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) return value;
  }
  return [];
}

function raceResultLocation(item) {
  if (typeof item.location === "string") return cleanText(item.location);
  const location = item.location && typeof item.location === "object" ? item.location : {};
  return cleanText([
    item.city || item.City || item.addressLocality || item.place || location.city || location.name,
    item.zip || item.Zip || item.postalCode || location.zip,
    item.countryCode || item.CountryCode || item.country || location.countryCode,
  ].filter(Boolean).join(", "));
}

export function parseRaceResultPayload(payload, query, { referenceDate = new Date().toISOString().slice(0, 10) } = {}) {
  return findEventArray(payload)
    .map((item) => {
      const providerEventId = cleanText(item.id || item.ID || item.eventId || item.EventID || item.eventid, 80);
      const name = cleanText(item.name || item.Name || item.eventName || item.EventName || item.event || item.Event || item.title, 220);
      const date = normalizeDateValue(item.dateFrom || item.DateFrom || item.startDate || item.StartDate || item.date || item.Date);
      const endDate = normalizeDateValue(item.dateTo || item.DateTo || item.endDate || item.EndDate) || date;
      const location = raceResultLocation(item);
      const eventCountryCode = countryCode(item.countryCode || item.CountryCode || item.countryISO || item.CountryISO || item.country || item.Country);
      const targetKm = parseDistanceKm(`${name} ${item.description || item.Description || ""}`);
      return {
        id: `raceresult-${providerEventId || slugify(`${name}-${date}`)}`,
        provider: "raceresult",
        providerEventId: providerEventId || slugify(`${name}-${date}`),
        name,
        edition: "",
        disciplineName: targetKm ? `${String(targetKm).replace(".", ",")} km` : "",
        aliases: [],
        date,
        endDate,
        time: parseProviderTime(item.startTime || item.StartTime || item.time || item.Time || ""),
        location,
        countryCode: eventCountryCode,
        targetKm,
        goalDiscipline: "auto",
        surface: normalizeProviderText(name).includes("trail") ? "trail" : "road",
        courseType: "unspecified",
        elevationGain: 0,
        elevationLoss: 0,
        sourceName: "Race Result",
        sourceUrl: providerEventId ? `https://my.raceresult.com/${encodeURIComponent(providerEventId)}/info` : "https://my.raceresult.com/events/",
        verifiedAt: new Date().toISOString().slice(0, 10),
        status: "provider",
        details: "Datum und Ort aus dem öffentlichen Race-Result-Eventkalender. Fehlende Wettbewerbsdaten bleiben offen.",
        raw: item,
      };
    })
    .filter((event) => event.name && (!event.date || event.date >= referenceDate) && queryMatches(event, query));
}

function extractJsonLd(html) {
  const values = [];
  for (const match of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim());
      if (Array.isArray(parsed)) values.push(...parsed);
      else if (Array.isArray(parsed?.["@graph"])) values.push(...parsed["@graph"]);
      else values.push(parsed);
    } catch {
      // A malformed provider block must not break the complete search.
    }
  }
  return values;
}

function isEventJsonLd(item) {
  const type = item?.["@type"];
  return type === "Event" || (Array.isArray(type) && type.includes("Event"));
}

export function parseRaceResultEventPage(html, baseEvent = {}) {
  const jsonLd = extractJsonLd(html).find(isEventJsonLd) || {};
  const name = cleanText(jsonLd.name || baseEvent.name);
  const locationNode = jsonLd.location || {};
  const address = locationNode.address || {};
  const location = cleanText([
    address.streetAddress,
    address.addressLocality || locationNode.name,
    address.addressRegion,
    address.addressCountry,
  ].filter(Boolean).join(", ")) || baseEvent.location;
  const description = stripHtml(jsonLd.description || "");
  return {
    ...baseEvent,
    name: name || baseEvent.name,
    date: normalizeDateValue(jsonLd.startDate) || baseEvent.date,
    endDate: normalizeDateValue(jsonLd.endDate) || baseEvent.endDate || baseEvent.date,
    time: parseProviderTime(jsonLd.startDate) || baseEvent.time,
    location,
    countryCode: countryCode(address.addressCountry) || baseEvent.countryCode,
    targetKm: baseEvent.targetKm || parseDistanceKm(`${name} ${description}`),
    details: description || baseEvent.details,
  };
}

function hrefMatchesDavengo(value) {
  return /\/(?:v3\/)?event\/(?:overview|register)\//i.test(value || "");
}

function isDavengoUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "davengo.com" || hostname.endsWith(".davengo.com");
  } catch {
    return false;
  }
}

export function extractDavengoLinks(html, baseUrl = "https://www.davengo.com") {
  const links = [];
  for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    if (!hrefMatchesDavengo(href)) continue;
    const name = stripHtml(match[2]);
    if (!name) continue;
    try {
      const url = new URL(href, baseUrl).toString();
      if (isDavengoUrl(url)) links.push({ name, url });
    } catch {
      // Ignore invalid provider links.
    }
  }
  return links.filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index);
}

function likelyLocationLine(value) {
  const normalized = normalizeProviderText(value);
  if (!normalized || parseProviderDate(value)) return false;
  if (/^(kontakt|teilnehmerliste|veranstaltung teilen|deutsch|english|login|home|ergebnisse|veranstalter|mein davengo|angebote)$/.test(normalized)) return false;
  if (/sportart|distanz|startzeit|startgeld|jahrgang|anmeldung/.test(normalized)) return false;
  return value.length <= 120;
}

function davengoHeader(html) {
  const titleMatch = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripHtml(titleMatch?.[1] || "");
  const pageText = stripHtml(html);
  const dateRange = parseProviderDateRange(pageText);
  const countryLocation = pageText.match(/(?:Deutschland|Germany)\s*,\s*([^,]+?)\s*,\s*(?=\d{1,2}\.|20\d{2}-\d{2}-\d{2})/i);
  let location = cleanText(countryLocation?.[1] || "");

  if (!location && titleMatch) {
    const afterTitle = String(html).slice((titleMatch.index || 0) + titleMatch[0].length, (titleMatch.index || 0) + titleMatch[0].length + 3500);
    const lines = htmlToLines(afterTitle);
    const dateLineIndex = lines.findIndex((line) => Boolean(parseProviderDate(line)));
    if (dateLineIndex > 0) {
      location = cleanText([...lines.slice(0, dateLineIndex)].reverse().find(likelyLocationLine) || "");
    }
  }

  return {
    name: title,
    date: dateRange.date,
    endDate: dateRange.endDate,
    location,
    pageText,
  };
}

function isRunningSection(title, text) {
  const normalized = normalizeProviderText(`${title} ${text}`);
  if (/sportart\s+walking/.test(normalized) && !/sportart\s+laufen/.test(normalized)) return false;
  return /sportart\s+laufen|lauf|run|marathon|trail|ultra/.test(normalized);
}

function davengoSections(html) {
  const sections = [];
  const matches = [...String(html || "").matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2-4]\b|Kontakt zum Veranstalter|<footer\b|$)/gi)];
  for (const match of matches) {
    const title = stripHtml(match[2]);
    const text = stripHtml(match[3]);
    if (!title || !isRunningSection(title, text)) continue;
    const dateRange = parseProviderDateRange(text);
    sections.push({
      title,
      text,
      distance: parseDistanceKm(text),
      date: dateRange.date,
      endDate: dateRange.endDate,
      time: parseProviderTime(text),
    });
  }
  return sections;
}

export function parseDavengoEventPage(html, sourceUrl, query = "") {
  if (!isDavengoUrl(sourceUrl)) return [];
  const header = davengoHeader(html);
  if (!header.name || !header.date) return [];
  const slug = new URL(sourceUrl).pathname.split("/").filter(Boolean).filter((part) => part !== "overview").pop()
    || slugify(`${header.name}-${header.date}`);
  const sections = davengoSections(html);
  const usableSections = sections.length ? sections : [{
    title: header.name,
    text: header.pageText,
    distance: parseDistanceKm(`${header.name} ${header.pageText}`),
    date: header.date,
    endDate: header.endDate,
    time: parseProviderTime(header.pageText),
  }];

  return usableSections.map((section, index) => ({
    id: `davengo-${slug}-${slugify(section.title || String(index)) || index}`,
    provider: "davengo",
    providerEventId: slug,
    name: header.name,
    edition: "",
    disciplineName: section.title === header.name ? "" : section.title,
    aliases: [],
    date: section.date || header.date,
    endDate: section.endDate || section.date || header.endDate || header.date,
    time: section.time,
    location: header.location,
    countryCode: "DE",
    targetKm: section.distance,
    goalDiscipline: "auto",
    surface: normalizeProviderText(`${header.name} ${section.title}`).includes("trail") ? "trail" : "road",
    courseType: "unspecified",
    elevationGain: 0,
    elevationLoss: 0,
    sourceName: "Davengo",
    sourceUrl,
    verifiedAt: new Date().toISOString().slice(0, 10),
    status: "provider",
    details: section.title && section.title !== header.name
      ? `${section.title}. Eventdaten aus der veröffentlichten Davengo-Anmeldung.`
      : "Eventdaten aus der veröffentlichten Davengo-Anmeldung.",
  })).filter((event) => queryMatches(event, query));
}

export function eventCacheSearchText(event = {}) {
  return normalizeProviderText([
    event.name,
    event.edition,
    event.disciplineName,
    event.location,
    ...(event.aliases || []),
  ].join(" "));
}

function canonicalProviderName(value) {
  return normalizeProviderText(value)
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/^\d{1,3}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function eventDedupeKey(event = {}) {
  const baseName = canonicalProviderName(event.name);
  const discipline = canonicalProviderName(event.disciplineName);
  const distance = Number(event.targetKm || 0).toFixed(3);
  return [baseName, event.date || "", discipline, distance].join("|");
}

function providerPriority(event = {}) {
  if (event.provider === "raceresult") return 3;
  if (event.provider === "davengo") return 2;
  return 1;
}

export function dedupeProviderEvents(events = []) {
  const byKey = new Map();
  for (const event of events.filter((value) => value?.name)) {
    const key = eventDedupeKey(event);
    const existing = byKey.get(key);
    if (!existing || providerPriority(event) > providerPriority(existing)) byKey.set(key, event);
  }
  return [...byKey.values()];
}

function candidateStems(query) {
  const normalized = normalizeProviderText(query);
  const withoutYear = normalized.replace(/\b(19|20)\d{2}\b/g, "").trim();
  const withoutEdition = withoutYear.replace(/^\d{1,3}\s+/, "").trim();
  const stems = new Set([slugify(normalized), slugify(withoutYear), slugify(withoutEdition)]);
  for (const stem of [...stems]) {
    if (!stem) continue;
    if (!/(?:lauf|run|marathon|ultra|trail)$/.test(stem)) {
      stems.add(`${stem}slauf`);
      stems.add(`${stem}lauf`);
      stems.add(`${stem}-lauf`);
    }
  }
  return [...stems].filter((stem) => stem.length >= 3);
}

export function davengoCandidateUrls(query, referenceDate = new Date()) {
  const stems = candidateStems(query);
  if (!stems.length) return [];
  const explicitYear = normalizeProviderText(query).match(/\b(20\d{2})\b/)?.[1];
  const year = referenceDate.getUTCFullYear();
  const years = explicitYear ? [Number(explicitYear)] : [year, year + 1, year + 2];
  const urls = [];
  for (const stem of stems) {
    const stemHasYear = /-20\d{2}$/.test(stem);
    const eventStems = stemHasYear ? [stem] : years.map((eventYear) => `${stem}-${eventYear}`);
    for (const eventStem of eventStems) {
      urls.push(`https://www.davengo.com/event/overview/${eventStem}`);
      urls.push(`https://www.davengo.com/v3/event/register/${eventStem}/overview`);
    }
  }
  return [...new Set(urls)];
}
