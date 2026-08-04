let audioContext = null;
let cachedGermanVoice = null;
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
  countdown3: [{ frequency: 620, offset: 0, duration: 0.18, gain: 0.3, type: "triangle" }],
  countdown2: [{ frequency: 720, offset: 0, duration: 0.18, gain: 0.3, type: "triangle" }],
  countdown1: [{ frequency: 860, offset: 0, duration: 0.24, gain: 0.34, type: "triangle" }],
  start: [
    { frequency: 820, offset: 0, duration: 0.16, gain: 0.28, type: "triangle" },
    { frequency: 1120, offset: 0.17, duration: 0.28, gain: 0.34, type: "triangle" },
  ],
  end: [
    { frequency: 760, offset: 0, duration: 0.18, gain: 0.28, type: "triangle" },
    { frequency: 430, offset: 0.2, duration: 0.32, gain: 0.34, type: "triangle" },
  ],
  switch: [
    { frequency: 880, offset: 0, duration: 0.12, gain: 0.3, type: "square" },
    { frequency: 880, offset: 0.17, duration: 0.12, gain: 0.3, type: "square" },
    { frequency: 1040, offset: 0.34, duration: 0.2, gain: 0.34, type: "triangle" },
  ],
  complete: [
    { frequency: 660, offset: 0, duration: 0.16, gain: 0.28, type: "triangle" },
    { frequency: 880, offset: 0.2, duration: 0.16, gain: 0.3, type: "triangle" },
    { frequency: 1100, offset: 0.4, duration: 0.34, gain: 0.36, type: "triangle" },
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

export async function playWorkoutAudioDemo() {
  const context = getAudioContext();
  if (!context) return false;

  // Audible priming keeps the context unlocked on browsers that ignore a
  // resume-only call. This function is invoked directly by a user click.
  const ready = await primeWorkoutAudio({ audible: true });
  if (!ready) return false;

  try {
    const start = context.currentTime + 0.45;
    scheduleCue(context, "countdown3", start);
    scheduleCue(context, "countdown2", start + 1);
    scheduleCue(context, "countdown1", start + 2);
    scheduleCue(context, "start", start + 3);
    scheduleCue(context, "end", start + 4.3);
    scheduleCue(context, "switch", start + 5.2);
    scheduleCue(context, "complete", start + 6.25);
    return true;
  } catch {
    return false;
  }
}

function germanVoice() {
  if (cachedGermanVoice) return cachedGermanVoice;
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  cachedGermanVoice = voices.find((voice) => String(voice.lang || "").toLowerCase() === "de-de")
    || voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("de"))
    || null;
  return cachedGermanVoice;
}

export function speakWorkoutCue(text) {
  if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance || !text) return false;

  try {
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    synthesis.resume?.();
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    utterance.lang = "de-DE";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voice = germanVoice();
    if (voice) utterance.voice = voice;

    // Keep the utterance alive until the browser reports completion. Some
    // Chromium/WebView versions otherwise garbage-collect short announcements.
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
    contextState: audioContext?.state || "idle",
  };
}
