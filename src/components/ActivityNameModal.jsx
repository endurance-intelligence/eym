import { useState } from "react";
import { sourceLabel } from "../services/activityUtils";

export default function ActivityNameModal({ activity, onSave, onClose }) {
  const sourceName = String(activity.sourceName || activity.name || "Aktivität").trim();
  const [name, setName] = useState(String(activity.name || sourceName));
  const [sportTypeOverride, setSportTypeOverride] = useState(String(activity.sportTypeOverride || ""));

  function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, sportTypeOverride });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal activity-name-modal" onSubmit={submit}>
        <button type="button" className="close" onClick={onClose} aria-label="Schließen">×</button>
        <p className="eyebrow">Aktivität bearbeiten</p>
        <h2>Name & Sportart</h2>
        <p className="muted">Eigener Name und eine manuelle Sportart-Korrektur bleiben auch nach einer neuen Synchronisierung erhalten.</p>
        <label>
          Anzeigename
          <input autoFocus maxLength="120" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {!activity.isActivityGroup && <label>
          Sportart
          <select value={sportTypeOverride} onChange={(event) => setSportTypeOverride(event.target.value)}>
            <option value="">Automatisch erkennen</option>
            <option value="running">Laufen</option>
            <option value="roadCycling">Rennrad</option>
            <option value="cycling">Radfahren</option>
            <option value="soccer">Fußball</option>
            <option value="swimming">Schwimmen</option>
            <option value="rowing">Rudern</option>
            <option value="walking">Wandern & Gehen</option>
            <option value="strength">Kraft & Mobility</option>
          </select>
        </label>}
        <div className="source-name-box">
          <span>Original von {sourceLabel(activity)}</span>
          <strong>{sourceName}</strong>
        </div>
        <div className="button-row activity-name-actions">
          <button type="submit" className="primary">Änderungen speichern</button>
          <button type="button" className="secondary" onClick={() => { setName(sourceName); setSportTypeOverride(""); }}>Original übernehmen</button>
        </div>
      </form>
    </div>
  );
}
