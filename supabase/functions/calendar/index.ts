import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeIcs(value: unknown) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateValue(raw: unknown) {
  return String(raw || "").replaceAll("-", "");
}

function nextDateValue(raw: unknown) {
  const date = new Date(`${String(raw)}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}


function timedDateValue(date: unknown, time: unknown) {
  const rawDate = String(date || "");
  const rawTime = String(time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !/^\d{2}:\d{2}$/.test(rawTime)) return "";
  return `${dateValue(rawDate)}T${rawTime.replace(":", "")}00`;
}

function raceProtocolCalendarEvents(item: Record<string, unknown>, stamp: string) {
  const protocol = item.raceProtocol && typeof item.raceProtocol === "object"
    ? item.raceProtocol as Record<string, unknown>
    : null;
  const reminders = Array.isArray(protocol?.calendarItems) ? protocol?.calendarItems as Record<string, unknown>[] : [];
  if (!item.raceEvent || !protocol?.calendarReminders || !reminders.length) return [];
  return reminders.flatMap((reminder) => {
    const start = timedDateValue(item.date, reminder.time);
    if (!start) return [];
    return [[
      "BEGIN:VEVENT",
      `UID:${escapeIcs(`${item.id || "race"}-${reminder.key || "reminder"}`)}@endurance-intelligence`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      "DURATION:PT15M",
      `SUMMARY:${escapeIcs(reminder.title || "Race Protocol")}`,
      `DESCRIPTION:${escapeIcs(`${item.title || "Wettkampf"} · ${reminder.detail || "Race Protocol"}`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ].join("\r\n")];
  });
}

function containsDistance(title: unknown, distance: number) {
  if (!distance) return true;
  const normalized = String(title || "").replace(",", ".").toLowerCase();
  const variants = [distance.toFixed(0), distance.toFixed(1)].map((value) => value.replace(".0", ""));
  return variants.some((value) => new RegExp(`(^|\\s)${value.replace(".", "[.,]")}\\s*km`, "i").test(normalized));
}

function calendarIcon(item: Record<string, unknown>) {
  const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  if (item.choicePending || /samstagsoption|oder/.test(text)) return "🔀";
  if (item.fixed || /fußball|football|soccer|orc run|orc track/.test(text)) return "📍";
  if (/long run|longrun|backyard|intervall|schwelle|threshold|tempo/.test(text)) return "🔑";
  if (/recovery|regeneration/.test(text)) return "🔵";
  if (/laufband|treadmill/.test(text)) return "🏠";
  if (/rad|ride|bike|cycling/.test(text)) return "🚴";
  if (/stabi|mobility|mobilität|kraft/.test(text)) return "💪";
  if (/rudern|row/.test(text)) return "🚣";
  if (/ruhetag|rest/.test(text)) return "💤";
  return "🟢";
}

function isCalendarItemVisible(item: Record<string, unknown>) {
  if (item.archived) return false;
  const missedMeta = item.missedMeta && typeof item.missedMeta === "object"
    ? item.missedMeta as Record<string, unknown>
    : {};
  return !item.missedReason
    && !item.plannedCancellation
    && !item.cancelledAt
    && !missedMeta.plannedCancellation;
}

function calendarSummary(item: Record<string, unknown>) {
  const distance = Number(item.distance || 0);
  let title = String(item.title || item.type || "Training").trim();
  const text = `${item.type || ""} ${title}`.toLowerCase();
  if (item.optional && /easy run|locker/.test(text) && !/recovery|regeneration/.test(text)) {
    title = title.replace(/locker/i, "Recovery");
    if (!/recovery/i.test(title)) title = "Recovery";
  }
  if (distance > 0 && !containsDistance(title, distance)) {
    title = `${Number.isInteger(distance) ? distance : distance.toFixed(1)} km ${title}`;
  }
  if (item.optional && !/^optional:/i.test(title)) title = `Optional: ${title}`;
  return `${calendarIcon(item)} ${title}`;
}

function buildCalendar(plan: Record<string, unknown>[]) {
  const stamp = utcStamp();
  const events = plan
    .filter((item) => isCalendarItemVisible(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))
    .flatMap((item) => {
      const description = [
        item.type,
        item.distance ? `${item.distance} km` : "",
        item.optional ? "Optional" : "Pflicht",
        item.notes || "",
      ].filter(Boolean).join(" · ");
      const mainEvent = [
        "BEGIN:VEVENT",
        `UID:${escapeIcs(item.id || crypto.randomUUID())}@endurance-intelligence`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateValue(item.date)}`,
        `DTEND;VALUE=DATE:${nextDateValue(item.date)}`,
        `SUMMARY:${escapeIcs(calendarSummary(item))}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
      return [mainEvent, ...raceProtocolCalendarEvents(item, stamp)];
    });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Endurance Intelligence//Training Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Endurance Intelligence",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Kalender-Token fehlt.", { status: 400, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await client
    .from("athlete_data")
    .select("app_data")
    .eq("calendar_token", token)
    .maybeSingle();

  if (error || !data) return new Response("Kalender nicht gefunden.", { status: 404, headers });

  const plan = Array.isArray(data.app_data?.plan) ? data.app_data.plan : [];
  return new Response(buildCalendar(plan), {
    headers: {
      ...headers,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="endurance-intelligence.ics"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
});
