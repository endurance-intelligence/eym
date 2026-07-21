import { useModalScrollLock } from "../services/modalScrollLock";
import { equipmentLabel, focusAreaLabel } from "../services/mobilityWorkouts";

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
  if (["knee-to-wall", "calf-raise", "tibialis-raise", "single-leg-balance", "short-foot"].includes(visual)) {
    const endJoints = visual === "calf-raise"
      ? { leftFoot: [40, 112], rightFoot: [66, 112], hip: [53, 73] }
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

        <div className="exercise-guide-visual"><ExerciseVisual visual={exercise.visual} /></div>
        <p className="exercise-visual-note">Die Grafik zeigt den Bewegungsablauf schematisch. Saubere, schmerzfreie Ausführung ist wichtiger als ein großer Bewegungsweg.</p>

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
