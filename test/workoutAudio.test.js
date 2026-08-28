import test from "node:test";
import assert from "node:assert/strict";
import { workoutVoiceOptions } from "../src/services/workoutAudio.js";

test("coach voice auto-selection prefers modern German natural voices over legacy desktop voices", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [
        { name: "Microsoft Hedda Desktop", voiceURI: "legacy", lang: "de-DE", localService: true, default: true },
        { name: "Microsoft Katja Online (Natural)", voiceURI: "katja-natural", lang: "de-DE", localService: false, default: false },
        { name: "English Natural", voiceURI: "english", lang: "en-US", localService: false, default: false },
      ],
    },
  };

  try {
    const voices = workoutVoiceOptions();
    assert.equal(voices.length, 2);
    assert.equal(voices[0].voiceURI, "katja-natural");
    assert.equal(voices[0].natural, true);
    assert.equal(voices[1].voiceURI, "legacy");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
