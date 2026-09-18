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
  assert.match(source, /arrivalIntakeMode === "planned"/);
  assert.match(source, /Alles wie geplant/);
  assert.match(source, /confirmPendingCarry\("planned"\)/);
  assert.match(source, /const confirmedHistory = history\.filter\(\(record\) => record\.carryStatus !== "pending"\)/);
  assert.match(source, /const lastConfirmedRecord = \[\.\.\.confirmedHistory\]/);
  assert.doesNotMatch(source, /lastRecord\.carryStatus === "pending" && lastRecord\.provisionalSummary/);
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

test("Pit Crew headline names the upcoming loop weather and keeps confirmed intake in the main plan card", () => {
  assert.match(source, /WETTER FÜR LOOP/);
  assert.match(source, /KOMMENDER LOOP/);
  assert.match(source, /pit-live-weather-summary/);
  assert.match(source, /Gefühlt \{primaryLoopWeather\.feelsLike\}/);
  assert.match(source, /Regen \{primaryLoopWeather\.precipitationProbability\} %/);
  assert.match(source, /aktuelle Wetterbasis/);
  assert.match(source, /nextLoopWeatherBrief\.detail/);
  assert.match(source, /ZULETZT BESTÄTIGT/);
  assert.match(source, /Ø 3 H/);
  assert.match(source, /pit-live-actual-overview/);
  assert.doesNotMatch(source, /<small>IST KH<\/small>/);
});




test("Pit Crew main plan card uses traffic-light attention and includes all crew actions", () => {
  assert.match(source, /plan-tone-\$\{planCardTone\}/);
  assert.match(source, /planCarbTone === "high" \|\| careLevel === "urgent"/);
  assert.match(source, /primaryAttentionReason/);
  assert.match(source, /planCardStatus/);
  assert.match(source, /CREW-AKTIONEN/);
  assert.match(source, /athleteCare\.hints\.map/);
  assert.match(source, /weatherCrewActions\.map/);
  assert.match(source, /Keine Zusatzaktion/);
  assert.match(source, /fuelNeedsAttention/);
  assert.match(source, /pit-live-plan-alert/);
  assert.doesNotMatch(source, /<div className=\{`pit-live-alert/);
});

test("Athlet zurück combines status and loop intake in one return sheet", () => {
  assert.match(source, /AUFNAHME FÜR LOOP/);
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


test("Pit Crew live view keeps the current plan glanceable and removes duplicate top-level fueling", () => {
  assert.match(source, /Pit: Loop/);
  assert.match(source, /Pit: Start/);
  assert.match(source, /ATHLETE STATUS/);
  assert.match(source, /PIT-PLAN · MANUELL ANGEPASST/);
  assert.match(source, /Fueling im Ziel/);
  assert.match(source, /g unter Ziel/);
  assert.match(source, /g über Ziel/);
  assert.match(source, /Pit im Plan/);
  assert.match(source, /Aufmerksamkeit/);
  assert.match(source, /Handeln/);
  assert.match(source, /MIT AUF LOOP/);
  assert.match(source, /<span>FUELING<\/span>/);
  assert.doesNotMatch(source, /<summary><span>FUELING LOOP<\/span>/);
  assert.doesNotMatch(source, /<summary>\s*<span>FUELING PIT<\/span>/);
});

test("Pit Crew preparation stock persists independently from a live-session reset", () => {
  assert.match(source, /endurance-pit-crew-prep:/);
  assert.match(source, /window\.localStorage\.setItem\(prepStorageKey/);
  assert.match(source, /Vorrat & Startplan bleiben erhalten/);
  assert.doesNotMatch(source, /setStockTargets\(\{\}\);/);
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

test("demo reproduces the real race lifecycle from Pit Start instead of skipping Loop 1 intake", () => {
  assert.match(source, /const \[demoRound, setDemoRound\] = useState\(0\)/);
  assert.match(source, /started: demoStarted/);
  assert.match(source, /demoRound === 0 \? "Loop 1 starten/);
  assert.match(source, /disabled=\{!savedLoopReady \|\| \(demoRound > 0 && \(!arrivalState\.arrived \|\| checkInOpen\)\)\}/);
  assert.match(source, /weatherFallback/);
  assert.match(source, /weatherTargetRound/);
});



test("Pit Crew materializes the default suggestion when a loop is made start-ready instead of blanking the UI", () => {
  assert.match(source, /const plannedSelection = activeSelection\.map/);
  assert.match(source, /setSelection\(plannedSelection\);\s*setSelectionMode\("manual"\)/);
  assert.match(source, /tatsächliche Aufnahme wird bei Rückkehr bestätigt/);
});

test("return confirmation audits the complete planned intake, not only the carried drink", () => {
  assert.match(source, /plannedSelection: normalizedLiveSelection\(record\.plannedSelection\)/);
  assert.match(source, /const pendingIntakeSelection = pendingCarry/);
  assert.match(source, /Was vom kompletten Pit-\/Loop-Plan wurde tatsächlich eingenommen/);
  assert.match(source, /const consumedPlan = intakePlan\.flatMap/);
});

test("infrequent Pit Crew tools are nested and collapsible instead of filling the live view", () => {
  assert.match(source, /<summary><span>KH-BILANZ<\/span>/);
  assert.match(source, /<summary><span>TEST \/ DEMO<\/span>/);
  assert.match(source, /renderStockSection\(\)/);
  assert.match(source, /pit-live-tool-option/);
  const toolsIndex = source.indexOf('<summary><span>WERKZEUGE</span>');
  const stockCallIndex = source.indexOf('{renderStockSection()}', toolsIndex);
  const toolsEndIndex = source.indexOf('{saveMessage', toolsIndex);
  assert.ok(toolsIndex >= 0 && stockCallIndex > toolsIndex && stockCallIndex < toolsEndIndex);
});
