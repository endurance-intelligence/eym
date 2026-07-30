import { activityTimestamp, isRunningActivity, preferredActivities } from "./activityUtils.js";
import { DEFAULT_REPLACEMENT_SPORTS } from "./configuration.js";
import { buildGoalEngine } from "./goalEngine.js";

const DAY = 86400000;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityDate(activity) {
  return String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
}

function reviewFor(reviews, activity) {
  return reviews?.[activity?.id] || {};
}

function intensityFactor(text = "") {
  const value = String(text).toLowerCase();
  if (/race|wettkampf|intervall|track|schwelle|tempo|football|fußball/.test(value)) return 1.35;
  if (/long|backyard|ultra/.test(value)) return 1.2;
  if (/recovery|regeneration|easy|locker/.test(value)) return 0.8;
  if (/mobility|stabi|yoga/.test(value)) return 0.45;
  return 1;
}

export function activityLoad(activity, review = {}) {
  const minutes = Math.max(10, numeric(activity?.duration));
  const distance = numeric(activity?.distance);
  const elevation = numeric(activity?.elevationGain || activity?.totalElevationGain || activity?.elevation_gain);
  const base = minutes * intensityFactor(`${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`);
  const distanceLoad = isRunningActivity(activity) ? distance * 1.8 : distance * 0.25;
  const elevationLoad = elevation / 35;
  const rpe = numeric(review?.rpe || review?.load);
  const reviewFactor = rpe > 0 ? 0.75 + rpe / 20 : 1;
  return Math.round((base + distanceLoad + elevationLoad) * reviewFactor);
}

function plannedLoad(item) {
  const minutes = Math.max(10, numeric(item?.duration));
  const elevation = numeric(item?.elevationGain || item?.plannedElevationGain);
  const distance = numeric(item?.distance);
  return Math.round((minutes * intensityFactor(`${item?.title || ""} ${item?.type || ""}`)) + distance * 1.6 + elevation / 35);
}

function plannedSport(item = {}) {
  const value = `${item.title || ""} ${item.type || ""}`.toLowerCase();
  if (/track|intervall|schwelle|tempo|run|lauf|backyard|ultra/.test(value)) return "running";
  if (/bike|cycl|rad/.test(value)) return "cycling";
  if (/row|rud/.test(value)) return "rowing";
  if (/swim|schwimm/.test(value)) return "swimming";
  if (/mobility|mobilität|stabi|yoga|kraft/.test(value)) return "mobility";
  if (/football|fußball/.test(value)) return "football";
  return "other";
}

function availableAlternativeKeys(state = {}) {
  const configured = state.planner?.replacementSports;
  const allowed = new Set(Array.isArray(configured) && configured.length ? configured : DEFAULT_REPLACEMENT_SPORTS);
  const keys = new Set(["preset:rest"]);
  if (allowed.has("running")) keys.add("preset:easy-run");
  ["cycling", "rowing", "mobility", "swimming", "football", "strength"].forEach((sport) => {
    if (allowed.has(sport)) keys.add(`sport:${sport}`);
  });
  return keys;
}

const alternativeDetails = {
  "preset:easy-run": {
    label: "Lockerer Zone-2-Lauf",
    reason: "Ersetzt den Qualitätsreiz durch lockere aerobe Arbeit und erhält den Laufrhythmus.",
  },
  "sport:cycling": {
    label: "Locker Rad fahren",
    reason: "Senkt die Stoßbelastung fürs Laufen, erhält aber den lockeren Ausdauerreiz.",
  },
  "sport:rowing": {
    label: "Locker rudern",
    reason: "Nimmt Laufbelastung heraus und hält einen kontrollierten aeroben Reiz.",
  },
  "sport:mobility": {
    label: "Mobility / Stabi",
    reason: "Entlastet Beine und Kreislauf, ohne den Trainingstag komplett zu streichen.",
  },
  "sport:swimming": {
    label: "Locker schwimmen",
    reason: "Entlastet die Laufmuskulatur und erhält eine ruhige Ausdauereinheit.",
  },
  "sport:football": {
    label: "Fußball",
    reason: "Nutzt deinen vorhandenen Fixtermin als Ersatz, bleibt aber selbst ein intensiver Reiz.",
  },
  "sport:strength": {
    label: "Leichtes Krafttraining",
    reason: "Ersetzt die Ausdauereinheit durch einen kontrollierten, kurzen Kraftreiz.",
  },
  "preset:rest": {
    label: "Ruhetag / Erholung",
    reason: "Ein freier Tag schafft den größten Erholungseffekt vor der nächsten Schlüsseleinheit.",
  },
};

