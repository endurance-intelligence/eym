import { useModalScrollLock } from "../services/modalScrollLock";
import {
  equipmentLabel,
  exerciseVideoSearchUrl,
  focusAreaLabel,
} from "../services/mobilityWorkouts";

const EXERCISE_SEARCH_TAB = "eym-exercise-search";
const EXERCISE_SEARCH_WINDOW_KEY = "__eymExerciseSearchWindow";

function openExerciseSearch(event, url) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();

  const existingWindow = window[EXERCISE_SEARCH_WINDOW_KEY];
  try {
    if (existingWindow && !existingWindow.closed) {
      existingWindow.location.href = url;
      existingWindow.focus();
      return;
    }
  } catch {
    window[EXERCISE_SEARCH_WINDOW_KEY] = null;
  }

  const searchWindow = window.open(url, EXERCISE_SEARCH_TAB);
  if (!searchWindow) return;
  window[EXERCISE_SEARCH_WINDOW_KEY] = searchWindow;
  searchWindow.focus();
}

function StickFigure({ head = [50, 25], joints = {}, className = "" }) {
  const point = (key, fallback) => joints[key] || fallback;
  const neck = point("neck", [50, 43]);
  const hip = point("hip", [50, 82]);
  const leftShoulder = point("leftShoulder", [38, 47]);
  const rightShoulder = point("rightShoulder", [62, 47]);
  const leftHand = point("leftHand", [26, 72]);
  const rightHand = point("rightHand", [74, 72]);
  const leftFoot = point("leftFoot", [36, 122]);
  const rightFoot = point("rightFoot", [64, 122]);
  return (
    <g className={className}>
      <circle cx={head[0]} cy={head[1]} r="9" />
      <line x1={neck[0]} y1={neck[1]} x2={hip[0]} y2={hip[1]} />
      <line x1={leftShoulder[0]} y1={leftShoulder[1]} x2={rightShoulder[0]} y2={rightShoulder[1]} />
      <line x1={leftShoulder[0]} y1={leftShoulder[1]} x2={leftHand[0]} y2={leftHand[1]} />
      <line x1={rightShoulder[0]} y1={rightShoulder[1]} x2={rightHand[0]} y2={rightHand[1]} />
      <line x1={hip[0]} y1={hip[1]} x2={leftFoot[0]} y2={leftFoot[1]} />
      <line x1={hip[0]} y1={hip[1]} x2={rightFoot[0]} y2={rightFoot[1]} />
    </g>
  );
}

function Panel({ label, children }) {
  return (
    <g>
      <rect x="2" y="2" width="146" height="146" rx="16" />
      <text x="14" y="22">{label}</text>
      {children}
    </g>
  );
}

