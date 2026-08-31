import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canUseLegacyIntervalsConnection } from "../_shared/intervalsAccess.ts";
import { decryptIntervalsApiKey, encryptIntervalsApiKey } from "../_shared/intervalsCredentials.ts";
import {
  intervalsStorageMessage,
  readableIntervalsError,
} from "../_shared/intervalsErrors.ts";
import { intervalsRoutePayload } from "../_shared/intervalsRoute.ts";
import {
  intervalDescription,
  intervalsWorkoutType,
  isGuidedPlanItem,
  isProvisionalTrackPlanItem,
} from "../_shared/structuredWorkout.ts";
import { intervalsStartDateLocal } from "../_shared/plannerTiming.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const PLAN_PREFIX = "endurance-intelligence:";
const RACE_PREFIX = "endurance-intelligence:race:";
const MAX_RACE_WORKOUT_STEPS = 50;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ist in Supabase nicht gesetzt.`);
  return value;
}

async function authenticatedContext(request: Request) {
  const supabaseUrl = requiredSecret("SUPABASE_URL");
  const serviceRole = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const authorization = request.headers.get("Authorization") || "";
  const accessJwt = authorization.replace(/^Bearer\s+/i, "");
  if (!accessJwt) return null;
  const { data, error } = await admin.auth.getUser(accessJwt);
  if (error || !data.user) return null;
  return { admin, user: data.user };
}

function intervalsAuthorization(apiKey: string) {
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`;
}

class IntervalsRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IntervalsRequestError";
    this.status = status;
  }
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
    const message = readableIntervalsError(data?.error ?? data?.message, "");
    throw new IntervalsRequestError(
      message || `Intervals.icu-Anfrage fehlgeschlagen (${response.status}).`,
      response.status,
    );
  }
  return data;
}

function intervalsGet(path: string, apiKey: string) {
  return intervalsRequest(path, apiKey);
}

function connectionErrorMessage(error: unknown) {
  if (error instanceof IntervalsRequestError && [401, 403].includes(error.status)) {
    return "Intervals.icu hat den API-Key nicht akzeptiert. Kopiere ihn unter Settings → Developer Settings bitte erneut.";
  }
  return readableIntervalsError(error);
}

function verificationQuery() {
  const newestDate = new Date();
  newestDate.setDate(newestDate.getDate() + 1);
  const oldestDate = new Date();
  oldestDate.setDate(oldestDate.getDate() - 30);
  return new URLSearchParams({
    oldest: oldestDate.toISOString().slice(0, 10),
    newest: newestDate.toISOString().slice(0, 10),
    limit: "1",
  });
}

async function verifyConnection(apiKey: string, athleteId = "0") {
  const latest = await intervalsGet(
    `/athlete/${encodeURIComponent(athleteId)}/activities?${verificationQuery().toString()}`,
    apiKey,
  );
  if (!Array.isArray(latest)) throw new Error("Intervals.icu hat keine gültige Aktivitätsliste geliefert.");
  return latest;
}

async function personalConnection(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data, error } = await admin
    .from("intervals_connections")
    .select("api_key_ciphertext, athlete_id, connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return {
      connection: null,
      storageReady: false,
      hasStoredConnection: false,
      issue: {
        kind: "storage",
        message: intervalsStorageMessage(error, "read"),
      },
    };
  }
  if (!data?.api_key_ciphertext) {
    return {
      connection: null,
      storageReady: true,
      hasStoredConnection: false,
      issue: null,
    };
  }

  const credentialSecret = Deno.env.get("INTERVALS_CREDENTIALS_KEY") || "";
  if (!credentialSecret) {
    return {
      connection: null,
      storageReady: true,
      hasStoredConnection: true,
      issue: {
        kind: "secret",
        message: "Das Supabase-Secret INTERVALS_CREDENTIALS_KEY fehlt. Setze das bestehende Secret wieder und deploye die Funktion „intervals“ erneut.",
      },
    };
  }

  let apiKey: string;
  try {
    apiKey = await decryptIntervalsApiKey(data.api_key_ciphertext, credentialSecret);
  } catch {
    return {
      connection: null,
      storageReady: true,
      hasStoredConnection: true,
      issue: {
        kind: "decrypt",
        message: "Der gespeicherte persönliche API-Key kann mit dem aktuellen Supabase-Secret nicht gelesen werden. Speichere deinen Intervals.icu API-Key hier erneut.",
      },
    };
  }

  return {
    storageReady: true,
    hasStoredConnection: true,
    issue: null,
    connection: {
      apiKey,
      athleteId: String(data.athlete_id || "0"),
      mode: "personal",
      connectedAt: data.connected_at || null,
    },
  };
}

