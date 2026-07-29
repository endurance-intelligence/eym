import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isIntervalsOwner } from "../_shared/intervalsAccess.ts";
import { intervalDescription, isGuidedPlanItem, isProvisionalTrackPlanItem } from "../_shared/structuredWorkout.ts";
import { intervalsStartDateLocal } from "../_shared/plannerTiming.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const PLAN_PREFIX = "endurance-intelligence:";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ist in Supabase nicht gesetzt.`);
  return value;
}

async function authenticatedUser(request: Request) {
  const supabaseUrl = requiredSecret("SUPABASE_URL");
  const serviceRole = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = request.headers.get("Authorization") || "";
  const accessJwt = authorization.replace(/^Bearer\s+/i, "");
  if (!accessJwt) return null;
  const { data, error } = await admin.auth.getUser(accessJwt);
  if (error || !data.user) return null;
  return data.user;
}

function intervalsAuthorization(apiKey: string) {
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`;
}

async function intervalsRequest(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`https://intervals.icu/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: intervalsAuthorization(apiKey),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : data?.message;
    throw new Error(message || `Intervals.icu-Anfrage fehlgeschlagen (${response.status}).`);
  }
  return data;
}

function intervalsGet(path: string, apiKey: string) {
  return intervalsRequest(path, apiKey);
}

function validDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function safeMinutes(value: unknown, fallback = 60) {
  const parsed = Math.round(Number(value || fallback));
  return Math.max(1, Math.min(24 * 60, Number.isFinite(parsed) ? parsed : fallback));
}

function workoutType(item: Record<string, unknown>) {
  const value = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  if (/rad|ride|bike|cycling/.test(value)) return "Ride";
  return "Run";
}

