let audioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

export async function primeWorkoutAudio() {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  return context.state === "running";
}

function tone(context, { frequency, start, duration, gain = 0.12, type = "sine" }) {
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

const cuePatterns = {
  countdown3: [{ frequency: 620, offset: 0, duration: 0.16, gain: 0.18, type: "triangle" }],
  countdown2: [{ frequency: 720, offset: 0, duration: 0.16, gain: 0.18, type: "triangle" }],
  countdown1: [{ frequency: 860, offset: 0, duration: 0.22, gain: 0.2, type: "triangle" }],
  start: [
    { frequency: 820, offset: 0, duration: 0.14, gain: 0.17 },
    { frequency: 1100, offset: 0.16, duration: 0.24, gain: 0.2 },
  ],
  end: [
    { frequency: 760, offset: 0, duration: 0.16, gain: 0.17 },
    { frequency: 430, offset: 0.18, duration: 0.28, gain: 0.2 },
  ],
  switch: [
    { frequency: 880, offset: 0, duration: 0.1 },
    { frequency: 880, offset: 0.16, duration: 0.1 },
    { frequency: 1040, offset: 0.32, duration: 0.16 },
  ],
  complete: [
    { frequency: 660, offset: 0, duration: 0.14 },
    { frequency: 880, offset: 0.18, duration: 0.14 },
    { frequency: 1100, offset: 0.36, duration: 0.28 },
  ],
};

function scheduleCue(context, kind, start) {
  const pattern = cuePatterns[kind] || cuePatterns.start;
  pattern.forEach(({ offset = 0, ...settings }) => tone(context, { ...settings, start: start + offset }));
}

export async function playWorkoutCue(kind = "start") {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  scheduleCue(context, kind, context.currentTime + 0.02);
  return true;
}

export async function playWorkoutAudioDemo() {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  const start = context.currentTime + 0.05;
  scheduleCue(context, "countdown3", start);
  scheduleCue(context, "countdown2", start + 1);
  scheduleCue(context, "countdown1", start + 2);
  scheduleCue(context, "start", start + 3);
  scheduleCue(context, "end", start + 4.25);
  return true;
}

export function speakWorkoutCue(text) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.02;
  utterance.pitch = 1;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
  return true;
}
