import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import StoredImage from "../components/StoredImage";
import { fetchIntervalsGear, mapIntervalsGear, mergeIntervalsGear } from "../services/intervals";
import { compressImageFile } from "../services/imageTools";
import { queueEntityImageDeletion, uploadEntityImages } from "../services/imageStorage";

const categories = ["Schuhe", "Fahrrad", "Laufband", "Rudergerät", "Weste", "Stirnlampe", "Sonstiges"];
const emptyItem = { name: "", category: "Schuhe", km: "0", limit: "800", photo: "" };

export default function Equipment() {
  const { state, setState, session } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [item, setItem] = useState(emptyItem);
  const [status, setStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const replacementInput = useRef(null);
  const [photoTargetId, setPhotoTargetId] = useState(null);

  function change(event) {
    const { name, value } = event.target;
    setItem((current) => ({
      ...current,
      [name]: value,
      ...(name === "category" ? {
        km: ["Schuhe", "Fahrrad", "Laufband"].includes(value) ? current.km || "0" : "",
        limit: value === "Schuhe" ? "800" : "",
      } : {}),
    }));
  }

  async function readPhoto(file, apply) {
    if (!file) return;
    try {
      const photo = await compressImageFile(file);
      apply(photo);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function add(event) {
    event.preventDefault();
    if (!item.name.trim()) return;
    const usesKilometers = ["Schuhe", "Fahrrad", "Laufband"].includes(item.category);
    const id = crypto.randomUUID();
    setStatus(item.photo ? "Foto wird im privaten Bildspeicher gesichert …" : "");
    try {
      const storedItem = await uploadEntityImages(session.user.id, "equipment", id, item);
      setState((current) => ({
        ...current,
        equipment: [...current.equipment, {
        id,
        name: item.name.trim(),
        category: item.category,
        km: usesKilometers ? Number(item.km || 0) : null,
        uses: usesKilometers ? null : 0,
        limit: item.limit === "" ? null : Number(item.limit),
        photo: storedItem.photo || "",
        archived: false,
        source: "manual",
        }],
      }));
      setItem(emptyItem);
      setShowForm(false);
      setStatus("Ausrüstung gespeichert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function importIntervalsEquipment() {
    setSyncing(true);
    setStatus("Lade Ausrüstung aus Intervals.icu …");
    try {
      const response = await fetchIntervalsGear();
      const imported = mapIntervalsGear(response.gear);
      const summary = mergeIntervalsGear(state.equipment, imported);
      setState((current) => ({ ...current, equipment: mergeIntervalsGear(current.equipment, imported).equipment }));
      setStatus(`${summary.added} neu · ${summary.updated} aktualisiert. Garmin-Schuhzuordnungen können fehlen, wenn Garmin sie nicht an Intervals.icu übermittelt.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  function archive(id) {
    setState((current) => ({
      ...current,
      equipment: current.equipment.map((entry) => entry.id === id ? { ...entry, archived: !entry.archived } : entry),
    }));
  }

  function remove(id) {
    const entry = state.equipment.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (!window.confirm("Diesen Ausrüstungsgegenstand endgültig löschen?")) return;
    try {
      queueEntityImageDeletion(session.user.id, "equipment", id, entry);
      setState((current) => ({ ...current, equipment: current.equipment.filter((candidate) => candidate.id !== id) }));
      setStatus("Ausrüstung gelöscht. Das zugehörige Bild wird nach der Cloud-Synchronisation bereinigt.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function requestPhoto(id) {
    setPhotoTargetId(id);
    replacementInput.current?.click();
  }

  async function replacePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !photoTargetId) return;
    const targetId = photoTargetId;
    setStatus("Foto wird gespeichert …");
    try {
      const photo = await compressImageFile(file);
      const stored = await uploadEntityImages(session.user.id, "equipment", targetId, { photo });
      setState((current) => ({
        ...current,
        equipment: current.equipment.map((entry) => entry.id === targetId ? { ...entry, photo: stored.photo } : entry),
      }));
      setStatus("Foto aktualisiert.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPhotoTargetId(null);
    }
  }

  const activeEquipment = state.equipment.filter((entry) => !entry.archived);
  const archivedEquipment = state.equipment.filter((entry) => entry.archived);

  function renderItem(entry, archived = false) {
    const value = entry.km ?? entry.uses ?? 0;
    const unit = entry.km != null ? "km" : "Einsätze";
    const progress = entry.limit ? Math.min(100, (value / entry.limit) * 100) : 0;
    return <Card key={entry.id} className="equipment-card">
      {entry.photo && <StoredImage className="equipment-photo" value={entry.photo} alt={entry.name} />}
      <p className="eyebrow">{entry.category}{entry.source === "intervals" ? " · Intervals.icu" : ""}</p>
      <h2>{entry.name}</h2>
      <strong className="big">{value} {unit}</strong>
      {entry.limit ? <><div className="progress"><i style={{ width: `${progress}%` }} /></div><p className="muted">Limit: {entry.limit} {unit}</p></> : null}
      <div className="event-actions">
        <button onClick={() => requestPhoto(entry.id)}>{entry.photo ? "Foto ändern" : "Foto hinzufügen"}</button>
        <button onClick={() => archive(entry.id)}>{archived ? "Reaktivieren" : "Archivieren"}</button>
        <button className="danger-button" onClick={() => remove(entry.id)}>Löschen</button>
      </div>
    </Card>;
  }

  return <>
    <PageTitle eyebrow="Equipment Intelligence" title="Ausrüstung">
      <div className="page-actions">
        {state.intervals?.connected && <button onClick={importIntervalsEquipment} disabled={syncing}>{syncing ? "Wird geladen …" : "Aus Intervals übernehmen"}</button>}
        <button onClick={() => setShowForm((value) => !value)}>+ Ausrüstung</button>
      </div>
    </PageTitle>

    <input ref={replacementInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={replacePhoto} />
    {status && <p className="connection-message">{status}</p>}

    {showForm && <Card className="wide">
      <form className="editor-form equipment-editor" onSubmit={add}>
        <label>Typ<select name="category" value={item.category} onChange={change}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Name<input name="name" value={item.name} onChange={change} placeholder={item.category === "Schuhe" ? "Brooks Adrenaline GTS 25" : item.category} required /></label>
        {["Schuhe", "Fahrrad", "Laufband"].includes(item.category) && <label>Bisherige Kilometer<input name="km" type="number" min="0" step="0.1" value={item.km} onChange={change} placeholder="0" /></label>}
        <label>Limit {item.category === "Schuhe" ? "(km)" : "(optional)"}<input name="limit" type="number" min="0" value={item.limit} onChange={change} placeholder="Optional" /></label>
        <label className="equipment-photo-field">Foto<input type="file" accept="image/*" capture="environment" onChange={(event) => readPhoto(event.target.files?.[0], (photo) => setItem((current) => ({ ...current, photo })))} /></label>
        {item.photo && <div className="equipment-photo-preview"><StoredImage value={item.photo} alt="Vorschau" /><button type="button" onClick={() => setItem((current) => ({ ...current, photo: "" }))}>Entfernen</button></div>}
        <button className="primary" type="submit">Speichern</button>
        <button type="button" onClick={() => setShowForm(false)}>Abbrechen</button>
      </form>
      <p className="muted equipment-scan-note">Ein Foto wird komprimiert und getrennt vom Cloud-Datensatz im privaten Bildspeicher abgelegt. Beim Ersetzen wird dieselbe Datei überschrieben.</p>
    </Card>}

    <div className="grid">
      {activeEquipment.length === 0 && <Card className="wide empty-state"><h2>Noch keine Ausrüstung</h2><p>Übernimm vorhandene Ausrüstung aus Intervals.icu oder lege Schuhe, Laufband, Rudergerät und weiteres Equipment an.</p></Card>}
      {activeEquipment.map((entry) => renderItem(entry))}
      {archivedEquipment.length > 0 && <Card className="wide">
        <div className="archive-heading"><div><p className="eyebrow">Archiv</p><h2>Archivierte Ausrüstung</h2></div><button onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Ausblenden" : `Anzeigen (${archivedEquipment.length})`}</button></div>
        {showArchived && <div className="archive-grid">{archivedEquipment.map((entry) => renderItem(entry, true))}</div>}
      </Card>}
    </div>
  </>;
}