function planEvent(item: Record<string, unknown>, existingId?: unknown) {
  const guided = isGuidedPlanItem(item);
  const externalId = `${PLAN_PREFIX}${String(item.id || crypto.randomUUID())}`;
  const base: Record<string, unknown> = {
    ...(existingId ? { id: existingId } : {}),
    category: guided ? "WORKOUT" : "NOTE",
    start_date_local: intervalsStartDateLocal(item),
    name: String(item.title || item.type || "Training"),
    external_id: externalId,
  };

  if (guided) {
    return {
      ...base,
      type: workoutType(item),
      description: intervalDescription(item),
    };
  }

  const description = [
    item.type || "Training",
    item.duration ? `${safeMinutes(item.duration)} min` : "",
    item.optional ? "Optional" : "Pflicht",
    item.notes || "",
  ].filter(Boolean).join(" · ");
  return { ...base, description };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Nur POST ist erlaubt." }, 405);

  try {
    const user = await authenticatedUser(request);
    if (!user) return json({ message: "Nicht angemeldet." }, 401);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");
    const ownerUserId = Deno.env.get("INTERVALS_OWNER_USER_ID") || "";
    const ownerAccess = isIntervalsOwner(user.id, ownerUserId);

    if (!ownerAccess) {
      const message = ownerUserId
        ? "Für dieses Konto ist noch keine persönliche Intervals.icu-Verbindung eingerichtet."
        : "Der private Intervals.icu-Zugang ist noch keinem Konto zugeordnet.";
      if (action === "status") {
        return json({ configured: false, connected: false, privateConnection: true, message });
      }
      return json({ message }, 403);
    }

    const apiKey = Deno.env.get("INTERVALS_API_KEY") || "";
    const athleteId = encodeURIComponent(Deno.env.get("INTERVALS_ATHLETE_ID") || "0");

    if (action === "status") {
      if (!apiKey) return json({ configured: false, connected: false, message: "INTERVALS_API_KEY fehlt." });
      try {
        const newestDate = new Date();
        newestDate.setDate(newestDate.getDate() + 1);
        const oldestDate = new Date();
        oldestDate.setDate(oldestDate.getDate() - 30);
        const query = new URLSearchParams({
          oldest: oldestDate.toISOString().slice(0, 10),
          newest: newestDate.toISOString().slice(0, 10),
          limit: "1",
        });
        const latest = await intervalsGet(`/athlete/${athleteId}/activities?${query.toString()}`, apiKey);
        return json({ configured: true, connected: true, activityCount: Array.isArray(latest) ? latest.length : 0 });
      } catch (error) {
        return json({ configured: true, connected: false, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (!apiKey) return json({ message: "INTERVALS_API_KEY ist in Supabase noch nicht gesetzt." }, 400);


    if (action === "gear") {
      const gear = await intervalsGet(`/athlete/${athleteId}/gear`, apiKey);
      if (!Array.isArray(gear)) throw new Error("Intervals.icu hat keine gültige Ausrüstungsliste geliefert.");
      return json({ gear, syncedAt: new Date().toISOString() });
    }

    if (action === "sync") {
      const after = String(body.after || "2025-01-01");
      const oldestDate = validDate(after) ? after : "2025-01-01";
      const newestDate = new Date();
      newestDate.setDate(newestDate.getDate() + 1);
      const newest = newestDate.toISOString().slice(0, 10);
      const query = new URLSearchParams({ oldest: oldestDate, newest, limit: "2000" });
      const activities = await intervalsGet(`/athlete/${athleteId}/activities?${query.toString()}`, apiKey);
      if (!Array.isArray(activities)) throw new Error("Intervals.icu hat kein gültiges Aktivitäten-Array geliefert.");
      return json({ activities, syncedAt: new Date().toISOString() });
    }

    if (action === "publish-plan") {
      const weekStart = String(body.weekStart || "");
      const weekEnd = String(body.weekEnd || "");
      if (!validDate(weekStart) || !validDate(weekEnd) || weekEnd < weekStart) {
        return json({ message: "Ungültiger Wochenzeitraum." }, 400);
      }

      const incoming = Array.isArray(body.plan) ? body.plan : [];
      const plan = incoming.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        const date = String(row.date || "");
        return validDate(date)
          && date >= weekStart
          && date <= weekEnd
          && !row.archived
          && !row.completed
          && !row.missedReason
          && !isProvisionalTrackPlanItem(row);
      }) as Record<string, unknown>[];

      const query = new URLSearchParams({ oldest: weekStart, newest: weekEnd });
      const existingResponse = await intervalsGet(`/athlete/${athleteId}/events?${query.toString()}`, apiKey);
      const existing = Array.isArray(existingResponse) ? existingResponse : [];
      const owned = existing.filter((event) => String(event?.external_id || "").startsWith(PLAN_PREFIX));
      const existingByExternalId = new Map(owned.map((event) => [String(event.external_id), event]));

      const events = plan.map((item) => {
        const externalId = `${PLAN_PREFIX}${String(item.id || "")}`;
        return planEvent(item, existingByExternalId.get(externalId)?.id);
      });
      const desiredIds = new Set(events.map((event) => String(event.external_id)));

      let uploaded: unknown[] = [];
      if (events.length) {
        const result = await intervalsRequest(`/athlete/${athleteId}/events/bulk?upsert=true`, apiKey, {
          method: "POST",
          body: JSON.stringify(events),
        });
        uploaded = Array.isArray(result) ? result : [];
      }

      const stale = owned.filter((event) => !desiredIds.has(String(event.external_id || "")));
      let deleted = 0;
      if (stale.length) {
        const result = await intervalsRequest(`/athlete/${athleteId}/events/bulk-delete`, apiKey, {
          method: "PUT",
          body: JSON.stringify(stale.map((event) => ({ id: event.id, external_id: event.external_id }))),
        });
        deleted = Number(result || 0);
      }

      const guided = events.filter((event) => event.category === "WORKOUT").length;
      return json({
        connected: true,
        publishedAt: new Date().toISOString(),
        weekStart,
        weekEnd,
        uploaded: uploaded.length || events.length,
        deleted,
        guided,
        notes: events.length - guided,
        events: uploaded.map((event) => ({ id: event.id, externalId: event.external_id, category: event.category })),
      });
    }

    return json({ message: "Unbekannte Intervals.icu-Aktion." }, 400);
  } catch (error) {
    console.error(error);
    return json({ message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
