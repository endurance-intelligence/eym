import { activityTimestamp, isRunningActivity, preferredActivities } from "./activityUtils";

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
  const weeklyKm = runs.reduce((sum, item) => sum + numeric(item.distance), 0) / 6;
  const runDays = new Set(runs.map(activityDate)).size / 6;
  const longest = Math.max(0, ...runs.map((item) => numeric(item.distance)));
  const elevationWeekly = runs.reduce((sum, item) => sum + numeric(item.elevationGain || item.totalElevationGain), 0) / 6;
  const selected = state.profile?.experienceLevel || "beginner";
  const observed = runDays >= 4 ? "experienced" : runDays >= 2 ? "advanced" : "beginner";
  return { selected, observed, weeklyKm, runDays, longest, elevationWeekly };
}

export function goalRequirements(state) {
  const milestones = (state.mission?.milestones || []).filter((item) => !item.archived);
  const target = milestones.find((item) => item.isMainTarget) || milestones.find((item) => item.priority === "A") || milestones[0] || state.mission || {};
  const name = `${target.name || ""}`.toLowerCase();
  const distance = numeric(target.targetKm);
  const elevation = numeric(target.elevationGain);
  const goalType = target.goalType || (target.targetTime ? "time" : distance ? "distance" : "finish");
  let discipline = "endurance";
  let focus = ["aerobe Basis", "progressiver Umfang", "Erholung"];
  if (/ultra|backyard/.test(name) || distance >= 50) {
    discipline = "ultra";
    focus = ["Zeit auf den Beinen", "Back-to-Back-Belastung", "Fueling", "muskuläre Robustheit"];
  } else if (/hermann|trail|berg/.test(name) || elevation >= 400) {
    discipline = "hilly";
    focus = ["Bergauf-Kraftausdauer", "kontrolliertes Bergablaufen", "profilierte Longruns", "Höhenmeter"];
  } else if (distance && distance <= 5.5) {
    discipline = "5k";
    focus = ["VO₂max", "Schwelle", "Laufökonomie", "Zieltempo"];
  } else if (distance > 0 && distance <= 10.5) {
    discipline = "10k";
    focus = ["Schwelle", "VO₂max", "Tempoausdauer"];
  } else if (distance >= 40 && distance < 50) {
    discipline = "marathon";
    focus = ["Longruns", "Marathonpace", "Fueling", "Tempoausdauer"];
  }
  return { target, discipline, focus, goalType };
}

export function currentWeekAssessment(state) {
  const start = startOfWeek();
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
  const todayKey = new Date().toISOString().slice(0,10);
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
  const candidates = [...open].sort((a,b)=>plannedLoad(b)-plannedLoad(a)).slice(0,3).map(item => ({
    id: item.id,
    title: item.title,
    date: item.date,
    load: plannedLoad(item),
    suggestion: /long/i.test(`${item.title} ${item.type}`) ? "Distanz um 15–25 % reduzieren" : /track|intervall|schwelle|tempo/i.test(`${item.title} ${item.type}`) ? "Intensität reduzieren oder durch lockeren Lauf ersetzen" : "kürzen, verschieben oder als Regeneration gestalten",
  }));
  return { level, reasons, average: Math.round(average), projected: Math.round(projected), ratio, candidates };
}
