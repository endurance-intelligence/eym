import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cleanText,
  davengoCandidateUrls,
  dedupeProviderEvents,
  eventCacheSearchText,
  extractDavengoLinks,
  normalizeProviderText,
  parseDavengoEventPage,
  parseJsonResponseText,
  parseRaceResultEventPage,
  parseRaceResultPayload,
} from "./providers.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const USER_AGENT = "EnduranceIntelligence/3.9.39 (+https://endurance-intelligence.github.io/eym/)";
const CACHE_HOURS = 18;
const STALE_DAYS = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function errorMessage(value: unknown, fallback = "Quelle nicht erreichbar") {
  return value instanceof Error ? value.message : cleanText(value, 240) || fallback;
}

function allowedProviderUrl(value: string, provider: "raceresult" | "davengo") {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (provider === "raceresult") return hostname === "raceresult.com" || hostname.endsWith(".raceresult.com");
    return hostname === "davengo.com" || hostname.endsWith(".davengo.com");
  } catch {
    return false;
  }
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ist in Supabase noch nicht gesetzt.`);
  return value;
}

function adminClient() {
  return createClient(requiredSecret("SUPABASE_URL"), requiredSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUser(request: Request, admin: ReturnType<typeof adminClient>) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function fetchWithTimeout(url: string, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.7",
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function eventMatchesQuery(event: Record<string, unknown>, query: string) {
  const tokens = normalizeProviderText(query).split(" ").filter(Boolean);
  const haystack = eventCacheSearchText(event);
  return tokens.every((token) => haystack.includes(token));
}

function rowToEvent(row: Record<string, unknown>, cached = true) {
  const raw = (row.raw_event || {}) as Record<string, unknown>;
  return {
    ...raw,
    id: raw.id || `${row.provider}-${row.provider_event_id}-${row.variant_key}`,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    name: row.name,
    disciplineName: row.discipline_name || "",
    date: row.event_date || "",
    endDate: row.end_date || row.event_date || "",
    time: row.start_time || "",
    location: row.location || "",
    countryCode: row.country_code || "",
    targetKm: row.target_km == null ? null : Number(row.target_km),
    sourceName: row.source_name || "",
    sourceUrl: row.source_url || "",
    verifiedAt: String(row.last_verified_at || "").slice(0, 10),
    status: cached ? "cached" : (raw.status || "provider"),
  };
}

async function cachedEvents(admin: ReturnType<typeof adminClient>, query: string, { freshOnly = true, limit = 20 } = {}) {
  const normalized = normalizeProviderText(query);
  const firstToken = normalized.split(" ").filter(Boolean)[0] || normalized;
  let builder = admin
    .from("event_discovery_cache")
    .select("provider,provider_event_id,variant_key,name,discipline_name,event_date,end_date,start_time,location,country_code,target_km,source_name,source_url,last_verified_at,expires_at,raw_event,search_text")
    .ilike("search_text", `%${firstToken}%`)
    .gte("event_date", new Date().toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(Math.max(10, limit * 4));
  if (freshOnly) builder = builder.gt("expires_at", new Date().toISOString());
  else builder = builder.gt("last_verified_at", new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString());
  const { data, error } = await builder;
  if (error) throw error;
  return (data || [])
    .map((row) => rowToEvent(row, true))
    .filter((event) => eventMatchesQuery(event, query))
    .slice(0, limit);
}

function variantKey(event: Record<string, unknown>) {
  return normalizeProviderText(`${event.disciplineName || "event"}-${event.targetKm || "open"}`).replace(/\s+/g, "-").slice(0, 120) || "event";
}

async function cacheEvents(admin: ReturnType<typeof adminClient>, events: Record<string, unknown>[]) {
  if (!events.length) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_HOURS * 3_600_000).toISOString();
  const rows = events.map((event) => ({
    provider: cleanText(event.provider, 40),
    provider_event_id: cleanText(event.providerEventId || event.id, 180),
    variant_key: variantKey(event),
    name: cleanText(event.name, 240),
    discipline_name: cleanText(event.disciplineName, 200),
    event_date: event.date || null,
    end_date: event.endDate || event.date || null,
    start_time: event.time || null,
    location: cleanText(event.location, 300),
    country_code: cleanText(event.countryCode, 2).toUpperCase(),
    target_km: event.targetKm == null ? null : Number(event.targetKm),
    source_name: cleanText(event.sourceName, 120),
    source_url: cleanText(event.sourceUrl, 600),
    search_text: eventCacheSearchText(event),
    raw_event: event,
    last_verified_at: now.toISOString(),
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  }));
  const { error } = await admin
    .from("event_discovery_cache")
    .upsert(rows, { onConflict: "provider,provider_event_id,variant_key" });
  if (error) throw error;
}

function raceResultEndpoint(query: string, pathname = "/RREvents/list") {
  const endpoint = new URL(pathname, "https://my.raceresult.com");
  endpoint.searchParams.set("group", "0");
  endpoint.searchParams.set("user", "0");
  endpoint.searchParams.set("userID", "0");
  endpoint.searchParams.set("geoLocation", "IP");
  endpoint.searchParams.set("lang", "de");
  endpoint.searchParams.set("modes", "topResults");
  endpoint.searchParams.set("search", query);
  endpoint.searchParams.set("searchText", query);
  endpoint.searchParams.set("term", query);
  endpoint.searchParams.set("sportTypes", "0,23,30");
  return endpoint.toString();
}

async function raceResultEvents(query: string, limit: number) {
  let payload: unknown = null;
  let lastError = "Race Result lieferte keine lesbaren Eventdaten.";
  for (const pathname of ["/RREvents/list", "/RREvents/list.php"]) {
    try {
      const response = await fetchWithTimeout(raceResultEndpoint(query, pathname));
      if (!response.ok) {
        lastError = `Race Result antwortet mit HTTP ${response.status}.`;
        continue;
      }
      payload = parseJsonResponseText(await response.text());
      if (payload) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!payload) throw new Error(lastError);

  const baseEvents = parseRaceResultPayload(payload, query).slice(0, Math.max(limit, 6));
  const enriched = await Promise.all(baseEvents.slice(0, 6).map(async (event) => {
    try {
      const page = await fetchWithTimeout(event.sourceUrl, 4500);
      if (!page.ok || !allowedProviderUrl(page.url, "raceresult")) return event;
      return parseRaceResultEventPage(await page.text(), event);
    } catch {
      return event;
    }
  }));
  return dedupeProviderEvents([...enriched, ...baseEvents.slice(6)])
    .filter((event) => eventMatchesQuery(event, query))
    .slice(0, limit);
}

async function davengoEvents(query: string, limit: number) {
  const candidateUrls = new Set(davengoCandidateUrls(query, new Date()));
  try {
    const searchUrl = new URL("https://www.davengo.com/");
    searchUrl.searchParams.set("lang", "de");
    searchUrl.searchParams.set("search", query);
    const response = await fetchWithTimeout(searchUrl.toString(), 5000);
    if (response.ok && allowedProviderUrl(response.url, "davengo")) {
      extractDavengoLinks(await response.text())
        .forEach((link) => candidateUrls.add(link.url));
    }
  } catch {
    // Direct event slug candidates remain available when the homepage search is unavailable.
  }

  const urls = [...candidateUrls].slice(0, 14);
  const responses = await Promise.allSettled(urls.map(async (url) => {
    const response = await fetchWithTimeout(url, 4600);
    if (!response.ok || !allowedProviderUrl(response.url, "davengo")) return [];
    return parseDavengoEventPage(await response.text(), response.url || url, query);
  }));
  const events = responses.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return dedupeProviderEvents(events)
    .filter((event) => eventMatchesQuery(event, query))
    .slice(0, limit);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, message: "Nur POST ist erlaubt." }, 405);

  try {
    const admin = adminClient();
    const user = await authenticatedUser(request, admin);
    if (!user) return json({ ok: false, message: "Für die Live-Eventsuche musst du angemeldet sein." }, 401);

    const body = await request.json().catch(() => ({})) as { query?: unknown; limit?: unknown };
    const query = cleanText(body.query, 80);
    const requestedLimit = Number(body.limit ?? 8);
    const limit = Number.isFinite(requestedLimit) ? Math.min(12, Math.max(3, Math.round(requestedLimit))) : 8;
    if (normalizeProviderText(query).length < 3) return json({ ok: false, message: "Bitte mindestens drei Zeichen eingeben." }, 400);

    const warnings: string[] = [];
    let fresh: Record<string, unknown>[] = [];
    try {
      fresh = await cachedEvents(admin, query, { freshOnly: true, limit });
    } catch (error) {
      console.error("event-search fresh cache failed", error);
      warnings.push("Zwischenspeicher: vorübergehend nicht erreichbar");
    }
    if (fresh.length >= Math.min(4, limit)) {
      return json({
        ok: true,
        events: dedupeProviderEvents(fresh).slice(0, limit),
        providers: [...new Set(fresh.map((event) => event.provider))],
        cached: true,
        partial: warnings.length > 0,
        warnings,
      });
    }

    const providerResults = await Promise.allSettled([
      raceResultEvents(query, limit),
      davengoEvents(query, limit),
    ]);
    const providerNames = ["Race Result", "Davengo"];
    const liveEvents: Record<string, unknown>[] = [];
    providerResults.forEach((result, index) => {
      if (result.status === "fulfilled") liveEvents.push(...result.value);
      else warnings.push(`${providerNames[index]}: ${errorMessage(result.reason)}`);
    });

    const merged = dedupeProviderEvents([...liveEvents, ...fresh]).slice(0, limit);
    if (liveEvents.length) {
      try {
        await cacheEvents(admin, liveEvents);
      } catch (error) {
        console.error("event-search cache write failed", error);
        warnings.push("Zwischenspeicher: neue Ergebnisse konnten nicht gespeichert werden");
      }
    }

    if (!merged.length) {
      let stale: Record<string, unknown>[] = [];
      try {
        stale = await cachedEvents(admin, query, { freshOnly: false, limit });
      } catch (error) {
        console.error("event-search stale cache failed", error);
        if (!warnings.some((warning) => warning.startsWith("Zwischenspeicher:"))) {
          warnings.push("Zwischenspeicher: vorübergehend nicht erreichbar");
        }
      }
      return json({
        ok: true,
        events: dedupeProviderEvents(stale).slice(0, limit),
        providers: [...new Set(stale.map((event) => event.provider))],
        cached: stale.length > 0,
        partial: warnings.length > 0,
        warnings,
      });
    }

    return json({
      ok: true,
      events: merged,
      providers: [...new Set(merged.map((event) => event.provider))],
      cached: liveEvents.length === 0,
      partial: warnings.length > 0,
      warnings,
    });
  } catch (error) {
    console.error("event-search failed", error);
    const message = error instanceof Error ? error.message : "Die Live-Eventsuche ist fehlgeschlagen.";
    return json({ ok: false, message }, 500);
  }
});
