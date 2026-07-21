const PRESET_LIST = [
  {
    id: "eym-green",
    label: "EYM Green",
    description: "Das ursprüngliche spacige EYM-Grün.",
    primary: "#5ee494",
    secondary: "#75e8a6",
    background: "#07130d",
    sidebar: "#0a1710",
    card: "#102018",
    cardAlt: "#0c1912",
    input: "#09130e",
    border: "#20362a",
    text: "#eff8f2",
    muted: "#81978a",
  },
  {
    id: "miami",
    label: "Miami",
    description: "Cyan, Pink und tiefes Mitternachtsblau.",
    primary: "#39e7ff",
    secondary: "#ff4fd8",
    background: "#060a16",
    sidebar: "#0a1021",
    card: "#10182a",
    cardAlt: "#0b1323",
    input: "#080e1b",
    border: "#263754",
    text: "#f4fbff",
    muted: "#8ba5b8",
  },
  {
    id: "ice-blue",
    label: "Ice Blue",
    description: "Kühles Blau mit klaren, ruhigen Akzenten.",
    primary: "#6bbcff",
    secondary: "#d8f5ff",
    background: "#07101a",
    sidebar: "#0a1622",
    card: "#102131",
    cardAlt: "#0b1927",
    input: "#08131e",
    border: "#29455d",
    text: "#f2f9ff",
    muted: "#8ba2b3",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Koralle, Pink und ein warmer dunkler Grundton.",
    primary: "#ff8a4c",
    secondary: "#ff4f91",
    background: "#150907",
    sidebar: "#1c0d0b",
    card: "#281512",
    cardAlt: "#20100f",
    input: "#170b0a",
    border: "#51302a",
    text: "#fff7f2",
    muted: "#b49a91",
  },
  {
    id: "violet",
    label: "Violet",
    description: "Violett mit einem frischen elektrischen Blau.",
    primary: "#b58cff",
    secondary: "#5de2ff",
    background: "#0d0817",
    sidebar: "#130d21",
    card: "#1b1330",
    cardAlt: "#150f27",
    input: "#100a1d",
    border: "#3c2d59",
    text: "#fbf7ff",
    muted: "#a597b6",
  },
  {
    id: "amber",
    label: "Amber",
    description: "Bernstein und Orange auf einem dunklen Graphitton.",
    primary: "#ffc857",
    secondary: "#ff8a3d",
    background: "#110d07",
    sidebar: "#19130b",
    card: "#241b0f",
    cardAlt: "#1c150c",
    input: "#130f09",
    border: "#493a22",
    text: "#fffaf0",
    muted: "#aa9c82",
  },
];

export const THEME_PRESETS = Object.fromEntries(PRESET_LIST.map((preset) => [preset.id, preset]));
export const THEME_PRESET_LIST = PRESET_LIST;

export const DEFAULT_APPEARANCE = {
  themeId: "eym-green",
  customPrimary: "#39e7ff",
  customSecondary: "#ff4fd8",
  glowIntensity: 42,
  glowEnabled: true,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value, fallback) {
  const hex = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex, "#000000").slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

function mixHex(first, second, amount = 0.5) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const ratio = clamp(Number(amount) || 0, 0, 1);
  const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");
  return `#${toHex(a.r + (b.r - a.r) * ratio)}${toHex(a.g + (b.g - a.g) * ratio)}${toHex(a.b + (b.b - a.b) * ratio)}`;
}

function contrastText(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#071019" : "#ffffff";
}

function customTheme(appearance) {
  const primary = normalizeHex(appearance.customPrimary, DEFAULT_APPEARANCE.customPrimary);
  const secondary = normalizeHex(appearance.customSecondary, DEFAULT_APPEARANCE.customSecondary);
  const baseSeed = mixHex(primary, secondary, 0.35);
  return {
    id: "custom",
    label: "Custom",
    description: "Deine eigene Ambientebeleuchtung.",
    primary,
    secondary,
    background: mixHex("#02050c", baseSeed, 0.07),
    sidebar: mixHex("#050812", baseSeed, 0.10),
    card: mixHex("#0b101b", baseSeed, 0.13),
    cardAlt: mixHex("#080d17", baseSeed, 0.10),
    input: mixHex("#050a13", baseSeed, 0.08),
    border: mixHex("#1f2a3b", baseSeed, 0.24),
    text: "#f5f9ff",
    muted: mixHex("#8c9aaa", primary, 0.10),
  };
}

