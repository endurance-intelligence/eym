import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("add and edit workflows use modal editors instead of hidden inline cards", () => {
  const mission = source("../src/pages/Mission.jsx");
  const fuel = source("../src/pages/Fuel.jsx");
  const equipment = source("../src/pages/Equipment.jsx");

  assert.match(mission, /<EditorModal[\s\S]*mission-editor-modal/);
  assert.match(fuel, /<EditorModal[\s\S]*fuel-product-editor-modal/);
  assert.match(equipment, /<EditorModal[\s\S]*equipment-editor-modal/);
  assert.doesNotMatch(fuel, /scrollIntoView/);
  assert.doesNotMatch(mission, /window\.scrollTo/);
});

test("exercise management has a dedicated route and workspace", () => {
  const app = source("../src/App.jsx");
  const coach = source("../src/pages/Coach.jsx");
  const exercises = source("../src/pages/Exercises.jsx");

  assert.match(app, /path="coach\/exercises"/);
  assert.match(coach, /to="\/coach\/exercises"/);
  assert.match(exercises, /title="Übungen"/);
  assert.match(exercises, /Persönliche Übungszentrale/);
});

test("mobility workout page no longer renders the full exercise library inline", () => {
  const coach = source("../src/pages/Coach.jsx");

  assert.doesNotMatch(coach, /className="wide exercise-library-card"/);
  assert.doesNotMatch(coach, /Übung aus Reel oder Video hinzufügen/);
  assert.match(coach, /Physio, Favoriten und Reel-Übungen separat verwalten/);
});

test("editor modal focuses only when it opens and keeps focus while controlled fields rerender", () => {
  const modal = source("../src/components/EditorModal.jsx");

  assert.match(modal, /const onCloseRef = useRef\(onClose\)/);
  assert.match(modal, /onCloseRef\.current = onClose/);
  assert.match(modal, /useEffect\(\(\) => \{[\s\S]*requestAnimationFrame[\s\S]*\}, \[\]\)/);
});

test("mission editor separates provider search from the editable event name", () => {
  const mission = source("../src/pages/Mission.jsx");

  assert.match(mission, /const \[eventSearchQuery, setEventSearchQuery\] = useState\(""\)/);
  assert.match(mission, /<EventAutocomplete[\s\S]*value=\{eventSearchQuery\}[\s\S]*onChange=\{setEventSearchQuery\}/);
  assert.match(mission, /Eventname<input name="name" value=\{draft\.name\}/);
  assert.doesNotMatch(mission, /<EventAutocomplete[\s\S]{0,250}value=\{draft\.name\}/);
});
