import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const APP_NAME = "Endurance Intelligence";
const APP_VERSION = "2.19.0";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ist in Supabase noch nicht gesetzt.`);
  return value;
}

async function authenticatedUser(request: Request) {
  const supabaseUrl = requiredSecret("SUPABASE_URL");
  const serviceRole = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanBarcode(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function categoryForOpenFoodFacts(category: unknown) {
  const map: Record<string, string> = {
    Gel: "Energy gels",
    "Drink Mix": "Sports drink powders",
    Elektrolyte: "Electrolyte drinks",
    Riegel: "Energy bars",
    Recovery: "Recovery drinks",
    Kapseln: "Dietary supplements",
  };
  return map[String(category || "")] || "Sports foods";
}

async function stableAppUuid(userId: string) {
  const salt = Deno.env.get("OPEN_FOOD_FACTS_APP_SALT") || "endurance-intelligence";
  const bytes = new TextEncoder().encode(`${salt}:${userId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const uuid = digest.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function derivePer100(perUnit: number | null, servingQuantity: number | null) {
  if (perUnit == null || servingQuantity == null || servingQuantity <= 0) return null;
  return Number(((perUnit / servingQuantity) * 100).toFixed(3));
}

function dataUrlToBlob(value: unknown) {
  const dataUrl = String(value || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] || "image/jpeg" });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return { payload: JSON.parse(text), text };
  } catch {
    return { payload: null, text };
  }
}

async function writeProduct(product: Record<string, unknown>, credentials: { userId: string; password: string; appUuid: string; userAgent: string }) {
  const barcode = cleanBarcode(product.barcode);
  const servingQuantity = numberOrNull(product.servingQuantity);
  const servingUnit = cleanText(product.servingUnit, 4) || "g";
  const nutrientFields = [
    ["carbohydrates", "carbs", "carbsPer100", "g"],
    ["sugars", "sugar", "sugarPer100", "g"],
    ["fat", "fat", "fatPer100", "g"],
    ["proteins", "protein", "proteinPer100", "g"],
    ["salt", "salt", "saltPer100", "g"],
    ["sodium", "sodium", "sodiumPer100", "mg"],
    ["energy-kcal", "energyKcal", "energyKcalPer100", "kcal"],
    ["magnesium", "magnesium", "magnesiumPer100", "mg"],
    ["calcium", "calcium", "calciumPer100", "mg"],
    ["vitamin-b1", "vitaminB1", "vitaminB1Per100", "mg"],
    ["caffeine", "caffeine", "caffeinePer100", "mg"],
  ] as const;
  const nutrients = nutrientFields.map(([offName, servingField, per100Field, unit]) => ({
    offName,
    unit,
    value: numberOrNull(product[per100Field]) ?? derivePer100(numberOrNull(product[servingField]), servingQuantity),
  })).filter((item) => item.value != null);
  const body = new URLSearchParams({
    code: barcode,
    user_id: credentials.userId,
    password: credentials.password,
    app_name: APP_NAME,
    app_version: APP_VERSION,
    app_uuid: credentials.appUuid,
    product_name: cleanText(product.name, 200),
    brands: cleanText(product.brand, 200),
    categories: categoryForOpenFoodFacts(product.category),
    lang: "de",
    lc: "de",
    comment: "Produktdaten aus Endurance Intelligence Fuel Lab ergänzt",
  });
  const packageSize = cleanText(product.packageSize, 80);
  if (packageSize) body.set("quantity", packageSize);
  const preparedVolumeMl = numberOrNull(product.preparedVolumeMl);
  if (servingQuantity != null) body.set("serving_size", `${servingQuantity} ${servingUnit}${preparedVolumeMl ? ` / ${preparedVolumeMl} ml zubereitet` : ""}`);
  const ingredients = cleanText(product.ingredientsText, 4000);
  if (ingredients) body.set("ingredients_text_de", ingredients);
  if (nutrients.length) body.set("nutrition_data_per", "100g");
  nutrients.forEach(({ offName, value, unit }) => {
    body.set(`nutriment_${offName}`, String(value));
    body.set(`nutriment_${offName}_unit`, unit);
  });

  const response = await fetch("https://world.openfoodfacts.org/cgi/product_jqm2.pl", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": credentials.userAgent,
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const result = await parseResponse(response);
  const status = Number(result.payload?.status ?? (result.payload?.status_verbose === "fields saved" ? 1 : 0));
  if (!response.ok || (result.payload && status !== 1)) {
    throw new Error(result.payload?.status_verbose || result.payload?.error || result.text || `Produktdaten wurden abgelehnt (${response.status}).`);
  }
  return result.payload || { status: 1 };
}

async function uploadImage(barcode: string, imageField: string, dataUrl: unknown, credentials: { userId: string; password: string; appUuid: string; userAgent: string }) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  const body = new FormData();
  body.set("user_id", credentials.userId);
  body.set("password", credentials.password);
  body.set("code", barcode);
  body.set("imagefield", imageField);
  body.set(`imgupload_${imageField}`, blob, `${imageField}.jpg`);
  body.set("app_name", APP_NAME);
  body.set("app_version", APP_VERSION);
  body.set("app_uuid", credentials.appUuid);
  const response = await fetch("https://world.openfoodfacts.org/cgi/product_image_upload.pl", {
    method: "POST",
    headers: { "User-Agent": credentials.userAgent, Accept: "application/json" },
    body,
  });
  const result = await parseResponse(response);
  if (!response.ok || result.payload?.status === "status not ok" || result.payload?.error) {
    throw new Error(result.payload?.error || result.payload?.status || result.text || `Foto ${imageField} wurde abgelehnt (${response.status}).`);
  }
  return result.payload || { uploaded: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Nur POST ist erlaubt." }, 405);

  try {
    const user = await authenticatedUser(request);
    if (!user) return json({ message: "Nicht angemeldet." }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.action !== "contribute") return json({ message: "Unbekannte Aktion." }, 400);
    const product = body.product as Record<string, unknown>;
    const barcode = cleanBarcode(product?.barcode);
    if (barcode.length < 8) return json({ message: "Für einen Beitrag wird ein gültiger Barcode benötigt." }, 400);
    if (!cleanText(product?.name)) return json({ message: "Der Produktname fehlt." }, 400);

    const credentials = {
      userId: requiredSecret("OPEN_FOOD_FACTS_USER_ID"),
      password: requiredSecret("OPEN_FOOD_FACTS_PASSWORD"),
      appUuid: await stableAppUuid(user.id),
      userAgent: Deno.env.get("OPEN_FOOD_FACTS_USER_AGENT") || `${APP_NAME.replaceAll(" ", "")}/${APP_VERSION}`,
    };

    const productResult = await writeProduct(product, credentials);
    const uploads = [];
    for (const [field, value] of [
      ["front_de", product.imageUrl],
      ["nutrition_de", product.nutritionImageUrl],
      ["ingredients_de", product.ingredientsImageUrl],
    ] as const) {
      if (!value) continue;
      uploads.push({ field, result: await uploadImage(barcode, field, value, credentials) });
    }

    return json({
      ok: true,
      barcode,
      productResult,
      uploads,
      contributedAt: new Date().toISOString(),
      productUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const configurationError = /OPEN_FOOD_FACTS_/.test(message);
    return json({ message }, configurationError ? 503 : 500);
  }
});
