export function signupEnabled(value) {
  const normalized = String(value ?? "true").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(normalized);
}
