export function buildAuthRedirectUrl(origin, baseUrl = "/") {
  const normalizedOrigin = String(origin || "").trim().replace(/\/+$/, "");
  if (!normalizedOrigin) throw new Error("Für den Auth-Redirect fehlt die App-Domain.");
  return new URL(String(baseUrl || "/"), `${normalizedOrigin}/`).toString();
}