function ExerciseVisual({ visual }) {
  if (visual === "dead-bug") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Dead Bug: Startposition und diagonales Absenken">
        <Panel label="START">
          <g className="pose" transform="translate(12 12)">
            <circle cx="24" cy="77" r="8" /><line x1="32" y1="78" x2="78" y2="78" />
            <line x1="54" y1="78" x2="54" y2="40" /><line x1="54" y1="40" x2="54" y2="20" />
            <line x1="72" y1="78" x2="90" y2="55" /><line x1="90" y1="55" x2="90" y2="30" />
            <line x1="72" y1="78" x2="108" y2="78" /><line x1="108" y1="78" x2="108" y2="48" />
          </g>
        </Panel>
        <g transform="translate(150 0)">
          <Panel label="BEWEGUNG">
            <g className="pose motion" transform="translate(12 12)">
              <circle cx="24" cy="77" r="8" /><line x1="32" y1="78" x2="78" y2="78" />
              <line x1="54" y1="78" x2="28" y2="38" /><line x1="54" y1="78" x2="54" y2="20" />
              <line x1="72" y1="78" x2="108" y2="108" /><line x1="72" y1="78" x2="108" y2="48" />
            </g>
          </Panel>
        </g>
      </svg>
    );
  }
  if (visual === "bird-dog") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Bird Dog: Vierfüßlerstand und diagonales Strecken">
        <Panel label="START">
          <g className="pose" transform="translate(9 12)">
            <circle cx="103" cy="51" r="8" /><line x1="93" y1="58" x2="54" y2="66" />
            <line x1="80" y1="62" x2="82" y2="104" /><line x1="55" y1="66" x2="42" y2="104" />
            <line x1="52" y1="66" x2="62" y2="102" /><line x1="88" y1="60" x2="105" y2="102" />
            <line x1="27" y1="105" x2="116" y2="105" className="ground" />
          </g>
        </Panel>
        <g transform="translate(150 0)">
          <Panel label="STRECKEN">
            <g className="pose motion" transform="translate(9 12)">
              <circle cx="103" cy="51" r="8" /><line x1="93" y1="58" x2="54" y2="66" />
              <line x1="80" y1="62" x2="119" y2="42" /><line x1="55" y1="66" x2="42" y2="104" />
              <line x1="52" y1="66" x2="15" y2="58" /><line x1="88" y1="60" x2="105" y2="102" />
              <line x1="27" y1="105" x2="116" y2="105" className="ground" />
            </g>
          </Panel>
        </g>
      </svg>
    );
  }
  if (visual === "adductor-rockback") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Adduktoren-Rockback: Bein seitlich und Becken nach hinten">
        <Panel label="START">
          <g className="pose" transform="translate(8 12)">
            <circle cx="97" cy="49" r="8" /><line x1="88" y1="56" x2="58" y2="65" />
            <line x1="80" y1="60" x2="100" y2="103" /><line x1="58" y1="65" x2="47" y2="103" />
            <line x1="58" y1="66" x2="18" y2="94" /><line x1="58" y1="66" x2="70" y2="103" />
            <line x1="15" y1="104" x2="119" y2="104" className="ground" />
          </g>
        </Panel>
        <g transform="translate(150 0)">
          <Panel label="NACH HINTEN">
            <g className="pose motion" transform="translate(8 12)">
              <circle cx="77" cy="54" r="8" /><line x1="68" y1="61" x2="39" y2="71" />
              <line x1="60" y1="65" x2="92" y2="103" /><line x1="39" y1="71" x2="47" y2="103" />
              <line x1="39" y1="71" x2="10" y2="96" /><line x1="39" y1="71" x2="70" y2="103" />
              <line x1="8" y1="104" x2="119" y2="104" className="ground" />
            </g>
          </Panel>
        </g>
      </svg>
    );
  }
  if (visual === "cat-cow") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Katze-Kuh: Rundrücken und sanfte Streckung">
        <Panel label="KATZE">
          <g className="pose" transform="translate(10 10)">
            <circle cx="104" cy="61" r="8" /><path d="M94 65 Q68 36 42 68" />
            <line x1="88" y1="61" x2="102" y2="105" /><line x1="45" y1="65" x2="35" y2="105" />
            <line x1="48" y1="66" x2="58" y2="105" /><line x1="82" y1="57" x2="85" y2="105" />
            <line x1="25" y1="106" x2="116" y2="106" className="ground" />
          </g>
        </Panel>
        <g transform="translate(150 0)">
          <Panel label="KUH">
            <g className="pose motion" transform="translate(10 10)">
              <circle cx="108" cy="49" r="8" /><path d="M98 58 Q68 84 42 65" />
              <line x1="89" y1="62" x2="102" y2="105" /><line x1="45" y1="65" x2="35" y2="105" />
              <line x1="48" y1="66" x2="58" y2="105" /><line x1="82" y1="65" x2="85" y2="105" />
              <line x1="25" y1="106" x2="116" y2="106" className="ground" />
            </g>
          </Panel>
        </g>
      </svg>
    );
  }
  if (visual === "ankle-circles") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Fußkreisen: Sprunggelenk kontrolliert in beide Richtungen bewegen">
        <Panel label="FUSS RUHIG">
          <g className="pose" transform="translate(18 15)">
            <line x1="36" y1="35" x2="67" y2="79" /><line x1="67" y1="79" x2="110" y2="79" />
            <circle cx="67" cy="79" r="7" className="joint" /><line x1="22" y1="108" x2="118" y2="108" className="ground" />
          </g>
        </Panel>
        <g transform="translate(150 0)">
          <Panel label="KREISEN">
            <g className="pose motion" transform="translate(18 15)">
              <line x1="36" y1="35" x2="67" y2="79" /><line x1="67" y1="79" x2="104" y2="56" />
              <circle cx="67" cy="79" r="7" className="joint" /><path d="M91 43 A30 30 0 1 1 84 101" className="arrow" />
            </g>
          </Panel>
        </g>
      </svg>
    );
  }

  if (visual === "ankle-pumps") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Fußwippe: Fußspitze zum Schienbein ziehen und danach nach vorn strecken">
        <Panel label="FUSSSPITZE HOCH"><g className="pose" transform="translate(13 12)"><line x1="42" y1="31" x2="67" y2="82" /><line x1="67" y1="82" x2="99" y2="54" /><circle cx="67" cy="82" r="6" className="joint" /><path d="M92 86 A27 27 0 0 0 101 60" className="arrow" /><line x1="22" y1="112" x2="122" y2="112" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="FUSS NACH VORN"><g className="pose motion" transform="translate(13 12)"><line x1="42" y1="31" x2="67" y2="82" /><line x1="67" y1="82" x2="111" y2="89" /><circle cx="67" cy="82" r="6" className="joint" /><path d="M94 54 A31 31 0 0 1 111 81" className="arrow" /><line x1="22" y1="112" x2="122" y2="112" className="ground" /></g></Panel></g>
      </svg>
    );
  }

  if (visual === "pallof-press") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Pallof Press: seitlich zum Band stehen und Hände nach vorn drücken">
        <Panel label="HÄNDE AN BRUST">
          <g className="pose" transform="translate(8 9)">
            <line x1="8" y1="68" x2="45" y2="68" className="band-line" /><circle cx="79" cy="28" r="8" />
            <line x1="79" y1="37" x2="79" y2="84" /><line x1="64" y1="50" x2="46" y2="68" /><line x1="94" y1="50" x2="47" y2="68" />
            <line x1="79" y1="84" x2="62" y2="122" /><line x1="79" y1="84" x2="96" y2="122" /><line x1="20" y1="123" x2="118" y2="123" className="ground" />
          </g>
        </Panel>
        <g transform="translate(150 0)"><Panel label="GERADE VOR DRÜCKEN"><g className="pose motion" transform="translate(8 9)">
          <line x1="8" y1="68" x2="77" y2="68" className="band-line" /><circle cx="79" cy="28" r="8" />
          <line x1="79" y1="37" x2="79" y2="84" /><line x1="64" y1="50" x2="108" y2="68" /><line x1="94" y1="50" x2="108" y2="68" />
          <line x1="79" y1="84" x2="62" y2="122" /><line x1="79" y1="84" x2="96" y2="122" /><line x1="20" y1="123" x2="118" y2="123" className="ground" />
        </g></Panel></g>
      </svg>
    );
  }
  if (visual === "plank") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Unterarmstütz: Ellenbogen unter den Schultern und Körper in einer geraden Linie">
        <Panel label="AUFBAU"><g className="pose" transform="translate(7 12)"><circle cx="36" cy="57" r="8" /><line x1="44" y1="61" x2="93" y2="79" /><line x1="93" y1="79" x2="123" y2="98" /><line x1="52" y1="64" x2="43" y2="103" /><line x1="43" y1="103" x2="20" y2="103" /><line x1="17" y1="105" x2="128" y2="105" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="GERADE HALTEN"><g className="pose motion" transform="translate(7 12)"><circle cx="31" cy="58" r="8" /><line x1="39" y1="62" x2="87" y2="72" /><line x1="87" y1="72" x2="126" y2="86" /><line x1="47" y1="64" x2="42" y2="103" /><line x1="42" y1="103" x2="19" y2="103" /><line x1="17" y1="105" x2="130" y2="105" className="ground" /><path d="M38 50 L126 75" className="guide-line" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "side-plank") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Seitstütz: seitlich auf dem Unterarm abstützen und Becken anheben">
        <Panel label="SEITLAGE"><g className="pose" transform="translate(9 11)"><circle cx="32" cy="63" r="8" /><line x1="40" y1="66" x2="88" y2="88" /><line x1="88" y1="88" x2="123" y2="102" /><line x1="48" y1="70" x2="38" y2="104" /><line x1="17" y1="105" x2="128" y2="105" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="BECKEN HOCH"><g className="pose motion" transform="translate(9 11)"><circle cx="32" cy="47" r="8" /><line x1="40" y1="52" x2="87" y2="72" /><line x1="87" y1="72" x2="126" y2="91" /><line x1="48" y1="56" x2="38" y2="104" /><line x1="17" y1="105" x2="130" y2="105" className="ground" /><path d="M39 45 L126 83" className="guide-line" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "glute-bridge") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Glute Bridge: Rückenlage und Becken anheben">
        <Panel label="RÜCKENLAGE"><g className="pose" transform="translate(9 12)"><circle cx="25" cy="91" r="8" /><line x1="33" y1="91" x2="79" y2="91" /><line x1="79" y1="91" x2="99" y2="67" /><line x1="99" y1="67" x2="121" y2="103" /><line x1="17" y1="105" x2="128" y2="105" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="BECKEN HOCH"><g className="pose motion" transform="translate(9 12)"><circle cx="25" cy="91" r="8" /><line x1="33" y1="91" x2="80" y2="69" /><line x1="80" y1="69" x2="101" y2="67" /><line x1="101" y1="67" x2="121" y2="103" /><line x1="17" y1="105" x2="128" y2="105" className="ground" /><path d="M38 87 L100 59" className="guide-line" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "clamshell") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Clamshell: Seitlage, Füße zusammen und oberes Knie öffnen">
        <Panel label="KNIE GESCHLOSSEN"><g className="pose" transform="translate(10 12)"><circle cx="28" cy="64" r="8" /><line x1="36" y1="67" x2="78" y2="79" /><line x1="78" y1="79" x2="105" y2="96" /><line x1="78" y1="79" x2="104" y2="96" /><line x1="15" y1="105" x2="128" y2="105" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="OBERES KNIE ÖFFNEN"><g className="pose motion" transform="translate(10 12)"><circle cx="28" cy="64" r="8" /><line x1="36" y1="67" x2="78" y2="79" /><line x1="78" y1="79" x2="105" y2="96" /><line x1="78" y1="79" x2="94" y2="48" /><line x1="94" y1="48" x2="105" y2="96" /><line x1="15" y1="105" x2="128" y2="105" className="ground" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "knee-to-wall") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Knie-zur-Wand: Fuß flach, Knie zur Wand, Ferse bleibt unten">
        <Panel label="FUSS VOR DIE WAND"><g className="pose" transform="translate(7 10)"><line x1="113" y1="24" x2="113" y2="122" className="wall" /><line x1="36" y1="117" x2="92" y2="117" /><line x1="49" y1="117" x2="63" y2="72" /><line x1="63" y1="72" x2="78" y2="42" /><circle cx="80" cy="32" r="8" /><circle cx="63" cy="72" r="5" className="joint" /><line x1="17" y1="123" x2="128" y2="123" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="KNIE ZUR WAND"><g className="pose motion" transform="translate(7 10)"><line x1="113" y1="24" x2="113" y2="122" className="wall" /><line x1="36" y1="117" x2="92" y2="117" /><line x1="49" y1="117" x2="106" y2="72" /><line x1="106" y1="72" x2="84" y2="42" /><circle cx="82" cy="32" r="8" /><circle cx="106" cy="72" r="5" className="joint" /><circle cx="49" cy="117" r="4" className="heel-marker" /><line x1="17" y1="123" x2="128" y2="123" className="ground" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "short-foot") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Fußgewölbe aktivieren: Zehen lang lassen und Großzehenballen sanft zur Ferse ziehen">
        <Panel label="FUSS ENTSPANNT"><g className="pose" transform="translate(8 13)"><path d="M18 91 Q55 86 101 94 Q116 97 125 91" /><circle cx="25" cy="92" r="5" className="joint" /><circle cx="116" cy="93" r="5" className="joint" /><line x1="15" y1="105" x2="130" y2="105" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="GEWÖLBE HEBT SICH"><g className="pose motion" transform="translate(8 13)"><path d="M18 91 Q55 64 101 92 Q116 97 125 91" /><circle cx="25" cy="92" r="5" className="joint" /><circle cx="116" cy="93" r="5" className="joint" /><path d="M105 76 L45 76" className="arrow" /><line x1="15" y1="105" x2="130" y2="105" className="ground" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "clock-reach") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Einbeinstand mit Uhrzeiger-Tippen: freier Fuß tippt nach vorn, seitlich und hinten">
        <Panel label="STABIL STEHEN"><g className="pose" transform="translate(19 8)"><StickFigure joints={{ leftFoot: [49, 121], rightFoot: [78, 82], hip: [52, 78] }} /><circle cx="49" cy="121" r="5" className="joint" /><line x1="14" y1="124" x2="116" y2="124" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="ANTIPPEN"><g className="pose motion" transform="translate(13 8)"><StickFigure joints={{ leftFoot: [48, 121], rightFoot: [111, 111], hip: [52, 78] }} /><path d="M83 91 Q104 80 119 95" className="arrow" /><path d="M82 102 Q105 112 117 120" className="guide-line" /><line x1="14" y1="124" x2="127" y2="124" className="ground" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "band-ankle-inversion") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Sprunggelenk mit Band nach innen: Unterschenkel still und Vorfuß zur Körpermitte bewegen">
        <Panel label="BAND ZIEHT NACH AUSSEN"><g className="pose" transform="translate(9 11)"><line x1="64" y1="24" x2="64" y2="78" /><path d="M64 78 L25 91" /><line x1="25" y1="91" x2="129" y2="91" className="band-line" /><circle cx="64" cy="78" r="6" className="joint" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="FUSS NACH INNEN"><g className="pose motion" transform="translate(9 11)"><line x1="64" y1="24" x2="64" y2="78" /><path d="M64 78 L22 62" /><line x1="22" y1="62" x2="129" y2="91" className="band-line" /><circle cx="64" cy="78" r="6" className="joint" /><path d="M38 91 A28 28 0 0 1 21 69" className="arrow" /></g></Panel></g>
      </svg>
    );
  }
  if (visual === "band-ankle-dorsiflexion") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Sprunggelenk mit Band nach oben: Ferse ruhig und Fußspitze zum Schienbein ziehen">
        <Panel label="BAND VOR DEM FUSS"><g className="pose" transform="translate(9 11)"><line x1="42" y1="28" x2="69" y2="82" /><path d="M69 82 L110 91" /><line x1="110" y1="91" x2="137" y2="91" className="band-line" /><circle cx="69" cy="82" r="6" className="joint" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="FUSSSPITZE HOCH"><g className="pose motion" transform="translate(9 11)"><line x1="42" y1="28" x2="69" y2="82" /><path d="M69 82 L99 52" /><line x1="99" y1="52" x2="137" y2="91" className="band-line" /><circle cx="69" cy="82" r="6" className="joint" /><path d="M104 83 A30 30 0 0 0 101 58" className="arrow" /></g></Panel></g>
      </svg>
    );
  }

  if (visual === "band-ankle") {
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Sprunggelenk mit Band nach außen: Unterschenkel still und Vorfuß gegen den Zug nach außen bewegen">
        <Panel label="BAND ZIEHT NACH INNEN"><g className="pose" transform="translate(9 11)"><line x1="64" y1="24" x2="64" y2="78" /><path d="M64 78 L104 91" /><line x1="15" y1="91" x2="104" y2="91" className="band-line" /><circle cx="64" cy="78" r="6" className="joint" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="FUSS NACH AUSSEN"><g className="pose motion" transform="translate(9 11)"><line x1="64" y1="24" x2="64" y2="78" /><path d="M64 78 L111 63" /><line x1="15" y1="91" x2="111" y2="63" className="band-line" /><circle cx="64" cy="78" r="6" className="joint" /><path d="M90 91 A28 28 0 0 0 109 70" className="arrow" /></g></Panel></g>
      </svg>
    );
  }

  if (["calf-raise", "single-leg-calf-raise", "tibialis-raise", "single-leg-balance"].includes(visual)) {
    const endJoints = visual === "calf-raise"
      ? { leftFoot: [40, 112], rightFoot: [66, 112], hip: [53, 73] }
      : visual === "single-leg-calf-raise"
        ? { leftFoot: [48, 112], rightFoot: [82, 82], hip: [52, 72] }
        : visual === "single-leg-balance"
        ? { leftFoot: [48, 120], rightFoot: [82, 82], hip: [52, 78] }
        : visual === "knee-to-wall"
          ? { leftFoot: [28, 120], rightFoot: [83, 120], hip: [67, 80], leftHand: [100, 62], rightHand: [102, 78] }
          : { leftFoot: [34, 116], rightFoot: [70, 116], hip: [52, 80] };
    return (
      <svg viewBox="0 0 300 150" role="img" aria-label="Start- und Endposition der Übung">
        <Panel label="START"><g className="pose" transform="translate(22 8)"><StickFigure /><line x1="14" y1="124" x2="116" y2="124" className="ground" /></g></Panel>
        <g transform="translate(150 0)"><Panel label="BEWEGUNG"><g className="pose motion" transform="translate(22 8)"><StickFigure joints={endJoints} /><line x1="14" y1="124" x2="116" y2="124" className="ground" /></g></Panel></g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 300 150" role="img" aria-label="Schematische Start- und Endposition">
      <Panel label="START"><g className="pose" transform="translate(22 8)"><StickFigure /><line x1="14" y1="124" x2="116" y2="124" className="ground" /></g></Panel>
      <g transform="translate(150 0)"><Panel label="KONTROLLIERT"><g className="pose motion" transform="translate(22 8)"><StickFigure joints={{ leftHand: [18, 58], rightFoot: [86, 108] }} /><line x1="14" y1="124" x2="116" y2="124" className="ground" /></g></Panel></g>
    </svg>
  );
}

