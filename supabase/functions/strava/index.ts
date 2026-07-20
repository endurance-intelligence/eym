import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ist in Supabase nicht gesetzt.`);
  return value;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string) {
  const secret = requiredSecret("STRAVA_STATE_SECRET");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

async function createState(userId: string) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + 900}.${crypto.randomUUID()}`;
  const encoded = base64Url(new TextEncoder().encode(payload));
  return `${encoded}.${await hmac(encoded)}`;
}

async function verifyState(state: string, userId: string) {
  const [encoded, signature] = String(state || "").split(".");
  if (!encoded || !signature || signature !== await hmac(encoded)) return false;
  const payload = new TextDecoder().decode(fromBase64Url(encoded));
  const [stateUserId, expiresAt] = payload.split(".");
  return stateUserId === userId && Number(expiresAt) > Math.floor(Date.now() / 1000);
}

async function stravaTokenRequest(parameters: Record<string, string>) {
  const response = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Strava Token-Austausch fehlgeschlagen.");
  return data;
}

async function stravaGet(path: string, accessToken: string) {
  const response = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `Strava-Anfrage ${path} fehlgeschlagen.`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data;
}

function streamData(streamSet: unknown, key: string): number[] {
  if (streamSet && typeof streamSet === "object" && !Array.isArray(streamSet)) {
    const candidate = (streamSet as Record<string, { data?: unknown }>)[key]?.data;
    return Array.isArray(candidate) ? candidate.map(Number).filter(Number.isFinite) : [];
  }
  if (Array.isArray(streamSet)) {
    const candidate = streamSet.find((stream) => stream?.type === key)?.data;
    return Array.isArray(candidate) ? candidate.map(Number).filter(Number.isFinite) : [];
  }
  return [];
}

function calculateHeartRateZones(streamSet: unknown, athleteZones: unknown) {
  const ranges = (athleteZones as { heart_rate?: { zones?: Array<{ min?: number; max?: number }> } })?.heart_rate?.zones;
  const times = streamData(streamSet, "time");
  const heartRates = streamData(streamSet, "heartrate");
  if (!Array.isArray(ranges) || ranges.length === 0 || times.length === 0 || heartRates.length === 0) return null;

  const length = Math.min(times.length, heartRates.length);
  const buckets = ranges.map((range, index) => ({
    zone: index + 1,
    min: Number(range.min || 0),
    max: Number(range.max ?? -1),
    seconds: 0,
  }));

  for (let index = 0; index < length; index += 1) {
    const heartRate = heartRates[index];
    const nextTime = index + 1 < length ? times[index + 1] : times[index] + 1;
    const seconds = Math.max(1, Math.min(30, nextTime - times[index]));
    const bucket = buckets.find((range) => heartRate >= range.min && (range.max < 0 || heartRate < range.max));
    if (bucket) bucket.seconds += seconds;
  }

  const totalSeconds = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  if (!totalSeconds) return null;
  return {
    source: "strava-streams",
    customZones: Boolean((athleteZones as { heart_rate?: { custom_zones?: boolean } })?.heart_rate?.custom_zones),
    totalSeconds,
    zones: buckets.map((bucket) => ({
      ...bucket,
      percentage: Number(((bucket.seconds / totalSeconds) * 100).toFixed(1)),
    })),
  };
}

