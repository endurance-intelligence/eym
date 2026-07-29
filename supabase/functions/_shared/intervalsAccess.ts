export function isIntervalsOwner(userId: unknown, ownerUserId: unknown) {
  const user = String(userId || "").trim();
  const owner = String(ownerUserId || "").trim();
  return Boolean(user && owner && user === owner);
}

export function canUseLegacyIntervalsConnection(
  userId: unknown,
  ownerUserId: unknown,
  apiKey: unknown,
) {
  return isIntervalsOwner(userId, ownerUserId) && Boolean(String(apiKey || "").trim());
}
