import { readFile, writeFile } from "node:fs/promises";

const appPath = new URL("../src/App.jsx", import.meta.url);
let source = await readFile(appPath, "utf8");

const importLine = 'import PitCrewSharedSession from "./components/PitCrewSharedSession";';
const tokenLine = '  const sharedPitCrewToken = new URLSearchParams(window.location.search).get("crew");';
const returnLine = '  if (sharedPitCrewToken) return <PitCrewSharedSession token={sharedPitCrewToken} />;';

function fail(message) {
  console.error(`Pit Crew entry patch failed: ${message}`);
  process.exit(1);
}

if (!source.includes(importLine)) {
  const authImportPatterns = [
    /import Auth from ["']\.\/pages\/Auth["'];?\r?\n/,
    /import ErrorBoundary from ["']\.\/components\/ErrorBoundary["'];?\r?\n/,
  ];
  let inserted = false;
  for (const pattern of authImportPatterns) {
    const match = source.match(pattern);
    if (!match) continue;
    source = source.replace(pattern, `${match[0]}${importLine}\n`);
    inserted = true;
    break;
  }
  if (!inserted) {
    const imports = [...source.matchAll(/^import .*;\r?$/gm)];
    const last = imports.at(-1);
    if (!last) fail("keine Import-Zeile in src/App.jsx gefunden");
    const position = last.index + last[0].length;
    source = `${source.slice(0, position)}\n${importLine}${source.slice(position)}`;
  }
}

if (!source.includes(tokenLine) || !source.includes(returnLine)) {
  const hookPattern = /(export default function App\(\) \{[\s\S]*?^\s*const \{[^\n]*\} = useApp\(\);\r?\n)/m;
  const hookMatch = source.match(hookPattern);
  if (hookMatch) {
    source = source.replace(hookPattern, `${hookMatch[1]}${tokenLine}\n${returnLine}\n`);
  } else {
    const functionPattern = /export default function App\(\) \{\r?\n/;
    const functionMatch = source.match(functionPattern);
    if (!functionMatch) fail("App()-Funktion nicht gefunden");
    source = source.replace(functionPattern, `${functionMatch[0]}${tokenLine}\n${returnLine}\n`);
  }
}

const importCount = source.split(importLine).length - 1;
const tokenCount = source.split(tokenLine).length - 1;
const returnCount = source.split(returnLine).length - 1;
if (importCount !== 1 || tokenCount !== 1 || returnCount !== 1) {
  fail(`unerwarteter Zielstand (Import ${importCount}, Token ${tokenCount}, Return ${returnCount})`);
}

await writeFile(appPath, source, "utf8");
console.log("Pit Crew entry in src/App.jsx aktiviert.");
