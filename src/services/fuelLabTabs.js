export const FUEL_LAB_TABS = [
  ["products", "Produkte"],
];

export function resolveFuelLabTab(value) {
  return FUEL_LAB_TABS.some(([key]) => key === value) ? value : "products";
}

export function fuelLabTabSearchParams(currentParams, tab) {
  const next = new URLSearchParams(currentParams);
  next.set("tab", resolveFuelLabTab(tab));
  return next;
}
