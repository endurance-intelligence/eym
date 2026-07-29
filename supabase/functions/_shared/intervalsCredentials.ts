const CIPHER_VERSION = "v1";
const IV_BYTES = 12;

function required(value: unknown, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} fehlt.`);
  return normalized;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(required(secret, "INTERVALS_CREDENTIALS_KEY")),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptIntervalsApiKey(
  apiKey: string,
  secret: string,
  iv = crypto.getRandomValues(new Uint8Array(IV_BYTES)),
) {
  const plainText = required(apiKey, "Intervals.icu API-Key");
  if (iv.length !== IV_BYTES) throw new Error("Ungültiger Initialisierungsvektor.");
  const key = await encryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText),
  );
  return `${CIPHER_VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptIntervalsApiKey(ciphertext: string, secret: string) {
  const [version, encodedIv, encodedPayload, ...rest] = String(ciphertext || "").split(".");
  if (version !== CIPHER_VERSION || !encodedIv || !encodedPayload || rest.length) {
    throw new Error("Das gespeicherte Intervals.icu-Zugangsdokument ist ungültig.");
  }
  const iv = base64ToBytes(encodedIv);
  if (iv.length !== IV_BYTES) throw new Error("Das gespeicherte Intervals.icu-Zugangsdokument ist ungültig.");
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBytes(encodedPayload),
  );
  return new TextDecoder().decode(decrypted);
}
