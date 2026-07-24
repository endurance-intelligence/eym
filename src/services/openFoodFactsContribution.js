import { supabase, supabaseConfigured } from "./supabase.js";

async function functionError(error, fallback) {
  let detail = error?.message || fallback;
  try {
    const response = error?.context;
    if (response?.json) {
      const body = await response.json();
      detail = body?.message || detail;
    }
  } catch {
    // Keep the original function error.
  }
  return detail;
}

export function openFoodFactsContributionReady() {
  return supabaseConfigured;
}

export async function contributeOpenFoodFactsProduct(product) {
  const { data, error } = await supabase.functions.invoke("open-food-facts", {
    body: { action: "contribute", product },
  });
  if (error) throw new Error(await functionError(error, "Der Beitrag konnte nicht an Open Food Facts gesendet werden."));
  if (!data?.ok) throw new Error(data?.message || "Open Food Facts hat den Beitrag nicht bestätigt.");
  return data;
}
