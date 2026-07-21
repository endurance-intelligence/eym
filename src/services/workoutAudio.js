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
  countdown: [{ frequency: 660, offset: 0, duration: 0.09, gain: 0.08 }],
  start: [
    { frequency: 660, offset: 0, duration: 0.11 },
    { frequency: 880, offset: 0.14, duration: 0.18 },
  ],
  end: [
    { frequency: 660, offset: 0, duration: 0.12 },
    { frequency: 440, offset: 0.15, duration: 0.2 },
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

export async function playWorkoutCue(kind = "start") {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  const now = context.currentTime + 0.02;
  const pattern = cuePatterns[kind] || cuePatterns.start;
  pattern.forEach(({ offset = 0, ...settings }) => tone(context, { ...settings, start: now + offset }));
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
