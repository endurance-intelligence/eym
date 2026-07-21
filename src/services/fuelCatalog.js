export function normalizeFuelCatalogText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function reviewFuelCategory(item) {
  return item?.type === "Salz" ? "Kapseln" : item?.type || "Sonstiges";
}

export function fuelCatalogKey(item = {}) {
  const category = item.category || reviewFuelCategory(item);
  const brand = item.brand ?? item.manufacturer ?? "";
  const name = item.name ?? item.product ?? "";
  return [category, normalizeFuelCatalogText(brand), normalizeFuelCatalogText(name)].join("|");
}

export function findFuelCatalogMatch(fuel, reviewItem, category = reviewFuelCategory(reviewItem)) {
  const productName = normalizeFuelCatalogText(reviewItem.product);
  const manufacturer = normalizeFuelCatalogText(reviewItem.manufacturer);
  const sameProduct = fuel.filter((candidate) => (
    normalizeFuelCatalogText(candidate.name) === productName
    && candidate.category === category
  ));
  const exact = sameProduct.find((candidate) => normalizeFuelCatalogText(candidate.brand) === manufacturer);
  if (exact) return exact;
  if (!manufacturer && sameProduct.length === 1) return sameProduct[0];
  const candidatesWithoutBrand = sameProduct.filter((candidate) => !normalizeFuelCatalogText(candidate.brand));
  if (manufacturer && candidatesWithoutBrand.length === 1) return candidatesWithoutBrand[0];
  return null;
}
