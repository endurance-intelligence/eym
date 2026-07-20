const PRODUCT_FIELDS = [
  "code", "product_name", "generic_name", "brands", "brand_owner", "owner", "manufacturing_places", "categories", "categories_tags", "quantity",
  "serving_quantity", "serving_size", "nutrition_data_per", "nutriments", "image_front_small_url", "image_front_url",
  "completeness", "last_modified_t",
].join(",");

function asNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanBarcode(value) {
  return String(value || "").replace(/\D/g, "");
}

function inferCategory(product) {
  const text = [product.product_name, product.generic_name, product.categories, ...(product.categories_tags || [])].filter(Boolean).join(" ").toLowerCase();
  if (/gel|energy-gel|sport-gel/.test(text)) return "Gel";
  if (/electrolyt|electrolyte|isotonic|hydration|sports-drink/.test(text)) return "Elektrolyte";
  if (/drink mix|drink-mix|powder|pulver|carbohydrate drink/.test(text)) return "Drink Mix";
  if (/bar|riegel|energy-bar/.test(text)) return "Riegel";
  if (/recovery|protein/.test(text)) return "Recovery";
  if (/capsule|kapsel|tablet|tablette|salt/.test(text)) return "Kapseln";
  return "Sonstiges";
}

export function stockUnitForCategory(category) {
  if (category === "Drink Mix" || category === "Elektrolyte" || category === "Recovery") return "Portionen";
  if (category === "Kapseln") return "Tabletten";
  return "Stück";
}

function carbsPerServing(product) {
  const nutrients = product.nutriments || {};
  const direct = asNumber(nutrients.carbohydrates_serving);
  if (direct !== null) return Math.max(0, direct);
  const per100 = asNumber(nutrients.carbohydrates_100g);
  const serving = asNumber(product.serving_quantity);
  if (per100 !== null && serving !== null) return Math.max(0, per100 * serving / 100);
  return null;
}

function caffeineMgPerServing(product) {
  const nutrients = product.nutriments || {};
  const direct = asNumber(nutrients.caffeine_serving);
  const per100 = asNumber(nutrients.caffeine_100g);
  const serving = asNumber(product.serving_quantity);
  let value = direct;
  if (value === null && per100 !== null && serving !== null) value = per100 * serving / 100;
  if (value === null) return null;
  return Math.max(0, value <= 5 ? value * 1000 : value);
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Das Foto konnte nicht geöffnet werden.")); };
    image.src = url;
  });
}

function rotatedDataUrl(image, angle) {
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const swap = Math.abs(angle) % 180 === 90;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? height : width;
  canvas.height = swap ? width : height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function scanBarcodeFromImage(file) {
  if (!file) throw new Error("Bitte zuerst ein Foto auswählen.");
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  const image = await imageFromFile(file);
  const candidates = [0, 90, -90, 180].map((angle) => rotatedDataUrl(image, angle));
  for (const dataUrl of candidates) {
    try {
      const result = await reader.decodeFromImageUrl(dataUrl);
      const barcode = cleanBarcode(result.getText());
      if (barcode) return barcode;
    } catch {
      // Try the next rotation. Product photos often contain a sideways barcode.
    }
  }
  throw new Error("Kein Barcode erkannt. Fotografiere nur den Code, gerade, scharf und möglichst formatfüllend. Du kannst die Nummer auch direkt eintippen.");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").split(",")[0].trim();
    if (text) return text;
  }
  return "";
}

function productResult(barcode, source, sourceLabel) {
  const category = inferCategory(source);
  const carbs = carbsPerServing(source);
  const caffeine = caffeineMgPerServing(source);
  const brand = firstText(source.brands, source.brand_owner, source.owner, source.manufacturing_places);
  return {
    found: true,
    barcode,
    product: {
      barcode,
      brand,
      brandSource: source.brands ? "brands" : source.brand_owner ? "brand_owner" : source.owner ? "owner" : source.manufacturing_places ? "manufacturing_places" : null,
      name: String(source.product_name || source.generic_name || "").trim(),
      category,
      carbs: carbs == null ? null : Math.round(carbs * 10) / 10,
      caffeine: caffeine == null ? null : Math.round(caffeine),
      stockUnit: stockUnitForCategory(category),
      imageUrl: source.image_front_small_url || source.image_front_url || "",
      source: sourceLabel,
      packageSize: source.quantity || source.serving_size || "",
      catalogCompleteness: asNumber(source.completeness),
      catalogModifiedAt: source.last_modified_t ? new Date(Number(source.last_modified_t) * 1000).toISOString() : null,
      catalogCheckedAt: new Date().toISOString(),
    },
  };
}

async function lookupV3(barcode) {
  const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?product_type=all&lc=de&fields=${encodeURIComponent(PRODUCT_FIELDS)}`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Produktdaten konnten nicht geladen werden (${response.status}).`);
  const payload = await response.json();
  return payload?.product ? productResult(barcode, payload.product, "Open Food Facts") : null;
}

async function lookupV2(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Produktdaten konnten nicht geladen werden (${response.status}).`);
  const payload = await response.json();
  return payload.status === 1 && payload.product ? productResult(barcode, payload.product, "Open Food Facts") : null;
}


function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchScore(product, query) {
  const queryTokens = normalizeSearchText(query).split(" ").filter((token) => token.length > 1);
  if (!queryTokens.length) return 0;
  const haystack = normalizeSearchText([product.brands, product.product_name, product.generic_name, product.categories].filter(Boolean).join(" "));
  const matched = queryTokens.filter((token) => haystack.includes(token)).length;
  const coverage = matched / queryTokens.length;
  const completeness = Math.max(0, Math.min(1, asNumber(product.completeness) || 0));
  return coverage * 0.85 + completeness * 0.15;
}

export async function lookupOpenFoodFactsProductByText(brand, name) {
  const query = [brand, name].filter(Boolean).join(" ").trim();
  if (!query) throw new Error("Für die Produktsuche fehlen Marke und Produktname.");
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "12",
    fields: PRODUCT_FIELDS,
  });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`);
  if (!response.ok) throw new Error(`Produktdaten konnten nicht geladen werden (${response.status}).`);
  const payload = await response.json();
  const ranked = (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => ({ product, score: searchScore(product, query) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 0.62) return { found: false, query };
  const barcode = cleanBarcode(best.product.code);
  return productResult(barcode, best.product, "Open Food Facts · Namenssuche");
}

export function openFoodFactsContributionUrl(rawBarcode) {
  const barcode = cleanBarcode(rawBarcode);
  return barcode ? `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}` : "https://world.openfoodfacts.org";
}

export async function lookupOpenFoodFactsProduct(rawBarcode) {
  const barcode = cleanBarcode(rawBarcode);
  if (!barcode) throw new Error("Bitte einen gültigen Barcode eingeben.");
  const result = await lookupV3(barcode) || await lookupV2(barcode);
  return result || { found: false, barcode };
}
