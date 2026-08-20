import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const plannerSource = fs.readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");

test("weekly planning separates normal availability from temporary life context in plain language", () => {
  assert.match(plannerSource, /Deine normale Trainingswoche/);
  assert.match(plannerSource, /Diese Woche anders als sonst\?/);
  assert.match(plannerSource, /Diese Angabe überstimmt deine normale Verfügbarkeit/);
  assert.match(plannerSource, /So berücksichtigt der Coach deine Woche/);
  assert.match(plannerSource, /Auswirkung auf den Plan/);
  assert.match(plannerSource, /Was muss der Coach für diese Woche wissen/);
  assert.doesNotMatch(plannerSource, /Als Tagesconstraint erkannt/);
  assert.doesNotMatch(plannerSource, /Tagesconstraint/);
});

test("race cards expose Auto, Race Protocol and Nur Wettkampf instead of forcing full support", () => {
  assert.match(plannerSource, />Auto<\/button>/);
  assert.match(plannerSource, />Race Protocol<\/button>/);
  assert.match(plannerSource, />Nur Wettkampf<\/button>/);
  assert.match(plannerSource, /Pre-Race Fueling/);
  assert.match(plannerSource, /Trink-Reminder/);
  assert.match(plannerSource, /Race-Day Activation/);
  assert.match(plannerSource, /Kalender-Erinnerungen/);
});

test("weekly view keeps the default scan calm and moves verbose detail behind disclosures", () => {
  assert.match(plannerSource, /planner-week-focus-card/);
  assert.match(plannerSource, /Wochenfokus/);
  assert.match(plannerSource, /<details className="planner-race-protocol"/);
  assert.match(plannerSource, /<details className=\{`planner-missed-session-inline/);
  assert.match(plannerSource, /<details className="planner-workout-notes"/);
  assert.match(plannerSource, /planner-availability-note-details/);
});


test("weekly overview names the affected unit and separates concrete volume from the coach corridor", () => {
  assert.match(plannerSource, /Wochenangabe betrifft eine Einheit/);
  assert.match(plannerSource, /Einheit ansehen/);
  assert.match(plannerSource, /Plan anpassen/);
  assert.doesNotMatch(plannerSource, />Auswirkung prüfen<\/button>/);
  assert.match(plannerSource, /<span>Wochenumfang<\/span>/);
  assert.match(plannerSource, /km erledigt · \{plannedKm/);
  assert.match(plannerSource, /Der normale Coach-Rahmen liegt aktuell bei/);
  assert.match(plannerSource, /kein Wochen-Soll/);
  assert.doesNotMatch(plannerSource, /<span><b>\{weekPrescription\?\.corridor\?\.label \|\| \(config\.lastTarget/);
});

test("track builder offers automatic and LAP-on-track control with an explicit Garmin preflight", () => {
  assert.match(plannerSource, /Steuerung des Hauptteils/);
  assert.match(plannerSource, />Automatisch</);
  assert.match(plannerSource, />LAP auf Bahn</);
  assert.match(plannerSource, /Distanzschritte enden erst mit LAP/);
  assert.match(plannerSource, /Garmin-Check offen/);
  assert.match(plannerSource, /confirmTrackOnGarmin/);
  assert.match(plannerSource, /Sync erneut anstoßen/);
  assert.match(plannerSource, /EI kann die Übergabe an Intervals\.icu bestätigen, aber nicht sehen, ob Garmin Connect/);
});

test("cross-training UI separates total load from running kilometres and waits for reviews", () => {
  assert.match(plannerSource, /Zusatzlast/);
  assert.match(plannerSource, /nicht in Laufkilometer umgerechnet/);
  assert.match(plannerSource, /Erst Reaktion verstehen, dann planen/);
  assert.match(plannerSource, /EI kürzt deshalb noch keinen Lauf/);
  assert.doesNotMatch(plannerSource, /Planersatz/);
  assert.doesNotMatch(plannerSource, /bis zu <strong>\{crossTrainingPreview\.creditKm/);
});
