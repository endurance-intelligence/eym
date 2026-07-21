function cleanBarcode(value) {
  return String(value || "").replace(/\D/g, "");
}

function asPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function priceDate(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizePrice(item) {
  return {
    id: item.id,
    price: asPrice(item.price),
    currency: String(item.currency || "EUR").toUpperCase(),
    date: item.date || item.proof_date || item.created || null,
    discounted: Boolean(item.price_is_discounted),
    previousPrice: asPrice(item.price_without_discount),
    location: item.location_osm_display_name || item.location?.osm_display_name || item.location?.name || "",
    city: item.location_osm_address_city || item.location?.osm_address_city || "",
    countryCode: String(item.location_osm_address_country_code || item.location?.osm_address_country_code || "").toUpperCase(),
    proofType: item.proof_type || item.proof?.type || "",
  };
}

export async function lookupOpenPrices(rawBarcode) {
  const barcode = cleanBarcode(rawBarcode);
  if (!barcode) return { found: false, reason: "missing-barcode", prices: [] };

  const params = new URLSearchParams({ product_code: barcode, size: "50" });
  const response = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?${params}`);
  if (!response.ok) throw new Error(`Preisdaten konnten nicht geladen werden (${response.status}).`);
  const payload = await response.json();
  const rows = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
  const prices = rows.map(normalizePrice).filter((item) => item.price != null);
  const euroPrices = prices.filter((item) => item.currency === "EUR");
  const comparable = euroPrices.length ? euroPrices : prices;
  const latest = [...comparable].sort((left, right) => priceDate(right.date) - priceDate(left.date))[0] || null;
  const best = [...comparable].sort((left, right) => left.price - right.price || priceDate(right.date) - priceDate(left.date))[0] || null;

  return {
    found: comparable.length > 0,
    barcode,
    prices: comparable,
    count: comparable.length,
    latest,
    best,
  };
}

export function productPriceSearchLinks(item = {}) {
  const barcode = cleanBarcode(item.barcode);
  const productText = [item.brand, item.name].filter(Boolean).join(" ").trim();
  const query = barcode || productText;
  const encoded = encodeURIComponent(query);
  return [
    { label: "Idealo", href: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encoded}` },
    { label: "Google Shopping", href: `https://www.google.com/search?tbm=shop&q=${encoded}` },
    { label: "eBay", href: `https://www.ebay.de/sch/i.html?_nkw=${encoded}` },
    { label: "Amazon", href: `https://www.amazon.de/s?k=${encoded}` },
  ];
}