export function ExerciseGuideButton({ exercise, onOpen, compact = false }) {
  return (
    <button type="button" className={`exercise-guide-button ${compact ? "compact" : ""}`} onClick={() => onOpen(exercise)}>
      Anleitung
    </button>
  );
}

export default function ExerciseGuide({ exercise, onClose, known = false, knownLocked = false, onToggleKnown }) {
  useModalScrollLock(Boolean(exercise));
  if (!exercise) return null;
  const videoSearchUrl = exerciseVideoSearchUrl(exercise);
  const material = exercise.equipment?.length
    ? exercise.equipment.map(equipmentLabel)
    : exercise.equipmentAny?.length
      ? exercise.equipmentAny.map(equipmentLabel)
      : ["Kein Material"];
  return (
    <div className="modal-backdrop exercise-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal exercise-guide-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-guide-title">
        <button type="button" className="close" onClick={onClose} aria-label="Anleitung schließen">×</button>
        <p className="eyebrow">Übungsbibliothek · {exercise.group}</p>
        <h2 id="exercise-guide-title">{exercise.name}</h2>
        <p className="exercise-guide-purpose">{exercise.purpose}</p>
        {exercise.quickStart && <div className="exercise-quick-start"><span>In 10 Sekunden verstanden</span><p>{exercise.quickStart}</p>{exercise.sideSwitch && <small>Nach der Hälfte ertönt ein Signal zum Seitenwechsel.</small>}</div>}
        {exercise.asymmetryNote && <div className="exercise-asymmetry-note"><span>Seitenvergleich</span><p>{exercise.asymmetryNote}</p></div>}

        <div className="exercise-guide-visual"><ExerciseVisual visual={exercise.visual} /></div>
        <p className="exercise-visual-note">Die Grafik zeigt den Bewegungsablauf schematisch. Saubere, schmerzfreie Ausführung ist wichtiger als ein großer Bewegungsweg.</p>
        <a
          className="exercise-video-search"
          href={videoSearchUrl}
          target={EXERCISE_SEARCH_TAB}
          aria-label={`Google-Suche nach Ausführungsvideos für ${exercise.name} in einem separaten Such-Tab öffnen`}
          onClick={(event) => openExerciseSearch(event, videoSearchUrl)}
        >
          <span className="exercise-video-search-icon" aria-hidden="true">▶</span>
          <span>
            <strong>Ausführungsvideo bei Google suchen</strong>
            <small>Öffnet einen separaten Such-Tab und verwendet ihn für die nächsten Übungen weiter. Externe Videos können Übungsvarianten zeigen.</small>
          </span>
          <b aria-hidden="true">↗</b>
        </a>
        {(knownLocked || exercise.group === "Physio") && (
          <p className="exercise-video-physio-note">Bei Physio-Übungen hat die persönlich gezeigte Ausführung Vorrang.</p>
        )}

        <div className="exercise-guide-meta">
          <span><b>Zeit</b>{Math.round(exercise.seconds / 15) * 15} Sek.</span>
          <span><b>Material</b>{material.join(" oder ")}</span>
          <span><b>Fokus</b>{exercise.focusAreas?.length ? exercise.focusAreas.map(focusAreaLabel).join(" · ") : "Allgemein"}</span>
        </div>

        <div className="exercise-guide-columns">
          <div>
            <p className="eyebrow">So geht’s</p>
            <ol>{exercise.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
          <div>
            <p className="eyebrow">Darauf achten</p>
            <ul className="positive-list">{exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
          </div>
          <div>
            <p className="eyebrow">Häufige Fehler</p>
            <ul className="warning-list">{exercise.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
          </div>
        </div>

        <div className="exercise-variations">
          <div><span>Leichter</span><p>{exercise.easier}</p></div>
          <div><span>Schwieriger</span><p>{exercise.harder}</p></div>
        </div>
        <div className="exercise-guide-actions">
          {knownLocked ? (
            <span className="exercise-known-status locked">Physio-Übung · gilt als bekannt</span>
          ) : onToggleKnown ? (
            <button type="button" className={`exercise-known-toggle ${known ? "selected" : ""}`} onClick={() => onToggleKnown(exercise.id)}>
              {known ? "✓ Übung kenne ich" : "Als bekannt markieren"}
            </button>
          ) : null}
          <button type="button" className="primary" onClick={onClose}>Verstanden</button>
        </div>
      </section>
    </div>
  );
}
