import { useState } from "react";
import { sourceLabel } from "../services/activityUtils";

export default function ActivityNameModal({ activity, onSave, onClose }) {
  const sourceName = String(activity.sourceName || activity.name || "Aktivität").trim();
  const [name, setName] = useState(String(activity.name || sourceName));


  function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal activity-name-modal" onSubmit={submit}>
        <button type="button" className="close" onClick={onClose} aria-label="Schließen">×</button>
        <p className="eyebrow">Aktivität bearbeiten</p>
        <h2>Trainingsname</h2>
        <p className="muted">Der eigene Name bleibt auch nach einer neuen Synchronisierung erhalten.</p>
        <label>
          Anzeigename
          <input autoFocus maxLength="120" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="source-name-box">
          <span>Original von {sourceLabel(activity)}</span>
          <strong>{sourceName}</strong>
        </div>
        <div className="button-row activity-name-actions">
          <button type="submit" className="primary">Namen speichern</button>
          <button type="button" className="secondary" onClick={() => setName(sourceName)}>Original übernehmen</button>
        </div>
      </form>
    </div>
  );
}