async function connectionForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const personal = await personalConnection(admin, userId);
  if (personal.connection) return personal;

  const ownerUserId = Deno.env.get("INTERVALS_OWNER_USER_ID") || "";
  const legacyApiKey = Deno.env.get("INTERVALS_API_KEY") || "";
  if (canUseLegacyIntervalsConnection(userId, ownerUserId, legacyApiKey)) {
    return {
      storageReady: personal.storageReady,
      hasStoredConnection: personal.hasStoredConnection,
      issue: personal.issue,
      connection: {
        apiKey: legacyApiKey,
        athleteId: Deno.env.get("INTERVALS_ATHLETE_ID") || "0",
        mode: "legacy",
        connectedAt: null,
      },
    };
  }
  return personal;
}

function validDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validTime(value: unknown) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function safeMinutes(value: unknown, fallback = 60) {
  const parsed = Math.round(Number(value || fallback));
  return Math.max(1, Math.min(24 * 60, Number.isFinite(parsed) ? parsed : fallback));
}

function safeRaceText(value: unknown, fallback = "") {
  const text = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 120);
}

function safeRaceKey(value: unknown) {
  const key = safeRaceText(value, "race-strategy")
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return key || "race-strategy";
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function racePaceText(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function raceDistanceToken(distanceM: number) {
  const meters = Math.max(1, Math.round(distanceM));
  if (Math.abs(meters - 1000) <= 10) return "1km";
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}km`;
  return `${meters}mtr`;
}

function normalizedRaceWorkout(input: unknown) {
  const workout = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const publishDate = String(workout.publishDate || "");
  if (!validDate(publishDate)) throw new Error("Bitte einen gültigen Garmin-Sync-Tag wählen.");

  const rawSteps = Array.isArray(workout.steps) ? workout.steps : [];
  if (!rawSteps.length) throw new Error("Für den Garmin-Sync fehlen gültige Pace-Schritte.");
  if (rawSteps.length > MAX_RACE_WORKOUT_STEPS) {
    throw new Error(`Garmin erlaubt maximal ${MAX_RACE_WORKOUT_STEPS} Schritte pro Workout. Dieser Plan hat ${rawSteps.length}.`);
  }

  const tolerance = boundedInteger(workout.paceToleranceSeconds, 1, 30, 10);
  const steps = rawSteps.map((raw, index) => {
    const step = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const distanceM = boundedInteger(step.distanceM, 20, 100000, 0);
    const paceSecondsPerKm = boundedInteger(step.paceSecondsPerKm, 120, 1200, 0);
    if (!(distanceM > 0) || !(paceSecondsPerKm > 0)) {
      throw new Error(`Garmin-Schritt ${index + 1} ist ungültig.`);
    }
    return { distanceM, paceSecondsPerKm };
  });

  const targetDuration = Number(workout.targetDurationMinutes);
  return {
    raceKey: safeRaceKey(workout.raceKey),
    raceName: safeRaceText(workout.raceName, "EI Race Strategy"),
    publishDate,
    publishTime: validTime(workout.publishTime) ? String(workout.publishTime) : "12:00",
    targetDurationMinutes: Number.isFinite(targetDuration) ? Math.max(0.1, Math.min(24 * 60 * 7, targetDuration)) : 0.1,
    paceToleranceSeconds: tolerance,
    steps,
  };
}

function raceWorkoutDescription(workout: ReturnType<typeof normalizedRaceWorkout>) {
  const lines = ["Race Strategy"];
  workout.steps.forEach((step, index) => {
    const fast = Math.max(120, step.paceSecondsPerKm - workout.paceToleranceSeconds);
    const slow = Math.min(1200, step.paceSecondsPerKm + workout.paceToleranceSeconds);
    const partial = Math.abs(step.distanceM - 1000) > 20;
    const label = partial ? `KM ${index + 1} · ${(step.distanceM / 1000).toFixed(2)} km` : `KM ${index + 1}`;
    lines.push("", label, `- ${raceDistanceToken(step.distanceM)} ${racePaceText(fast)}-${racePaceText(slow)}/km Pace intensity=active`);
  });
  return lines.join("\n");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function verifyPublishedRaceWorkout({
  athleteId,
  apiKey,
  workout,
  externalId,
}: {
  athleteId: string;
  apiKey: string;
  workout: ReturnType<typeof normalizedRaceWorkout>;
  externalId: string;
}) {
  const query = new URLSearchParams({ oldest: workout.publishDate, newest: workout.publishDate });
  let candidate: Record<string, unknown> | null = null;

  for (const delay of [0, 250, 700]) {
    if (delay) await wait(delay);
    const response = await intervalsGet(`/athlete/${athleteId}/events?${query.toString()}`, apiKey);
    const events = Array.isArray(response) ? response : [];
    candidate = events.find((event) => String(event?.external_id || "") === externalId) || null;
    if (candidate) break;
  }

  if (!candidate) {
    throw new Error("Intervals.icu hat die Race Strategy nach dem Speichern nicht zurückgeliefert. Der Garmin-Sync wurde deshalb nicht als erfolgreich markiert.");
  }

  const category = String(candidate.category || "").toUpperCase();
  const type = String(candidate.type || "");
  const description = String(candidate.description || "");
  const stepCount = (description.match(/intensity=active/g) || []).length;
  if (category !== "WORKOUT" || type.toLowerCase() !== "run" || stepCount < workout.steps.length) {
    throw new Error(`Race Strategy wurde in Intervals.icu nicht als vollständiges Run-Workout erkannt (${category || "ohne Kategorie"} · ${type || "ohne Sportart"} · ${stepCount}/${workout.steps.length} Schritte).`);
  }

  return candidate;
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
      type: intervalsWorkoutType(item),
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
    const authentication = await authenticatedContext(request);
    if (!authentication) return json({ message: "Nicht angemeldet." }, 401);
    const { admin, user } = authentication;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    if (action === "connect") {
      const apiKey = String(body.apiKey || "").trim();
      if (apiKey.length < 12 || apiKey.length > 500) {
        return json({ message: "Bitte füge den vollständigen Intervals.icu API-Key ein." }, 400);
      }
      let latest: unknown[];
      try {
        latest = await verifyConnection(apiKey);
      } catch (error) {
        return json({ message: connectionErrorMessage(error) }, 400);
      }
      const ciphertext = await encryptIntervalsApiKey(
        apiKey,
        requiredSecret("INTERVALS_CREDENTIALS_KEY"),
      );
      const now = new Date().toISOString();
      const { data: savedConnection, error } = await admin
        .from("intervals_connections")
        .upsert({
          user_id: user.id,
          api_key_ciphertext: ciphertext,
          athlete_id: "0",
          connected_at: now,
          last_verified_at: now,
        }, { onConflict: "user_id" })
        .select("api_key_ciphertext, athlete_id, connected_at")
        .single();
      if (error) return json({ message: intervalsStorageMessage(error, "save") }, 503);
      try {
        const restoredApiKey = await decryptIntervalsApiKey(
          String(savedConnection?.api_key_ciphertext || ""),
          requiredSecret("INTERVALS_CREDENTIALS_KEY"),
        );
        if (restoredApiKey !== apiKey) throw new Error("Der gespeicherte API-Key stimmt nicht mit dem geprüften Schlüssel überein.");
      } catch {
        return json({
          message: "Der API-Key wurde von Intervals.icu akzeptiert und gespeichert, konnte bei der anschließenden Sicherheitsprüfung aber nicht wieder gelesen werden. Prüfe, ob INTERVALS_CREDENTIALS_KEY unverändert gesetzt ist, und speichere den API-Key danach erneut.",
        }, 500);
      }
      return json({
        configured: true,
        connected: true,
        connectionMode: "personal",
        activityCount: latest.length,
        connectedAt: now,
      });
    }

    if (action === "disconnect") {
      const { error } = await admin
        .from("intervals_connections")
        .delete()
        .eq("user_id", user.id);
      if (error) return json({ message: intervalsStorageMessage(error, "delete") }, 503);
      return json({ configured: false, connected: false });
    }

    const resolved = await connectionForUser(admin, user.id);
    const connection = resolved.connection;

    if (!connection) {
      const message = resolved.issue?.message || (resolved.storageReady
        ? "Für dieses Konto ist noch keine persönliche Intervals.icu-Verbindung eingerichtet."
        : "Die sichere Intervals.icu-Ablage ist noch nicht installiert.");
      if (action === "status") {
        return json({
          configured: Boolean(resolved.hasStoredConnection),
          connected: false,
          connectionMode: null,
          storageReady: resolved.storageReady,
          credentialIssue: resolved.issue?.kind || null,
          message,
        });
      }
      return json({ message }, resolved.issue ? (resolved.storageReady ? 409 : 503) : 403);
    }

    const apiKey = connection.apiKey;
    const athleteId = encodeURIComponent(connection.athleteId || "0");

    if (action === "status") {
      try {
        const latest = await verifyConnection(apiKey, connection.athleteId);
        if (connection.mode === "personal") {
          await admin
            .from("intervals_connections")
            .update({ last_verified_at: new Date().toISOString() })
            .eq("user_id", user.id);
        }
        return json({
          configured: true,
          connected: true,
          connectionMode: connection.mode,
          connectedAt: connection.connectedAt,
          activityCount: latest.length,
          storageReady: resolved.storageReady,
          credentialIssue: resolved.issue?.kind || null,
          message: connection.mode === "legacy" && resolved.issue
            ? `Intervals.icu ist über deine bisherige Verbindung aktiv. ${resolved.issue.message}`
            : null,
        });
      } catch (error) {
        return json({
          configured: true,
          connected: false,
          connectionMode: connection.mode,
          message: connectionErrorMessage(error),
        });
      }
    }

    if (action === "gear") {
      const gear = await intervalsGet(`/athlete/${athleteId}/gear`, apiKey);
      if (!Array.isArray(gear)) throw new Error("Intervals.icu hat keine gültige Ausrüstungsliste geliefert.");
      return json({ gear, syncedAt: new Date().toISOString() });
    }

    if (action === "activity-route") {
      const activityId = String(body.activityId || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(activityId)) {
        return json({ message: "Ungültige Intervals.icu-Aktivitäts-ID." }, 400);
      }
      const streams = await intervalsGet(
        `/activity/${encodeURIComponent(activityId)}/streams.json?types=latlng,distance,altitude,velocity_smooth,time`,
        apiKey,
      );
      return json({
        activityId,
        ...intervalsRoutePayload(streams),
      });
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

    if (action === "publish-race-workout") {
      const workout = normalizedRaceWorkout(body.workout);
      const externalId = `${RACE_PREFIX}${workout.raceKey}`;
      const forceGarminRefresh = Boolean(body.forceGarminRefresh);
      const existingEventId = body.existingEventId == null ? null : String(body.existingEventId);
      const movingTime = Math.max(1, Math.round(workout.steps.reduce(
        (sum, step) => sum + (step.distanceM / 1000) * step.paceSecondsPerKm,
        0,
      )));
      const event = {
        category: "WORKOUT",
        start_date_local: `${workout.publishDate}T${workout.publishTime}:00`,
        name: workout.raceName,
        type: "Run",
        target: "PACE",
        moving_time: movingTime,
        description: raceWorkoutDescription(workout),
        external_id: externalId,
      };
      let refreshed = 0;
      if (forceGarminRefresh) {
        let refreshEvent: Record<string, unknown> | null = existingEventId
          ? { id: existingEventId, external_id: externalId }
          : null;
        if (!refreshEvent) {
          const query = new URLSearchParams({ oldest: workout.publishDate, newest: workout.publishDate });
          const existingResponse = await intervalsGet(`/athlete/${athleteId}/events?${query.toString()}`, apiKey);
          const existing = Array.isArray(existingResponse) ? existingResponse : [];
          refreshEvent = existing.find((candidate) => String(candidate?.external_id || "") === externalId) || null;
        }
        if (refreshEvent) {
          await intervalsRequest(`/athlete/${athleteId}/events/bulk-delete`, apiKey, {
            method: "PUT",
            body: JSON.stringify([{ id: refreshEvent.id, external_id: externalId }]),
          });
          refreshed = 1;
        }
      }
      const result = await intervalsRequest(`/athlete/${athleteId}/events/bulk?upsert=true`, apiKey, {
        method: "POST",
        body: JSON.stringify([event]),
      });
      const uploaded = Array.isArray(result) ? result[0] : null;
      const verified = await verifyPublishedRaceWorkout({ athleteId, apiKey, workout, externalId });
      return json({
        connected: true,
        verified: true,
        publishedAt: new Date().toISOString(),
        publishDate: workout.publishDate,
        startDateLocal: verified.start_date_local || event.start_date_local,
        stepCount: workout.steps.length,
        targetDurationMinutes: workout.targetDurationMinutes,
        externalId,
        eventId: verified.id || uploaded?.id || null,
        category: verified.category || uploaded?.category || "WORKOUT",
        type: verified.type || "Run",
        refreshed,
      });
    }

    if (action === "publish-plan") {
      const weekStart = String(body.weekStart || "");
      const weekEnd = String(body.weekEnd || "");
      const forceGarminRefresh = Boolean(body.forceGarminRefresh);
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
      const refreshExternalIds = new Set(
        forceGarminRefresh
          ? plan
            .filter((item) => isGuidedPlanItem(item))
            .map((item) => `${PLAN_PREFIX}${String(item.id || "")}`)
          : [],
      );
      const refreshEvents = owned.filter((event) => refreshExternalIds.has(String(event.external_id || "")));

      let refreshed = 0;
      if (refreshEvents.length) {
        await intervalsRequest(`/athlete/${athleteId}/events/bulk-delete`, apiKey, {
          method: "PUT",
          body: JSON.stringify(refreshEvents.map((event) => ({ id: event.id, external_id: event.external_id }))),
        });
        refreshed = refreshEvents.length;
      }

      const existingByExternalId = new Map(
        owned
          .filter((event) => !refreshExternalIds.has(String(event.external_id || "")))
          .map((event) => [String(event.external_id), event]),
      );

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

      const stale = owned.filter((event) => !refreshExternalIds.has(String(event.external_id || "")) && !desiredIds.has(String(event.external_id || "")));
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
        refreshed,
        guided,
        notes: events.length - guided,
        events: uploaded.map((event) => ({ id: event.id, externalId: event.external_id, category: event.category })),
      });
    }

    return json({ message: "Unbekannte Intervals.icu-Aktion." }, 400);
  } catch (error) {
    console.error(error);
    return json({ message: readableIntervalsError(error) }, 500);
  }
});
