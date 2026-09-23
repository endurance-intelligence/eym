import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");

test("Pit Crew keeps test controls out of the normal live flow", () => {
  assert.doesNotMatch(source, /pit-live-demo-panel/);
  assert.match(source, /WERKZEUGE/);
  assert.match(source, /Testmodus starten/);
});

test("Pit Crew confirms pit intake before start-ready and books carried fuel only after return", () => {
  assert.match(source, /pitIntakeMode === "planned"/);
  assert.match(source, /Was wurde im Pit wirklich eingenommen/);
  assert.match(source, /BESTÄTIGEN & STARTKLAR/);
  assert.match(source, /arrivalIntakeMode === "planned"/);
  assert.match(source, /confirmPendingCarry\("planned"\)/);
  assert.match(source, /record\.carryStatus !== "pending" \|\| normalizedLiveSelection\(record\.selection\)\.length > 0/);
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


test("athlete pre-feedback suppresses duplicate crew check-in and flows into SPOT instead of a separate crew banner", () => {
  assert.match(source, /if \(incomingApplies\)/);
  assert.match(source, /setCheckInOpen\(Boolean\(pendingCarry/);
  assert.match(source, /ATHLETE-MELDUNG · LOOP/);
  assert.match(source, /pit-live-spot-athlete-signal/);
  assert.doesNotMatch(source, /RÜCKMELDUNG CREW/);
});

test("Pit Crew headline names the upcoming loop weather and keeps confirmed intake in the main plan card", () => {
  assert.match(source, /WETTER · LOOP/);
  assert.match(source, /KOMMENDER LOOP/);
  assert.match(source, /pit-live-weather-summary/);
  assert.match(source, /pit-live-weather-summary-compact/);
  assert.match(source, /Regen \${primaryLoopWeather\.precipitationProbability} %/);
  assert.match(source, /Wind \${primaryLoopWeather\.windSpeed} km\/h/);
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

test("Athlet zurück combines status and only the carried loop intake in one return sheet", () => {
  assert.match(source, /AUF DER RUNDE · LOOP/);
  assert.match(source, /Alles wie geplant/);
  assert.match(source, /½ Teilweise/);
  assert.match(source, /○ Nichts/);
  assert.match(source, /RÜCKKEHR ÜBERNEHMEN/);
  assert.match(source, /Die Crew muss den Status nicht erneut eingeben/);
});

test("Pit Crew uses one sticky return action and simplifies single-item intake", () => {
  assert.match(source, /Bei Rückkehr unten einmal „Athlet zurück“ tippen/);
  assert.doesNotMatch(source, /<button type="button" onClick=\{markAthleteReturned\}>ATHLET ZURÜCK/);
  assert.match(source, /onClick=\{athleteNeedsArrival \? markAthleteReturned : requestPitReady\}/);
  assert.match(source, /const singleArrivalItem = arrivalPendingItems\.length === 1/);
  assert.match(source, /singleArrivalItem \? "✓ Komplett" : "✓ Alles wie geplant"/);
  assert.match(source, /arrivalPendingItems\.length > 1/);
  assert.match(source, /confirmPendingCarry\(arrivalPendingItems\.length === 1 \? "half" : "rated"\)/);
});


test("Pit Crew live view keeps the current plan glanceable and removes duplicate top-level fueling", () => {
  assert.match(source, /Pit: Loop/);
  assert.match(source, /Pit: Start/);
  assert.match(source, /ATHLETE STATUS/);
  assert.match(source, /SPOT · MANUELL ANGEPASST/);
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
  assert.match(source, /safePitCrewStorageWrite\(prepStorageKey/);
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
  assert.match(raceCoachSource, /pitCrewShareValidated \? "Crew-Link teilen" : "Crew-Link wird geprüft …"/);
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

test("demo reproduces the real race lifecycle from Pit Start and can be synchronized through shared state", () => {
  assert.match(source, /const \[demoRound, setDemoRound\] = useState\(\(\) => sharedMode/);
  assert.match(source, /demoActive,/);
  assert.match(source, /demoMinutesToStart,/);
  assert.match(source, /liveSnapshot: demoActive \? liveSnapshotBeforeDemo\.current : null/);
  assert.match(source, /started: demoStarted/);
  assert.match(source, /demoRound === 0 \? "Loop 1 starten/);
  assert.match(source, /disabled=\{!savedLoopReady \|\| \(demoRound > 0 && \(!arrivalState\.arrived \|\| checkInOpen\)\)\}/);
  assert.match(source, /weatherFallback/);
  assert.match(source, /weatherTargetRound/);
});



test("Pit Crew materializes the default suggestion and immediately records confirmed pit intake", () => {
  assert.match(source, /const plannedSelection = activeSelection\.map/);
  assert.match(source, /const actualPitSelection =/);
  assert.match(source, /pitConfirmedAt:/);
  assert.match(source, /setSelection\(plannedSelection\);\s*setSelectionMode\("manual"\)/);
  assert.match(source, /Loop-Verpflegung wird erst bei Rückkehr als IST gebucht/);
});

test("return confirmation audits only carried fuel because pit intake was already confirmed before departure", () => {
  assert.match(source, /const pendingIntakeSelection = pendingCarry/);
  assert.match(source, /normalizedLiveSelection\(pendingCarry\.carrySelection\)/);
  assert.match(source, /Was von der mitgegebenen Loop-Verpflegung wurde tatsächlich eingenommen/);
  assert.match(source, /const confirmedPit = normalizedLiveSelection\(record\.selection\)/);
  assert.match(source, /actualSelection = \[\.\.\.confirmedPit, \.\.\.consumedPlan/);
});

test("start-ready can be undone before the loop starts without deleting the selected plan", () => {
  assert.match(source, /function undoReadyPit\(\)/);
  assert.match(source, /Startklar aufgehoben/);
  assert.match(source, /className="pit-live-ready-undo"/);
  assert.match(source, />×<span>ändern<\/span>/);
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


test("Pit Crew turns missing active stock into a one-tap copyable shopping list", () => {
  assert.match(source, /EINKAUFSLISTE/);
  assert.match(source, /Einkaufsliste kopieren/);
  assert.match(source, /shoppingItems = startStockPlan\.items\.flatMap/);
  assert.match(source, /activeStockIds\.includes/);
  assert.match(source, /item\.missing/);
  assert.match(source, /copyPrepText/);
  assert.match(source, /navigator\?\.clipboard\?\.writeText/);
  assert.match(source, /document\.execCommand\("copy"\)/);
});

test("Pit Crew provides an event-persistent packing checklist with missing-item copy", () => {
  assert.match(source, /buildPitCrewPackingList/);
  assert.match(source, /packingChecked/);
  assert.match(source, /<summary><span>PACKLISTE<\/span>/);
  assert.match(source, /Fehlendes kopieren/);
  assert.match(source, /Packliste komplett/);
  assert.match(source, /packingChecked, customProducts/);
  assert.match(source, /Pack-Haken zurücksetzen/);
});

test("legacy Cola litre stock is converted to 330 ml cans for the new inventory unit", () => {
  assert.match(source, /id === "cola"/);
  assert.match(source, /override\.unit/);
  assert.match(source, /\/ 330/);
});


test("Pit Crew asks for a deliberate caffeine source instead of silently adding caffeine", () => {
  assert.match(source, /<small>KOFFEIN<\/small>/);
  assert.match(source, /○ Keins/);
  assert.match(source, /160 mg/);
  assert.match(source, /≈14 mg/);
  assert.match(source, /Red Bull/);
  assert.match(source, /32 mg/);
  assert.match(source, /selectCaffeineOption/);
  assert.match(source, /KOFFEIN DIESE RUNDE/);
  assert.match(source, /Ø 3 h/);
});

test("race cockpit keeps athlete status and care inside tools while actions stay in the main pit card", () => {
  assert.match(source, /<summary><span>WERKZEUGE<\/span>/);
  assert.match(source, /pit-live-status-tool/);
  assert.match(source, /renderAthleteCareSection\(\{ asTool: true \}\)/);
  assert.doesNotMatch(source, /\{renderAthleteCareSection\(\)\}/);
  assert.match(source, /crewOverviewActions/);
  assert.match(source, /athleteCare\.hints\.map/);
});

test("fueling cockpit shows active stock but disables products that are not actually on hand", () => {
  assert.match(source, /inventoryTrackingActive/);
  assert.match(source, /availableNowStockIds/);
  assert.match(source, /const products = activeProducts\.filter/);
  assert.match(source, /nicht im Vorrat/);
  assert.match(source, /disabled=\{!inStock\}/);
  assert.match(source, /pit-live-fueling-dashboard/);
});

test("shared Pit Crew can hide the destructive exit button and display sync state", () => {
  assert.match(source, /onClose = null, syncStatus = "", sharedMode = false/);
  assert.match(source, /\{onClose && <button/);
  assert.match(source, /pit-live-sync-state/);
  assert.match(source, /Zurück zu EI/);
});

test("Pit Crew keeps athlete hints active until explicit relief and shows them in the command card", () => {
  assert.match(source, /statusSinceRound/);
  assert.match(source, /BLEIBEN AKTIV BIS ENTWARNUNG/);
  assert.match(source, /seit Loop/);
  assert.match(source, /antippen = Entwarnung/);
  assert.match(source, /ALLES AUF EINEN BLICK/);
  assert.match(source, /crewActionGroups/);
});

test("Pit Crew mobile return check-in is a full-screen work step instead of a bottom sheet", () => {
  const css = fs.readFileSync(new URL("../src/components/PitCrewLive.css", import.meta.url), "utf8");
  assert.match(css, /height:100dvh/);
  assert.match(css, /backdrop-filter:none/);
  assert.match(css, /pit-live-checkin-actions\{position:sticky/);
});


test("SPOT owns weather and keeps the breakfast-backed first loop visually quiet", () => {
  assert.match(source, /SPOT · IDEALVORSCHLAG/);
  assert.match(source, /const isStartLoopPlan = !timing\.started && readyLoopNumber === 1/);
  const spotIndex = source.indexOf("SPOT · IDEALVORSCHLAG");
  const weatherIndex = source.indexOf("pit-live-spot-weather");
  assert.ok(weatherIndex > spotIndex, "weather disclosure should render inside SPOT");
  assert.doesNotMatch(source, /Startversorgung · Frühstück als Basis/);
  assert.doesNotMatch(source, /Frühstück deckt die Basis/);
});