function firstAvailable(keys, preferences) {
  return preferences.find((key) => keys.has(key)) || "preset:rest";
}

export function coachAlternativeFor(item = {}, context = {}) {
  const available = context.availableKeys instanceof Set
    ? context.availableKeys
    : new Set(context.availableKeys || ["preset:rest"]);
  const sport = plannedSport(item);
  const hard = intensityFactor(`${item.title || ""} ${item.type || ""}`) >= 1.2;
  const primary = Number(context.index || 0) === 0;
  const overload = context.level === "adjust" || numeric(context.ratio) >= 1.5 || numeric(context.lowReviews) >= 2;

  if (primary && overload) {
    let reason = alternativeDetails["preset:rest"].reason;
    if (numeric(context.ratio) >= 1.5) {
      reason = "Die projizierte Belastung liegt deutlich über deinem jüngsten Rahmen. Ein freier Tag senkt sie am zuverlässigsten.";
    } else if (numeric(context.lowReviews) >= 2) {
      reason = "Mehrere aktuelle Reviews melden müde Beine oder wenig Energie. Ein freier Tag schützt die nächste Schlüsseleinheit.";
    }
    return { key: "preset:rest", ...alternativeDetails["preset:rest"], reason };
  }

  let preferences;
  if (sport === "running" && hard) {
    preferences = ["preset:easy-run", "sport:cycling", "sport:rowing", "sport:mobility", "preset:rest"];
  } else if (sport === "running") {
    preferences = ["sport:cycling", "sport:rowing", "sport:mobility", "sport:swimming", "preset:rest"];
  } else if (["cycling", "rowing", "swimming"].includes(sport)) {
    preferences = ["sport:mobility", "preset:easy-run", "preset:rest"];
  } else if (sport === "mobility") {
    preferences = ["preset:rest", "sport:cycling", "preset:easy-run"];
  } else {
    preferences = ["sport:cycling", "preset:easy-run", "sport:mobility", "preset:rest"];
  }

  const key = firstAvailable(available, preferences);
  return { key, ...alternativeDetails[key] };
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

export function athleteBaseline(state) {
  const now = Date.now();
  const activities = preferredActivities(state.activities || []).filter((item) => now - activityTimestamp(item) <= 42 * DAY);
  const runs = activities.filter(isRunningActivity);
  const hasRunData = runs.length > 0;
  const weeklyKm = hasRunData
    ? runs.reduce((sum, item) => sum + numeric(item.distance), 0) / 6
    : numeric(state.profile?.selfReportedWeeklyKm);
  const runDays = hasRunData
    ? new Set(runs.map(activityDate)).size / 6
    : numeric(state.profile?.selfReportedRunsPerWeek);
  const longest = hasRunData
    ? Math.max(0, ...runs.map((item) => numeric(item.distance)))
    : numeric(state.profile?.selfReportedLongestRunKm);
  const elevationWeekly = runs.reduce((sum, item) => sum + numeric(item.elevationGain || item.totalElevationGain), 0) / 6;
  const selected = state.profile?.experienceLevel || "beginner";
  const observed = runDays >= 4 ? "experienced" : runDays >= 2 ? "advanced" : "beginner";
  return { selected, observed, weeklyKm, runDays, longest, elevationWeekly, source: hasRunData ? "activities" : "profile" };
}

export function goalRequirements(state, now = new Date()) {
  const engine = buildGoalEngine({
    mission: state.mission,
    activities: state.activities,
    activityGroups: state.activityGroups,
    reviews: state.reviews,
    profile: state.profile,
    planner: state.planner,
    referenceDate: now,
  });
  return {
    target: engine.target || {},
    discipline: engine.discipline,
    disciplineLabel: engine.disciplineLabel,
    focus: engine.abilities,
    goalType: engine.goalType,
    targetPaceLabel: engine.targetPaceLabel,
    workingPaceLabel: engine.workingPaceLabel,
    phase: engine.phase,
    feasibility: engine.feasibility,
    requiredRuns: engine.requiredRuns,
    experience: engine.experience,
    currentForm: engine.currentForm,
    preparation: engine.preparation,
    targetGap: engine.targetGap,
    strategicAlignment: engine.strategicAlignment,
    constraintWarnings: engine.constraintWarnings,
  };
}

export function currentWeekAssessment(state, now = new Date()) {
  const reference = new Date(now);
  const start = startOfWeek(reference);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 42);
  const activities = preferredActivities(state.activities || []);
  const recent = activities.filter((a) => activityTimestamp(a) >= previousStart && activityTimestamp(a) < start);
  const recentLoads = Array.from({length:6}, (_,i) => {
    const ws = new Date(previousStart); ws.setDate(ws.getDate()+i*7);
    const we = new Date(ws); we.setDate(we.getDate()+7);
    return recent.filter(a => activityTimestamp(a)>=ws && activityTimestamp(a)<we).reduce((sum,a)=>sum+activityLoad(a,reviewFor(state.reviews,a)),0);
  });
  const average = recentLoads.reduce((a,b)=>a+b,0) / Math.max(1,recentLoads.filter(Boolean).length);
  const completed = activities.filter(a => activityTimestamp(a)>=start && activityTimestamp(a)<end).reduce((sum,a)=>sum+activityLoad(a,reviewFor(state.reviews,a)),0);
  const todayKey = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`;
  const open = (state.plan || []).filter(i => !i.archived && i.date>=todayKey && i.date<end.toISOString().slice(0,10) && !i.completed && !i.missedReason);
  const remaining = open.reduce((sum,i)=>sum+plannedLoad(i),0);
  const projected = completed + remaining;
  const ratio = average > 0 ? projected / average : 1;
  const hard = open.filter(i => intensityFactor(`${i.title} ${i.type}`)>=1.2);
  const lowReviews = Object.values(state.reviews || {}).filter(r => numeric(r.energy)>0 && numeric(r.energy)<=5 || numeric(r.legs)>0 && numeric(r.legs)<=5).slice(-4).length;
  const reasons = [];
  if (ratio >= 1.3) reasons.push(`projizierte Wochenbelastung liegt etwa ${Math.round((ratio-1)*100)} % über deinem jüngsten Mittel`);
  if (hard.length >= 3) reasons.push(`${hard.length} belastende Reize liegen in der verbleibenden Woche`);
  if (lowReviews >= 2) reasons.push("mehrere aktuelle Reviews melden müde Beine oder niedrige Energie");
  const level = reasons.length >= 2 || ratio >= 1.5 ? "adjust" : reasons.length ? "watch" : "ok";
  const availableKeys = availableAlternativeKeys(state);
  const candidates = [...open].sort((a,b)=>plannedLoad(b)-plannedLoad(a)).slice(0,3).map(item => ({
    id: item.id,
    title: item.title,
    date: item.date,
    load: plannedLoad(item),
    type: item.type,
  })).map((item, index) => {
    const coachAlternative = coachAlternativeFor(item, {
      availableKeys,
      index,
      level,
      ratio,
      lowReviews,
    });
    return {
      ...item,
      coachAlternative,
      suggestion: `${coachAlternative.label}. ${coachAlternative.reason}`,
    };
  });
  return { level, reasons, average: Math.round(average), projected: Math.round(projected), ratio, candidates };
}
