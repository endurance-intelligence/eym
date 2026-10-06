export const FUEL_LAB_TABS = [
  ["partner", "Fuel Partner"],
  ["products", "Produkte"],
];

export function resolveFuelLabTab(value) {
  return FUEL_LAB_TABS.some(([key]) => key === value) ? value : "partner";
}

export function fuelLabTabSearchParams(currentParams, tab) {
  const next = new URLSearchParams(currentParams);
  next.set("tab", resolveFuelLabTab(tab));
  return next;
}
