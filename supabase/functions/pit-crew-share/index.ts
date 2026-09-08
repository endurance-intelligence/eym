import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,90}$/;
const MAX_JSON_BYTES = 180_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
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
  const accessJwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!accessJwt) return null;
  const { data, error } = await admin.auth.getUser(accessJwt);
  return error ? null : data.user;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tokenHash(token: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  const serialized = JSON.stringify(object);
  if (new TextEncoder().encode(serialized).length > MAX_JSON_BYTES) throw new Error("Crew-Session ist zu groß zum Synchronisieren.");
  return JSON.parse(serialized);
}

function cleanRaceKey(value: unknown) {
  return String(value || "").trim().slice(0, 240);
}

function expired(value: unknown) {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function eventExpiryFloor(race: Record<string, unknown>) {
  const date = String(race?.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const eventEnd = new Date(`${date}T23:59:59Z`).getTime();
  return Number.isFinite(eventEnd) ? eventEnd + 14 * DAY_MS : 0;
}

function initialExpiry(race: Record<string, unknown>, now = Date.now()) {
  return Math.max(now + 45 * DAY_MS, eventExpiryFloor(race));
}

function refreshedExpiry(row: { race?: Record<string, unknown>; expires_at?: unknown }, now = Date.now()) {
  const current = new Date(String(row?.expires_at || "")).getTime();
  return new Date(Math.max(Number.isFinite(current) ? current : 0, now + 7 * DAY_MS, eventExpiryFloor(row?.race || {}))).toISOString();
}

async function shareByToken(admin: ReturnType<typeof adminClient>, token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = await tokenHash(token);
  const { data, error } = await admin
    .from("pit_crew_shares")
    .select("id,race,state,revision,expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (!data || expired(data.expires_at)) return null;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, message: "Nur POST wird unterstützt." }, 405);

  try {
    const payload = await request.json().catch(() => ({}));
    const action = String(payload?.action || "");
    const admin = adminClient();

    if (action === "create") {
      const user = await authenticatedUser(request, admin);
      if (!user) return json({ ok: false, message: "Für das Erstellen eines Crew-Links musst du in EI angemeldet sein." }, 401);
      const raceKey = cleanRaceKey(payload?.raceKey);
      if (!raceKey) return json({ ok: false, message: "Rennen konnte für den Crew-Link nicht zugeordnet werden." }, 400);
      const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const hash = await tokenHash(token);
      const race = safeJsonObject(payload?.race);
      const state = safeJsonObject(payload?.state);
      const expiresAt = new Date(initialExpiry(race)).toISOString();
      const { data, error } = await admin
        .from("pit_crew_shares")
        .upsert({
          owner_user_id: user.id,
          race_key: raceKey,
          token_hash: hash,
          race,
          state,
          revision: 1,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "owner_user_id,race_key" })
        .select("revision,expires_at")
        .single();
      if (error) throw error;
      return json({ ok: true, token, revision: data.revision, expiresAt: data.expires_at });
    }

    if (action === "get") {
      const row = await shareByToken(admin, String(payload?.token || ""));
      if (!row) return json({ ok: false, message: "Crew-Link ist ungültig oder abgelaufen." }, 404);
      return json({ ok: true, race: row.race || {}, state: row.state || {}, revision: row.revision || 0, expiresAt: row.expires_at });
    }

    if (action === "update") {
      const token = String(payload?.token || "");
      const row = await shareByToken(admin, token);
      if (!row) return json({ ok: false, message: "Crew-Link ist ungültig oder abgelaufen." }, 404);
      const state = safeJsonObject(payload?.state);
      const revision = Number(row.revision || 0) + 1;
      const expiresAt = refreshedExpiry(row);
      const { data, error } = await admin
        .from("pit_crew_shares")
        .update({ state, revision, expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("state,revision,expires_at")
        .single();
      if (error) throw error;
      return json({ ok: true, state: data.state || {}, revision: data.revision || revision, expiresAt: data.expires_at });
    }

    return json({ ok: false, message: "Unbekannte Pit-Crew-Aktion." }, 400);
  } catch (error) {
    console.error("pit-crew-share failed", error);
    return json({ ok: false, message: error instanceof Error ? error.message : "Pit-Crew-Synchronisierung fehlgeschlagen." }, 500);
  }
});
