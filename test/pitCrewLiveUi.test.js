import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");

test("Pit Crew keeps test controls out of the normal live flow", () => {
  assert.doesNotMatch(source, /pit-live-demo-panel/);
  assert.match(source, /WERKZEUGE/);
  assert.match(source, /Testmodus starten/);
});

test("Pit Crew only books loop intake after explicit return confirmation", () => {
  assert.match(source, /zählt noch nicht als tatsächlich aufgenommen/);
  assert.match(source, /„wie geplant“ ist vorausgewählt/);
  assert.match(source, /Erst mit „Rückkehr übernehmen“ zählt die Versorgung als tatsächlich aufgenommen/);
  assert.doesNotMatch(source, /wie geplant angenommen/);
});

test("Pit Crew never auto-confirms an older pending loop when the next pit is saved", () => {
  assert.match(source, /const unresolvedCarry = \[\.\.\.history\]\.reverse\(\)\.find/);
  assert.match(source, /zuerst bei Rückkehr bestätigen/);
  assert.doesNotMatch(source, /carryAssumption: "planned"/);
  assert.match(source, /const loopMustClose = Boolean\(pendingCarry/);
});


test("Pit weather hides manual overrides and shows per-loop operational details", () => {
  assert.match(source, /Wetter vor Ort weicht deutlich ab/);
  assert.match(source, /gefühlt \{forecast\.feelsLike\}/);
  assert.match(source, /pit-live-weather-loop-actions/);
});


test("athlete pre-feedback suppresses duplicate crew check-in and stays visible as a status banner", () => {
  assert.match(source, /if \(incomingApplies\)/);
  assert.match(source, /setCheckInOpen\(Boolean\(pendingCarry/);
  assert.match(source, /RÜCKMELDUNG ATHLET/);
  assert.match(source, /Keine Änderung am vorbereiteten Plan nötig/);
});

test("Pit Crew headline names the upcoming loop weather and actual intake bar uses recorded data", () => {
  assert.match(source, /WETTER FÜR LOOP/);
  assert.match(source, /KOMMENDER LOOP/);
  assert.match(source, /pit-live-weather-summary/);
  assert.match(source, /Gefühlt \{primaryLoopWeather\.feelsLike\}/);
  assert.match(source, /Regen \{primaryLoopWeather\.precipitationProbability\} %/);
  assert.match(source, /aktuelle Wetterbasis/);
  assert.match(source, /nextLoopWeatherBrief\.detail/);
  assert.match(source, /IST KH/);
  assert.match(source, /IST 💧/);
});


test("Athlet zurück combines status and loop intake in one return sheet", () => {
  assert.match(source, /VERPFLEGUNG AUF LOOP/);
  assert.match(source, /Alles wie geplant/);
  assert.match(source, /½ Teilweise/);
  assert.match(source, /○ Nichts/);
  assert.match(source, /RÜCKKEHR ÜBERNEHMEN/);
  assert.match(source, /Die Crew muss den Status nicht erneut eingeben/);
});

test("Pit Crew uses one sticky return action and simplifies single-item intake", () => {
  assert.match(source, /Bei Rückkehr unten einmal „Athlet zurück“ tippen/);
  assert.doesNotMatch(source, /<button type="button" onClick=\{markAthleteReturned\}>ATHLET ZURÜCK/);
  assert.match(source, /onClick=\{athleteNeedsArrival \? markAthleteReturned : savePit\}/);
  assert.match(source, /const singleArrivalItem = arrivalPendingItems\.length === 1/);
  assert.match(source, /singleArrivalItem \? "✓ Komplett" : "✓ Alles wie geplant"/);
  assert.match(source, /arrivalPendingItems\.length > 1/);
  assert.match(source, /confirmPendingCarry\(arrivalPendingItems\.length === 1 \? "half" : "rated"\)/);
});


test("shared Pit Crew route is protected by the application error boundary and exposes the KH audit", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const pitSource = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");
  assert.match(appSource, /<ErrorBoundary><PitCrewSharedSession token=\{sharedPitCrewToken\} \/><\/ErrorBoundary>/);
  assert.match(pitSource, /KH-BILANZ/);
  assert.match(pitSource, /PIT_CARB_TARGET\.center/);
});


test("Pit Crew sanitizes legacy live state before rendering the KH audit", () => {
  assert.match(source, /normalizePitCrewSnapshot/);
  assert.match(source, /normalizedLiveSelection/);
  assert.doesNotMatch(source, /activeSelection\.map\(\(entry, index\) => \{/);
});

test("Pit Crew never treats missing athlete feedback as current-round feedback", () => {
  assert.match(source, /const athleteFeedbackApplies = Boolean\(athleteFeedback\) && Number\(athleteFeedback\.round \|\| 0\) === Number\(timing\.currentRound \|\| 0\);/);
});


test("Crew sharing preserves the browser user gesture instead of awaiting token creation first", () => {
  const raceCoachSource = fs.readFileSync(new URL("../src/components/RaceCoach.jsx", import.meta.url), "utf8");
  const shareSource = fs.readFileSync(new URL("../src/services/pitCrewShare.js", import.meta.url), "utf8");
  assert.match(raceCoachSource, /if \(pitCrewShareToken\)/);
  assert.match(raceCoachSource, /sharePitCrewUrl\(buildPitCrewShareUrl\(pitCrewShareToken\), pitCrewRace\.name\)/);
  assert.match(raceCoachSource, /Crew-Link erstellt ✓ · Jetzt erneut auf „Crew-Link teilen“ klicken/);
  assert.match(raceCoachSource, /pitCrewShareToken \? "Crew-Link teilen" : "Crew-Link erstellen"/);
  assert.match(shareSource, /NotAllowedError/);
  assert.match(shareSource, /copyPitCrewUrl/);
});


test("athlete status offers an explicit Isostar fatigue signal", () => {
  assert.match(source, /\["iso-fatigue", "🧃", "Iso satt"\]/);
});


test("athlete status offers persistent liquid-only mode and crew can release solid food again", () => {
  assert.match(source, /\["liquid-only", "🥤", "Nur flüssig"\]/);
  assert.match(source, /FUEL-MODUS/);
  assert.match(source, /Fest geht wieder/);
});

test("Pit Crew compares on-hand stock with a visible recommendation and keeps gel priority", () => {
  assert.match(source, /VORRAT & STARTPLAN/);
  assert.match(source, /Vorhanden/);
  assert.match(source, /Empfohlen mitzunehmen/);
  assert.match(source, /ausreichend vorhanden/);
  assert.match(source, /stockStatus/);
  assert.match(source, /Gel-Prio/);
  assert.match(source, /setStockTargets/);
  assert.match(source, /buildPitCrewStartStock/);
  assert.doesNotMatch(source, /<summary><span>STARTVORRAT<\/span>/);
  assert.doesNotMatch(source, /<summary><span>GEL-PRIORITÄT<\/span>/);
});

test("demo next-loop control waits for athlete return and weather has a loop fallback", () => {
  assert.match(source, /disabled=\{!arrivalState\.arrived \|\| checkInOpen\}/);
  assert.match(source, /weatherFallback/);
  assert.match(source, /weatherTargetRound/);
});
