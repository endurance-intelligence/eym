export const MAIN_NAV_ITEMS = [
  { key: "briefing", to: "/", label: "Briefing", icon: "◉", paths: ["/"] },
  { key: "training", to: "/planner", label: "Training", icon: "↗", paths: ["/planner", "/training", "/mission", "/analytics"] },
  { key: "coach", to: "/coach", label: "Coach", icon: "✦", paths: ["/coach"] },
  { key: "fuel", to: "/fuel", label: "Fuel Lab", icon: "◒", paths: ["/fuel"] },
  { key: "settings", to: "/settings", label: "Settings", icon: "⚙", paths: ["/settings", "/equipment"] },
];

export const TRAINING_SECTIONS = [
  { key: "week", to: "/planner", label: "Woche" },
  { key: "sessions", to: "/training", label: "Einheiten" },
  { key: "goals", to: "/mission", label: "Ziele" },
  { key: "analysis", to: "/analytics", label: "Analyse" },
];

export const SETTINGS_SECTIONS = [
  ["overview", "Übersicht"],
  ["profile", "Profil"],
  ["planning", "Training & Planung"],
  ["equipment", "Ausrüstung"],
  ["appearance", "Darstellung"],
  ["connections", "Verbindungen"],
  ["data", "Daten & Kalender"],
];

function pathMatches(pathname, path) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isMainNavigationActive(pathname, item) {
  return item.paths.some((path) => pathMatches(pathname, path));
}

export function resolveSettingsSection(value) {
  return SETTINGS_SECTIONS.some(([key]) => key === value) ? value : "overview";
}

export function settingsSectionSearchParams(currentParams, section) {
  const next = new URLSearchParams(currentParams);
  const resolved = resolveSettingsSection(section);
  if (resolved === "overview") next.delete("section");
  else next.set("section", resolved);
  return next;
}
