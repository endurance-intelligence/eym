let audioContext = null;
const activeUtterances = new Set();

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function getAudioContext() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
  return audioContext;
}

function tone(context, { frequency, start, duration, gain = 0.26, type = "sine" }) {
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), start + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

const cuePatterns = {
  unlock: [
    { frequency: 660, offset: 0, duration: 0.1, gain: 0.18, type: "triangle" },
    { frequency: 880, offset: 0.12, duration: 0.16, gain: 0.22, type: "triangle" },
  ],
  countdown3: [{ frequency: 620, offset: 0, duration: 0.2, gain: 0.42, type: "triangle" }],
  countdown2: [{ frequency: 760, offset: 0, duration: 0.2, gain: 0.44, type: "triangle" }],
  countdown1: [{ frequency: 980, offset: 0, duration: 0.28, gain: 0.5, type: "square" }],
  start: [
    { frequency: 820, offset: 0, duration: 0.16, gain: 0.32, type: "triangle" },
    { frequency: 1120, offset: 0.17, duration: 0.28, gain: 0.4, type: "triangle" },
  ],
  end: [
    { frequency: 760, offset: 0, duration: 0.18, gain: 0.32, type: "triangle" },
    { frequency: 430, offset: 0.2, duration: 0.34, gain: 0.4, type: "triangle" },
  ],
  switch: [
    { frequency: 880, offset: 0, duration: 0.12, gain: 0.34, type: "square" },
    { frequency: 880, offset: 0.17, duration: 0.12, gain: 0.34, type: "square" },
    { frequency: 1040, offset: 0.34, duration: 0.2, gain: 0.4, type: "triangle" },
  ],
  complete: [
    { frequency: 660, offset: 0, duration: 0.16, gain: 0.3, type: "triangle" },
    { frequency: 880, offset: 0.2, duration: 0.16, gain: 0.34, type: "triangle" },
    { frequency: 1100, offset: 0.4, duration: 0.34, gain: 0.42, type: "triangle" },
  ],
};

function scheduleCue(context, kind, start) {
  const pattern = cuePatterns[kind] || cuePatterns.start;
  pattern.forEach(({ offset = 0, ...settings }) => tone(context, { ...settings, start: start + offset }));
}

async function resumeAudioContext(context) {
  if (!context) return false;
  try {
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

/**
 * Must be called from a real click/tap. Scheduling the short unlock cue in the
 * same user interaction is important for Safari/iOS and stricter Chromium PWAs.
 */
export async function primeWorkoutAudio({ audible = false } = {}) {
  const context = getAudioContext();
  if (!context) return false;

  try {
    const start = context.currentTime + 0.015;
    if (audible) scheduleCue(context, "unlock", start);
    else tone(context, { frequency: 440, start, duration: 0.035, gain: 0.001, type: "sine" });
    return await resumeAudioContext(context);
  } catch {
    return false;
  }
}

export async function playWorkoutCue(kind = "start") {
  const context = getAudioContext();
  if (!context) return false;
  const ready = await resumeAudioContext(context);
  if (!ready) return false;
  try {
    scheduleCue(context, kind, context.currentTime + 0.02);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedules the whole 3-2-1 block in one WebAudio call. That makes the workout
 * countdown independent from React render timing and keeps it reliable in PWAs.
 */
export async function playWorkoutCountdown({ terminalCue = "" } = {}) {
  const context = getAudioContext();
  if (!context) return false;
  const ready = await resumeAudioContext(context);
  if (!ready) return false;
  try {
    const start = context.currentTime + 0.02;
    scheduleCue(context, "countdown3", start);
    scheduleCue(context, "countdown2", start + 1);
    scheduleCue(context, "countdown1", start + 2);
    if (terminalCue) scheduleCue(context, terminalCue, start + 3);
    return true;
  } catch {
    return false;
  }
}

export async function playWorkoutAudioDemo() {
  const context = getAudioContext();
  if (!context) return false;

  const ready = await primeWorkoutAudio({ audible: true });
  if (!ready) return false;

  try {
    const start = context.currentTime + 0.45;
    scheduleCue(context, "countdown3", start);
    scheduleCue(context, "countdown2", start + 1);
    scheduleCue(context, "countdown1", start + 2);
    scheduleCue(context, "start", start + 3);
    scheduleCue(context, "countdown3", start + 4.6);
    scheduleCue(context, "countdown2", start + 5.6);
    scheduleCue(context, "countdown1", start + 6.6);
    scheduleCue(context, "end", start + 7.6);
    scheduleCue(context, "complete", start + 8.8);
    return true;
  } catch {
    return false;
  }
}

function voiceQualityScore(voice = {}) {
  const lang = String(voice.lang || "").toLowerCase();
  const name = String(voice.name || "").toLowerCase();
  let score = 0;
  if (lang === "de-de") score += 120;
  else if (lang.startsWith("de")) score += 90;
  else return -1000;

  // Modern OS/browser voices usually expose one of these markers. Prefer them
  // over legacy Desktop/SAPI voices, which often sound distinctly synthetic.
  if (/natural/.test(name)) score += 100;
  if (/premium|enhanced/.test(name)) score += 85;
  if (/online/.test(name)) score += 70;
  if (/katja|conrad/.test(name)) score += 35;
  if (/google/.test(name)) score += 28;
  if (voice.localService === false) score += 12;
  if (voice.default) score += 8;
  if (/desktop|hedda|sapi/.test(name)) score -= 60;
  return score;
}

export function workoutVoiceOptions() {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) return [];
  return (window.speechSynthesis.getVoices() || [])
    .filter((voice) => String(voice.lang || "").toLowerCase().startsWith("de"))
    .map((voice) => ({
      voiceURI: voice.voiceURI || voice.name,
      name: voice.name || voice.voiceURI || "Deutsche Stimme",
      lang: voice.lang || "de-DE",
      localService: voice.localService !== false,
      default: Boolean(voice.default),
      qualityScore: voiceQualityScore(voice),
      natural: /natural|premium|enhanced|online/i.test(String(voice.name || "")),
      voice,
    }))
    .sort((a, b) => b.qualityScore - a.qualityScore || a.name.localeCompare(b.name, "de"));
}

function germanVoice(preferredVoiceURI = "") {
  const options = workoutVoiceOptions();
  if (!options.length) return null;
  if (preferredVoiceURI) {
    const selected = options.find((option) => option.voiceURI === preferredVoiceURI || option.name === preferredVoiceURI);
    if (selected) return selected.voice;
  }
  return options[0].voice;
}

export function speakWorkoutCue(text, { voiceURI = "", interrupt = true, rate = 1.03, pitch = 1 } = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance || !text) return false;

  try {
    const synthesis = window.speechSynthesis;
    if (interrupt) synthesis.cancel();
    synthesis.resume?.();
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    utterance.lang = "de-DE";
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    const voice = germanVoice(voiceURI);
    if (voice) utterance.voice = voice;

    activeUtterances.add(utterance);
    const release = () => activeUtterances.delete(utterance);
    utterance.onend = release;
    utterance.onerror = release;
    synthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function workoutAudioCapabilities() {
  const AudioContextClass = audioContextClass();
  return {
    tonesSupported: Boolean(AudioContextClass),
    speechSupported: typeof window !== "undefined" && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
    voiceCount: workoutVoiceOptions().length,
    contextState: audioContext?.state || "idle",
  };
}