export function normalizeAppearance(value = {}) {
  const requestedTheme = String(value.themeId || DEFAULT_APPEARANCE.themeId);
  const themeId = requestedTheme === "custom" || THEME_PRESETS[requestedTheme]
    ? requestedTheme
    : DEFAULT_APPEARANCE.themeId;
  return {
    ...DEFAULT_APPEARANCE,
    ...value,
    themeId,
    customPrimary: normalizeHex(value.customPrimary, DEFAULT_APPEARANCE.customPrimary),
    customSecondary: normalizeHex(value.customSecondary, DEFAULT_APPEARANCE.customSecondary),
    glowIntensity: clamp(Number(value.glowIntensity ?? DEFAULT_APPEARANCE.glowIntensity), 0, 100),
    glowEnabled: value.glowEnabled !== false,
  };
}

export function resolveTheme(value = {}) {
  const appearance = normalizeAppearance(value);
  return appearance.themeId === "custom"
    ? customTheme(appearance)
    : THEME_PRESETS[appearance.themeId] || THEME_PRESETS[DEFAULT_APPEARANCE.themeId];
}

export function applyTheme(value = {}) {
  if (typeof document === "undefined") return;
  const appearance = normalizeAppearance(value);
  const theme = resolveTheme(appearance);
  const root = document.documentElement;
  const primaryRgb = rgbString(theme.primary);
  const secondaryRgb = rgbString(theme.secondary);
  const glowFactor = appearance.glowEnabled ? appearance.glowIntensity / 100 : 0;
  const glowBlur = Math.round(10 + glowFactor * 34);
  const glowAlpha = (0.08 + glowFactor * 0.30).toFixed(3);
  const variables = {
    "--bg-body": theme.background,
    "--bg-sidebar": theme.sidebar,
    "--bg-card": theme.card,
    "--bg-card-alt": theme.cardAlt,
    "--bg-input": theme.input,
    "--surface": mixHex(theme.card, theme.primary, 0.06),
    "--surface-strong": mixHex(theme.card, theme.primary, 0.12),
    "--border": theme.border,
    "--border-strong": mixHex(theme.border, theme.primary, 0.30),
    "--text": theme.text,
    "--muted": theme.muted,
    "--muted-bright": mixHex(theme.muted, theme.text, 0.42),
    "--text-soft": mixHex(theme.text, theme.muted, 0.28),
    "--accent": theme.primary,
    "--accent-rgb": primaryRgb,
    "--accent-secondary": theme.secondary,
    "--accent-secondary-rgb": secondaryRgb,
    "--accent-bright": mixHex(theme.primary, "#ffffff", 0.22),
    "--accent-text": contrastText(theme.primary),
    "--accent-soft": `rgba(${primaryRgb}, .10)`,
    "--accent-surface": `rgba(${primaryRgb}, .14)`,
    "--accent-surface-strong": `rgba(${primaryRgb}, .22)`,
    "--accent-border": `rgba(${primaryRgb}, .34)`,
    "--accent-border-strong": `rgba(${primaryRgb}, .58)`,
    "--accent-gradient": mixHex(theme.card, theme.primary, 0.25),
    "--secondary-soft": `rgba(${secondaryRgb}, .13)`,
    "--secondary-border": `rgba(${secondaryRgb}, .38)`,
    "--button-bg": `rgba(${primaryRgb}, .12)`,
    "--button-hover": `rgba(${primaryRgb}, .20)`,
    "--success": "#5ee494",
    "--success-bright": "#8dffba",
    "--success-soft": "#102b1b",
    "--success-border": "#3f7651",
    "--ambient-glow": appearance.glowEnabled
      ? `0 0 ${glowBlur}px rgba(${primaryRgb}, ${glowAlpha}), 0 0 ${Math.round(glowBlur * 1.5)}px rgba(${secondaryRgb}, ${(Number(glowAlpha) * 0.48).toFixed(3)})`
      : "none",
    "--ambient-glow-subtle": appearance.glowEnabled
      ? `0 0 ${Math.max(8, Math.round(glowBlur * 0.55))}px rgba(${primaryRgb}, ${(Number(glowAlpha) * 0.55).toFixed(3)})`
      : "none",
  };
  Object.entries(variables).forEach(([name, color]) => root.style.setProperty(name, color));
  root.dataset.theme = appearance.themeId;
  root.style.colorScheme = "dark";
}