async function enrichHeartRateZones(activities: unknown[], accessToken: string) {
  let athleteZones: unknown = null;
  try {
    athleteZones = await stravaGet("/athlete/zones", accessToken);
  } catch (error) {
    console.warn("Athlete zones unavailable. Reconnect with profile:read_all if needed.", error);
    return activities;
  }

  const enriched = [...activities] as Array<Record<string, unknown>>;
  const candidates = enriched
    .map((activity, index) => ({ activity, index }))
    .filter(({ activity }) => Boolean(activity.has_heartrate) && activity.id)
    .slice(0, 20);

  for (const { activity, index } of candidates) {
    try {
      const streamSet = await stravaGet(`/activities/${activity.id}/streams?keys=time,heartrate&key_by_type=true`, accessToken);
      const heartRateZones = calculateHeartRateZones(streamSet, athleteZones);
      if (heartRateZones) enriched[index] = { ...activity, heart_rate_zones: heartRateZones };
    } catch (error) {
      console.warn(`Heart-rate streams unavailable for activity ${activity.id}.`, error);
    }
  }
  return enriched;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Nur POST ist erlaubt." }, 405);

  try {
    const supabaseUrl = requiredSecret("SUPABASE_URL");
    const serviceRole = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const authorization = request.headers.get("Authorization") || "";
    const accessJwt = authorization.replace(/^Bearer\s+/i, "");
    if (!accessJwt) return json({ message: "Nicht angemeldet." }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(accessJwt);
    if (authError || !authData.user) return json({ message: "Sitzung ist ungültig oder abgelaufen." }, 401);
    const user = authData.user;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");
    const clientId = requiredSecret("STRAVA_CLIENT_ID");
    const clientSecret = requiredSecret("STRAVA_CLIENT_SECRET");

    if (action === "start") {
      const redirectUri = String(body.redirectUri || "");
      const productionRedirect = "https://endurance-intelligence.github.io/eym/";
      const isLocalRedirect = redirectUri.startsWith("http://localhost:") || redirectUri.startsWith("http://127.0.0.1:");
      if (!redirectUri.startsWith(productionRedirect) && !isLocalRedirect) {
        return json({ message: "Diese Redirect-Adresse ist nicht erlaubt." }, 400);
      }
      const state = await createState(user.id);
      const parameters = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        approval_prompt: body.force ? "force" : "auto",
        scope: "read,activity:read_all,profile:read_all",
        state,
      });
      return json({ url: `https://www.strava.com/oauth/authorize?${parameters}` });
    }

    if (action === "exchange") {
      const code = String(body.code || "");
      const state = String(body.state || "");
      const redirectUri = String(body.redirectUri || "");
      if (!code || !await verifyState(state, user.id)) return json({ message: "Strava-Anmeldung konnte nicht sicher bestätigt werden." }, 400);
      const tokenData = await stravaTokenRequest({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      });
      const { error } = await admin.from("strava_connections").upsert({
        user_id: user.id,
        athlete: tokenData.athlete || null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return json({ connected: true, athlete: tokenData.athlete || null });
    }

    const { data: connection, error: connectionError } = await admin
      .from("strava_connections")
      .select("athlete, access_token, refresh_token, expires_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionError) throw connectionError;

    if (action === "status") {
      return json({ connected: Boolean(connection), athlete: connection?.athlete || null, updatedAt: connection?.updated_at || null });
    }

    if (!connection) return json({ message: "Strava ist noch nicht verbunden." }, 404);

    if (action === "disconnect") {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.access_token}` },
      }).catch(() => null);
      const { error } = await admin.from("strava_connections").delete().eq("user_id", user.id);
      if (error) throw error;
      return json({ connected: false });
    }

    if (action === "sync") {
      let activeConnection = connection;
      if (Number(connection.expires_at || 0) <= Math.floor(Date.now() / 1000) + 120) {
        const refreshed = await stravaTokenRequest({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refresh_token,
          grant_type: "refresh_token",
        });
        activeConnection = {
          ...connection,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        };
        const { error } = await admin.from("strava_connections").update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        if (error) throw error;
      }

      const afterDate = String(body.after || "2025-01-01");
      const after = Math.max(0, Math.floor(new Date(`${afterDate}T00:00:00Z`).getTime() / 1000));
      const activities: unknown[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const url = new URL("https://www.strava.com/api/v3/athlete/activities");
        url.searchParams.set("after", String(after));
        url.searchParams.set("page", String(page));
        url.searchParams.set("per_page", "200");
        const response = await fetch(url, { headers: { Authorization: `Bearer ${activeConnection.access_token}` } });
        const pageData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(pageData?.message || "Strava-Aktivitäten konnten nicht geladen werden.");
        if (!Array.isArray(pageData)) break;
        activities.push(...pageData);
        if (pageData.length < 200) break;
      }
      const enrichedActivities = await enrichHeartRateZones(activities, activeConnection.access_token);
      await admin.from("strava_connections").update({ updated_at: new Date().toISOString() }).eq("user_id", user.id);
      return json({ activities: enrichedActivities, athlete: activeConnection.athlete || null, syncedAt: new Date().toISOString() });
    }

    return json({ message: "Unbekannte Strava-Aktion." }, 400);
  } catch (error) {
    console.error(error);
    return json({ message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
