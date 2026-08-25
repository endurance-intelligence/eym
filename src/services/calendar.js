function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

const encoder = new TextEncoder();

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function calendarUid(item, rawDate) {
  const explicit = String(item?.id || "").trim();
  if (explicit) return explicit;
  const seed = [rawDate, item?.type, item?.title, item?.distance, item?.day].map((value) => String(value || "")).join("|");
  return `plan-${stableHash(seed)}`;
}

function foldIcsLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const output = [];
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

function serializeCalendar(lines) {
  return `${lines.join("\r\n").split("\r\n").map(foldIcsLine).join("\r\n")}\r\n`;
}

function isoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateForWeekday(dayName) {
  const names = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const target = names.indexOf(dayName);
  const monday = new Date();
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1 + (target === 0 ? 6 : Math.max(0, target - 1)));
  return isoDateLocal(monday);
}

function dateValue(raw) {
  return String(raw || "").replaceAll("-", "");
}

function nextDateValue(raw) {
  const date = new Date(`${raw}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return dateValue(isoDateLocal(date));
}


function timedDateValue(date = "", time = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) return "";
  return `${dateValue(date)}T${String(time).replace(":", "")}00`;
}

function raceProtocolCalendarEvents(item, stamp) {
  const protocol = item?.raceProtocol;
  if (!item?.raceEvent || !protocol?.calendarReminders || !Array.isArray(protocol.calendarItems)) return [];
  const baseUid = calendarUid(item, String(item.date || "race"));
  return protocol.calendarItems.flatMap((reminder) => {
    const start = timedDateValue(item.date, reminder.time);
    if (!start) return [];
    return [[
      "BEGIN:VEVENT",
      `UID:${escapeIcs(`${baseUid}-${reminder.key || "reminder"}`)}@endurance-intelligence`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      "SEQUENCE:0",
      `DTSTART:${start}`,
      `DURATION:PT15M`,
      `SUMMARY:${escapeIcs(reminder.title)}`,
      `DESCRIPTION:${escapeIcs(`${item.title || "Wettkampf"} · ${reminder.detail || "Race Protocol"}`)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ].join("\r\n")];
  });
}

function formatUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function containsDistance(title, distance) {
  if (!distance) return true;
  const normalized = String(title || "").replace(",", ".").toLowerCase();
  const variants = [Number(distance).toFixed(0), Number(distance).toFixed(1)].map((value) => value.replace(".0", ""));
  return variants.some((value) => new RegExp(`(^|\\s)${value.replace(".", "[.,]")}\\s*km`, "i").test(normalized));
}

function calendarIcon(item) {
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

export function isCalendarItemVisible(item) {
  if (!item || item.archived) return false;
  const missedMeta = item.missedMeta && typeof item.missedMeta === "object" ? item.missedMeta : {};
  return !item.missedReason
    && !item.plannedCancellation
    && !item.cancelledAt
    && !missedMeta.plannedCancellation;
}

export function calendarSummary(item) {
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

export function buildCalendar(plan) {
  const stamp = formatUtcStamp(new Date());
  const events = (Array.isArray(plan) ? plan : [])
    .filter((item) => isCalendarItemVisible(item))
    .flatMap((item) => {
      const rawDate = item.date || dateForWeekday(item.day);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rawDate))) return [];
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
        "SEQUENCE:0",
        `DTSTART;VALUE=DATE:${dateValue(rawDate)}`,
        `DTEND;VALUE=DATE:${nextDateValue(rawDate)}`,
        `SUMMARY:${escapeIcs(calendarSummary(item))}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
      return [mainEvent, ...raceProtocolCalendarEvents({ ...item, date: rawDate }, stamp)];
    })
    .filter(Boolean);

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

export function downloadCalendar(plan) {
  const content = buildCalendar(plan);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "endurance-intelligence.ics";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
