function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function round1(value) {
  return Number(numeric(value).toFixed(1));
}

export function archiveWeekNumber(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

function monthProfile({ longestKm, runningKm, totalKm, sportCount, peakKm, averageWeekKm }) {
  if (longestKm >= 50) {
    return {
      key: "ultra",
      label: "Ultra-Fokus",
      note: `${round1(longestKm).toLocaleString("de-DE")} km längste Einheit`,
    };
  }
  if (runningKm >= 200) {
    return {
      key: "volume",
      label: "Umfangsstark",
      note: `${round1(runningKm).toLocaleString("de-DE")} Lauf-km`,
    };
  }
  if (sportCount >= 4) {
    return {
      key: "mixed",
      label: "Vielseitig",
      note: `${sportCount} Sportarten im Mix`,
    };
  }
  if (peakKm >= Math.max(30, averageWeekKm * 1.35)) {
    return {
      key: "peak",
      label: "Peak-Woche",
      note: `${round1(peakKm).toLocaleString("de-DE")} km in der stärksten Woche`,
    };
  }
  return {
    key: "steady",
    label: "Konstanter Aufbau",
    note: `${round1(totalKm).toLocaleString("de-DE")} km im Monat`,
  };
}

export function buildTrainingArchiveSnapshot({ activities = [], weeks = [], sportSummary = [] } = {}) {
  const activityCount = activities.length;
  const distanceKm = activities.reduce((sum, activity) => sum + numeric(activity?.distance), 0);
  const durationMinutes = activities.reduce((sum, activity) => sum + numeric(activity?.duration), 0);
  const longestKm = Math.max(0, ...activities.map((activity) => numeric(activity?.distance)));
  const chronologicalWeeks = [...weeks]
    .map(([key, weekActivities]) => ({
      key,
      week: archiveWeekNumber(key),
      distanceKm: (weekActivities || []).reduce((sum, activity) => sum + numeric(activity?.distance), 0),
      activityCount: (weekActivities || []).length,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const peakKm = Math.max(0, ...chronologicalWeeks.map((week) => week.distanceKm));
  const averageWeekKm = chronologicalWeeks.length ? distanceKm / chronologicalWeeks.length : 0;
  const runningKm = numeric(sportSummary.find((item) => item?.key === "running")?.distance);
  const sports = [...sportSummary]
    .sort((left, right) => numeric(right?.count) - numeric(left?.count) || numeric(right?.distance) - numeric(left?.distance));
  const primarySports = sports.slice(0, 2);

  return {
    activityCount,
    distanceKm: round1(distanceKm),
    durationMinutes: Math.round(durationMinutes),
    longestKm: round1(longestKm),
    peakKm: round1(peakKm),
    averageWeekKm: round1(averageWeekKm),
    weeks: chronologicalWeeks.map((week) => ({
      ...week,
      distanceKm: round1(week.distanceKm),
      share: peakKm > 0 ? Math.max(0.08, Math.min(1, week.distanceKm / peakKm)) : 0.08,
    })),
    profile: monthProfile({
      longestKm,
      runningKm,
      totalKm: distanceKm,
      sportCount: sports.length,
      peakKm,
      averageWeekKm,
    }),
    primarySports,
    remainingSportCount: Math.max(0, sports.length - primarySports.length),
  };
}
