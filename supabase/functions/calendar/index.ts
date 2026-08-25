import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();
const FEED_VERSION = "3.9.102";

function escapeIcs(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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

function isoDateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateForWeekday(dayName: unknown, now = new Date()) {
  const names = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const target = names.indexOf(String(dayName || ""));
  if (target < 0) return "";
  const monday = new Date(now);
  const day = monday.getDay() || 7;
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - day + 1 + (target === 0 ? 6 : Math.max(0, target - 1)));
  return isoDateLocal(monday);
}

function eventDate(item: Record<string, unknown>) {
  const direct = String(item.date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return dateForWeekday(item.day);
}

function calendarSequence(updatedAt: unknown) {
  const value = new Date(String(updatedAt || ""));
  if (Number.isNaN(value.getTime())) return 0;
  const epoch = Date.UTC(2020, 0, 1);
  return Math.max(0, Math.floor((value.getTime() - epoch) / 60000));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function calendarUid(item: Record<string, unknown>, rawDate: string) {
  const explicit = String(item.id || "").trim();
  if (explicit) return explicit;
  const seed = [rawDate, item.type, item.title, item.distance, item.day].map((value) => String(value || "")).join("|");
  return `plan-${stableHash(seed)}`;
}

function foldIcsLine(line: string) {
  if (encoder.encode(line).length <= 75) return line;
  const output: string[] = [];
  let current = "";
  for (const character of line) {
    const candidate = `${current}${character}`;
    if (encoder.encode(candidate).length > 75 && current) {
      output.push(current);
      current = ` ${character}`;
    } else {
      current = candidate;
    }
  }
  if (current) output.push(current);
  return output.join("\r\n");
}

function serializeCalendar(lines: string[]) {
  return `${lines.join("\r\n").split("\r\n").map(foldIcsLine).join("\r\n")}\r\n`;
}

function timedDateValue(date: unknown, time: unknown) {
  const rawDate = String(date || "");
  const rawTime = String(time || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !/^\d{2}:\d{2}$/.test(rawTime)) return "";
  return `${dateValue(rawDate)}T${rawTime.replace(":", "")}00`;
}

function raceProtocolCalendarEvents(item: Record<string, unknown>, stamp: string, sequence: number) {
  const protocol = item.raceProtocol && typeof item.raceProtocol === "object"
    ? item.raceProtocol as Record<string, unknown>
    : null;
  const reminders = Array.isArray(protocol?.calendarItems) ? protocol?.calendarItems as Record<string, unknown>[] : [];
  if (!item.raceEvent || !protocol?.calendarReminders || !reminders.length) return [];
  const baseUid = calendarUid(item, String(item.date || "race"));
  return reminders.flatMap((reminder) => {
    const start = timedDateValue(item.date, reminder.time);
    if (!start) return [];
    return [[
      "BEGIN:VEVENT",
      `UID:${escapeIcs(`${baseUid}-${reminder.key || "reminder"}`)}@endurance-intelligence`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${start}`,
      "DURATION:PT15M",
      `SUMMARY:${escapeIcs(reminder.title || "Race Protocol")}`,
      `DESCRIPTION:${escapeIcs(`${item.title || "Wettkampf"} · ${reminder.detail || "Race Protocol"}`)}`,
      "STATUS:CONFIRMED",
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
  if (item.raceEvent || /wettkampf|race|marathon/.test(text)) return "🏁";
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

function buildCalendar(plan: Record<string, unknown>[], updatedAt: unknown = null) {
  const modified = new Date(String(updatedAt || ""));
  const stamp = utcStamp(Number.isNaN(modified.getTime()) ? new Date() : modified);
  const sequence = calendarSequence(updatedAt);
  const events = plan
    .filter((item) => isCalendarItemVisible(item))
    .flatMap((item) => {
      const rawDate = eventDate(item);
      if (!rawDate) return [];
      const description = [
        item.type,
        item.distance ? `${item.distance} km` : "",
        item.optional ? "Optional" : "Pflicht",
        item.notes || "",
      ].filter(Boolean).join(" · ");
      const mainEvent = [
        "BEGIN:VEVENT",
        `UID:${escapeIcs(calendarUid(item, rawDate))}@endurance-intelligence`,
        `DTSTAMP:${stamp}`,
        `LAST-MODIFIED:${stamp}`,
        `SEQUENCE:${sequence}`,
        `DTSTART;VALUE=DATE:${dateValue(rawDate)}`,
        `DTEND;VALUE=DATE:${nextDateValue(rawDate)}`,
        `SUMMARY:${escapeIcs(calendarSummary(item))}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
      return [mainEvent, ...raceProtocolCalendarEvents({ ...item, date: rawDate }, stamp, sequence)];
    });

  return serializeCalendar([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Endurance Intelligence//Training Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "NAME:Endurance Intelligence",
    "X-WR-CALNAME:Endurance Intelligence",
    "X-WR-CALDESC:Adaptive Trainingsplanung von Endurance Intelligence",
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-WR-REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    ...events,
    "END:VCALENDAR",
  ]);
}

function responseHeaders(updatedAt: unknown, generatedAt: string) {
  const lastModifiedDate = new Date(String(updatedAt || ""));
  const lastModified = Number.isNaN(lastModifiedDate.getTime()) ? new Date(generatedAt).toUTCString() : lastModifiedDate.toUTCString();
  const versionKey = String(updatedAt || generatedAt).replace(/[^0-9A-Za-z]/g, "");
  return {
    ...headers,
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="endurance-intelligence.ics"',
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Last-Modified": lastModified,
    "ETag": `"ei-${versionKey}"`,
    "X-Content-Type-Options": "nosniff",
    "X-EI-Calendar-Version": FEED_VERSION,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", { status: 405, headers: { ...headers, Allow: "GET, HEAD, OPTIONS" } });
  }

  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");
  if (!token) return new Response("Kalender-Token fehlt.", { status: 400, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await client
    .from("athlete_data")
    .select("app_data, updated_at")
    .eq("calendar_token", token)
    .maybeSingle();

  if (error || !data) return new Response("Kalender nicht gefunden.", { status: 404, headers });

  const plan = Array.isArray(data.app_data?.plan) ? data.app_data.plan : [];
  const content = buildCalendar(plan, data.updated_at);
  const eventCount = (content.match(/BEGIN:VEVENT/g) || []).length;
  const generatedAt = new Date().toISOString();
  const feedHeaders = responseHeaders(data.updated_at, generatedAt);

  if (requestUrl.searchParams.get("status") === "1") {
    const sampleEvents = plan
      .filter((item: Record<string, unknown>) => isCalendarItemVisible(item))
      .map((item: Record<string, unknown>) => ({ date: eventDate(item), title: calendarSummary(item) }))
      .filter((item: { date: string; title: string }) => item.date)
      .sort((left: { date: string }, right: { date: string }) => left.date.localeCompare(right.date))
      .slice(0, 5);
    return new Response(request.method === "HEAD" ? null : JSON.stringify({
      ok: true,
      feedVersion: FEED_VERSION,
      feedPath: requestUrl.pathname,
      planCount: plan.length,
      eventCount,
      updatedAt: data.updated_at || null,
      generatedAt,
      sampleEvents,
    }), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
    });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === feedHeaders.ETag) {
    return new Response(null, { status: 304, headers: feedHeaders });
  }

  return new Response(request.method === "HEAD" ? null : content, {
    status: 200,
    headers: feedHeaders,
  });
});
