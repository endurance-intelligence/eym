import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import {
  lookupOpenFoodFactsProduct,
  lookupOpenFoodFactsProductByText,
  openFoodFactsContributionUrl,
  scanBarcodeFromImage,
  stockUnitForCategory,
} from "../services/productLookup";
import { compressImageFile } from "../services/imageTools";
import { contributeOpenFoodFactsProduct, openFoodFactsContributionReady } from "../services/openFoodFactsContribution";

const categories = ["Gel", "Drink Mix", "Elektrolyte", "Riegel", "Recovery", "Kapseln", "Sonstiges"];
const stockUnits = ["Stück", "Portionen", "Tabletten", "Beutel"];
const servingUnits = ["g", "ml"];
const emptyProduct = {
  brand: "",
  name: "",
  category: "Gel",
  carbs: "",
  caffeine: "",
  carbsPer100: "",
  caffeinePer100: "",
  servingQuantity: "",
  servingUnit: "g",
  ingredientsText: "",
  quantity: "1",
  stockUnit: "Stück",
  barcode: "",
  imageUrl: "",
  nutritionImageUrl: "",
  ingredientsImageUrl: "",
  packageSize: "",
  source: "",
  brandSource: null,
  catalogContributionPending: false,
};

function numericOrEmpty(value) {
  return value == null || value === "" ? "" : String(value);
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function derivedPer100(perUnit, servingQuantity) {
  const unitValue = numberOrNull(perUnit);
  const serving = numberOrNull(servingQuantity);
  if (unitValue == null || serving == null || serving <= 0) return null;
  return Number(((unitValue / serving) * 100).toFixed(1));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE").format(new Date(value));
}

function productNeedsContribution(item) {
  return Boolean(item.catalogContributionPending || !item.barcode || !item.brand || !item.name);
}

export default function Fuel() {
  const { state, setState } = useApp();
  const [product, setProduct] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);
  const [scanStatus, setScanStatus] = useState("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [productStatuses, setProductStatuses] = useState({});
  const [contributionConsent, setContributionConsent] = useState(false);
  const [contributionStatus, setContributionStatus] = useState("idle");
  const photoInput = useRef(null);
  const nutritionPhotoInput = useRef(null);
  const ingredientsPhotoInput = useRef(null);

  function change(event) {
    const { name, value } = event.target;
    setProduct((current) => {
      if (name !== "category") return { ...current, [name]: value };
      const currentDefault = stockUnitForCategory(current.category);
      return {
        ...current,
        category: value,
        stockUnit: current.stockUnit === currentDefault ? stockUnitForCategory(value) : current.stockUnit,
      };
    });
  }

  function applyLookup(result) {
    if (!result.found) {
      setProduct((current) => ({ ...current, barcode: result.barcode || current.barcode, catalogContributionPending: true }));
      setScanStatus("not-found");
      setScanMessage("Das Produkt fehlt im offenen Katalog. Ergänze die Angaben und Fotos einmal in EYM. Danach kannst du die Daten direkt zu Open Food Facts beitragen.");
      return;
    }
    setProduct((current) => ({
      ...current,
      ...result.product,
      carbs: result.product.carbs ?? current.carbs,
      caffeine: result.product.caffeine ?? current.caffeine,
      carbsPer100: result.product.carbsPer100 ?? current.carbsPer100,
      caffeinePer100: result.product.caffeinePer100 ?? current.caffeinePer100,
      servingQuantity: result.product.servingQuantity ?? current.servingQuantity,
      servingUnit: result.product.servingUnit || current.servingUnit,
      ingredientsText: result.product.ingredientsText || current.ingredientsText,
      brand: result.product.brand || current.brand,
      name: result.product.name || current.name,
      imageUrl: result.product.imageUrl || current.imageUrl,
      nutritionImageUrl: result.product.nutritionImageUrl || current.nutritionImageUrl,
      ingredientsImageUrl: result.product.ingredientsImageUrl || current.ingredientsImageUrl,
      quantity: current.quantity || "1",
      catalogContributionPending: false,
    }));
    setScanStatus("found");
    setScanMessage("Produkt erkannt. Prüfe die automatisch übernommenen Angaben und passe sie bei Bedarf an.");
  }

  async function lookupBarcode(barcode = product.barcode) {
    setScanStatus("loading");
    setScanMessage("Produktdaten werden gesucht …");
    try {
      applyLookup(await lookupOpenFoodFactsProduct(barcode));
    } catch (error) {
      setScanStatus("error");
      setScanMessage(error.message || "Produkt konnte nicht erkannt werden.");
    }
  }

  async function scanPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setShowForm(true);
    setScanStatus("loading");
    setScanMessage("Foto wird vorbereitet und der Barcode gelesen …");
    try {
      const imageUrl = await compressImageFile(file, { maxSize: 1200, quality: 0.8 });
      setProduct((current) => ({ ...current, imageUrl }));
      const barcode = await scanBarcodeFromImage(file);
      setProduct((current) => ({ ...current, barcode }));
      await lookupBarcode(barcode);
    } catch (error) {
      setScanStatus("error");
      setScanMessage(`${error.message || "Der Barcode konnte nicht gelesen werden."} Das Foto bleibt erhalten; Produktname und Nährwerte kannst du manuell ergänzen.`);
    }
  }

  async function supportingPhoto(field, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imageUrl = await compressImageFile(file, { maxSize: 1400, quality: 0.8 });
      setProduct((current) => ({ ...current, [field]: imageUrl, catalogContributionPending: true }));
    } catch (error) {
      setScanStatus("error");
      setScanMessage(error.message || "Das Foto konnte nicht vorbereitet werden.");
    }
  }

  function resetEditor() {
    setProduct(emptyProduct);
    setEditingId(null);
    setScanStatus("idle");
    setScanMessage("");
    setContributionConsent(false);
    setContributionStatus("idle");
    setShowForm(false);
  }

  function openNewProduct() {
    resetEditor();
    setShowForm(true);
  }

  function editProduct(item, message = "Produkt bearbeiten oder die Katalogdaten erneut prüfen.") {
    setProduct({
      brand: item.brand || "",
      name: item.name || "",
      category: item.category || "Gel",
      carbs: numericOrEmpty(item.carbs),
      caffeine: numericOrEmpty(item.caffeine),
      carbsPer100: numericOrEmpty(item.carbsPer100),
      caffeinePer100: numericOrEmpty(item.caffeinePer100),
      servingQuantity: numericOrEmpty(item.servingQuantity),
      servingUnit: item.servingUnit || "g",
      ingredientsText: item.ingredientsText || "",
      quantity: String(item.quantity ?? 0),
      stockUnit: item.stockUnit || stockUnitForCategory(item.category),
      barcode: item.barcode || "",
      imageUrl: item.imageUrl || "",
      nutritionImageUrl: item.nutritionImageUrl || "",
      ingredientsImageUrl: item.ingredientsImageUrl || "",
      packageSize: item.packageSize || "",
      source: item.source || "",
      brandSource: item.brandSource || null,
      catalogContributionPending: Boolean(item.catalogContributionPending),
      catalogCompleteness: item.catalogCompleteness ?? null,
      catalogModifiedAt: item.catalogModifiedAt || null,
      catalogCheckedAt: item.catalogCheckedAt || null,
    });
    setEditingId(item.id);
    setScanStatus("idle");
    setScanMessage(message);
    setContributionConsent(false);
    setContributionStatus("idle");
    setShowForm(true);
    window.setTimeout(() => document.querySelector(".fuel-product-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function refreshProduct(item) {
    setProductStatuses((current) => ({ ...current, [item.id]: { tone: "loading", message: item.barcode ? "Produktdaten werden per Barcode geprüft …" : "Produktdaten werden anhand von Marke und Name gesucht …" } }));
    try {
      const result = item.barcode
        ? await lookupOpenFoodFactsProduct(item.barcode)
        : await lookupOpenFoodFactsProductByText(item.brand, item.name);
      if (!result.found) {
        setState((current) => ({
          ...current,
          fuel: current.fuel.map((candidate) => candidate.id === item.id
            ? { ...candidate, catalogContributionPending: true, catalogCheckedAt: new Date().toISOString() }
            : candidate),
        }));
        setProductStatuses((current) => ({
          ...current,
          [item.id]: {
            tone: "warn",
            message: item.barcode
              ? "Der Barcode fehlt bei Open Food Facts. Ergänze die Produktdaten und sende sie anschließend direkt aus EYM."
              : "Über Marke und Produktname wurde kein eindeutiger Treffer gefunden. Ergänze einen Barcode oder Verpackungsfotos.",
          },
        }));
        return;
      }
      setState((current) => ({
        ...current,
        fuel: current.fuel.map((candidate) => candidate.id !== item.id ? candidate : {
          ...candidate,
          brand: result.product.brand || candidate.brand,
          name: result.product.name || candidate.name,
          barcode: result.product.barcode || candidate.barcode || "",
          category: result.product.category || candidate.category,
          carbs: result.product.carbs ?? candidate.carbs,
          caffeine: result.product.caffeine ?? candidate.caffeine,
          carbsPer100: result.product.carbsPer100 ?? candidate.carbsPer100 ?? null,
          caffeinePer100: result.product.caffeinePer100 ?? candidate.caffeinePer100 ?? null,
          servingQuantity: result.product.servingQuantity ?? candidate.servingQuantity ?? null,
          servingUnit: result.product.servingUnit || candidate.servingUnit || "g",
          ingredientsText: result.product.ingredientsText || candidate.ingredientsText || "",
          stockUnit: candidate.stockUnit || result.product.stockUnit,
          imageUrl: result.product.imageUrl || candidate.imageUrl,
          nutritionImageUrl: result.product.nutritionImageUrl || candidate.nutritionImageUrl || "",
          ingredientsImageUrl: result.product.ingredientsImageUrl || candidate.ingredientsImageUrl || "",
          packageSize: result.product.packageSize || candidate.packageSize,
          source: result.product.source || candidate.source,
          brandSource: result.product.brandSource || candidate.brandSource || null,
          catalogContributionPending: false,
          catalogCompleteness: result.product.catalogCompleteness ?? candidate.catalogCompleteness ?? null,
          catalogModifiedAt: result.product.catalogModifiedAt || candidate.catalogModifiedAt || null,
          catalogCheckedAt: result.product.catalogCheckedAt || new Date().toISOString(),
        }),
      }));
      const details = [
        result.product.carbs != null ? `${result.product.carbs} g Carbs` : null,
        result.product.caffeine != null ? `${result.product.caffeine} mg Koffein` : null,
      ].filter(Boolean).join(" · ");
      setProductStatuses((current) => ({ ...current, [item.id]: { tone: "good", message: details ? `Aktualisiert: ${details}` : "Produktdaten geprüft; keine zusätzlichen Nährwerte vorhanden." } }));
    } catch (error) {
      setProductStatuses((current) => ({ ...current, [item.id]: { tone: "bad", message: error.message || "Produktdaten konnten nicht geprüft werden." } }));
    }
  }

  function normalizedProduct() {
    const servingQuantity = numberOrNull(product.servingQuantity);
    return {
      brand: product.brand.trim(),
      name: product.name.trim(),
      category: product.category,
      carbs: numberOrZero(product.carbs),
      caffeine: numberOrZero(product.caffeine),
      carbsPer100: numberOrNull(product.carbsPer100) ?? derivedPer100(product.carbs, servingQuantity),
      caffeinePer100: numberOrNull(product.caffeinePer100) ?? derivedPer100(product.caffeine, servingQuantity),
      servingQuantity,
      servingUnit: product.servingUnit || "g",
      ingredientsText: product.ingredientsText.trim(),
      quantity: numberOrZero(product.quantity),
      stockUnit: product.stockUnit || "Stück",
      barcode: product.barcode.replace(/\D/g, ""),
      imageUrl: product.imageUrl || "",
      nutritionImageUrl: product.nutritionImageUrl || "",
      ingredientsImageUrl: product.ingredientsImageUrl || "",
      packageSize: product.packageSize.trim(),
      source: product.source || "",
      brandSource: product.brandSource || null,
      catalogContributionPending: Boolean(product.catalogContributionPending),
      catalogCompleteness: product.catalogCompleteness ?? null,
      catalogModifiedAt: product.catalogModifiedAt || null,
      catalogCheckedAt: product.catalogCheckedAt || null,
    };
  }

  function persistProduct(data, contribution = {}) {
    const matchingItem = editingId
      ? state.fuel.find((item) => item.id === editingId)
      : data.barcode ? state.fuel.find((item) => String(item.barcode || "").replace(/\D/g, "") === data.barcode) : null;
    const targetId = matchingItem?.id || editingId || crypto.randomUUID();
    const incrementExisting = !editingId && Boolean(matchingItem);
    setState((current) => {
      const existing = current.fuel.find((item) => item.id === targetId);
      const stored = {
        ...(existing || {}),
        ...data,
        id: targetId,
        quantity: incrementExisting ? Math.max(0, Number(existing?.quantity || 0) + data.quantity) : data.quantity,
        archived: false,
        rating: existing?.rating || 0,
        tolerance: existing?.tolerance || 0,
        stockTrackedFrom: existing?.stockTrackedFrom || new Date().toISOString().slice(0, 10),
        ...contribution,
      };
      return {
        ...current,
        fuel: existing ? current.fuel.map((item) => item.id === targetId ? stored : item) : [...current.fuel, stored],
      };
    });
    return targetId;
  }

  async function save(event, contribute = false) {
    event.preventDefault();
    const data = normalizedProduct();
    if (!data.name) return;
    if (contribute && !data.barcode) {
      setScanStatus("error");
      setScanMessage("Für einen Beitrag zu Open Food Facts wird ein Barcode benötigt.");
      return;
    }
    if (contribute && !contributionConsent) {
      setScanStatus("error");
      setScanMessage("Bestätige bitte, dass die hochgeladenen Fotos von dir stammen und geteilt werden dürfen.");
      return;
    }

    const targetId = persistProduct(data, {
      catalogContributionPending: contribute || data.catalogContributionPending,
      contributionStatus: contribute ? "sending" : undefined,
    });

    if (!contribute) {
      resetEditor();
      return;
    }

    setContributionStatus("loading");
    setScanStatus("loading");
    setScanMessage("Produktdaten und ausgewählte Fotos werden an Open Food Facts gesendet …");
    try {
      const result = await contributeOpenFoodFactsProduct(data);
      setState((current) => ({
        ...current,
        fuel: current.fuel.map((item) => item.id === targetId ? {
          ...item,
          catalogContributionPending: false,
          contributionStatus: "submitted",
          catalogSubmittedAt: result.contributedAt || new Date().toISOString(),
          catalogProductUrl: result.productUrl || openFoodFactsContributionUrl(data.barcode),
          source: item.source || "Open Food Facts · EYM Beitrag",
          catalogCheckedAt: new Date().toISOString(),
        } : item),
      }));
      setProductStatuses((current) => ({ ...current, [targetId]: { tone: "good", message: "Beitrag gesendet. Open Food Facts verarbeitet Produktdaten und Fotos; die öffentliche Seite kann sich zeitversetzt aktualisieren." } }));
      setContributionStatus("success");
      resetEditor();
    } catch (error) {
      setState((current) => ({
        ...current,
        fuel: current.fuel.map((item) => item.id === targetId ? {
          ...item,
          catalogContributionPending: true,
          contributionStatus: "failed",
          contributionError: error.message || "Beitrag fehlgeschlagen.",
        } : item),
      }));
      setContributionStatus("error");
      setScanStatus("error");
      setScanMessage(`Die Daten wurden in EYM gespeichert, aber der Open-Food-Facts-Beitrag ist noch nicht raus: ${error.message || "Unbekannter Fehler"}`);
    }
  }

  function qty(id, delta) {
    setState((current) => ({
      ...current,
      fuel: current.fuel.map((item) => item.id === id ? { ...item, quantity: Math.max(0, Number(item.quantity || 0) + delta) } : item),
    }));
  }

  function remove(id) {
    if (!window.confirm("Dieses Fuel-Produkt endgültig löschen? Bereits gespeicherte Reviews behalten ihren Text, verlieren aber die Bestandsverknüpfung.")) return;
    setState((current) => ({ ...current, fuel: current.fuel.filter((item) => item.id !== id) }));
  }

  function archive(id) {
    setState((current) => ({
      ...current,
      fuel: current.fuel.map((item) => item.id === id ? { ...item, archived: !item.archived } : item),
    }));
  }

  const active = state.fuel.filter((item) => !item.archived);
  const archived = state.fuel.filter((item) => item.archived);
  const computedCarbsPer100 = product.carbsPer100 || derivedPer100(product.carbs, product.servingQuantity);
  const computedCaffeinePer100 = product.caffeinePer100 || derivedPer100(product.caffeine, product.servingQuantity);

  return <>
    <PageTitle eyebrow="Fuel Intelligence" title="Fuel Lab">
      <button onClick={() => showForm ? resetEditor() : openNewProduct()}>{showForm ? "Schließen" : "+ Produkt"}</button>
    </PageTitle>

    {showForm && <Card className="wide fuel-product-editor">
      <div className="fuel-photo-import">
        <div>
          <p className="eyebrow">Produktdaten</p>
          <h2>{editingId ? "Produkt ergänzen oder bearbeiten" : "Produkt aufnehmen"}</h2>
          <p className="muted">Lokale Angaben stehen sofort im Fuel Lab zur Verfügung. Mit Barcode und eigenen Verpackungsfotos kannst du fehlende Daten optional zu Open Food Facts beitragen.</p>
        </div>
        <div className="fuel-photo-actions">
          <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={scanPhoto} />
          <button type="button" className="secondary" onClick={() => photoInput.current?.click()}>Vorderseite / Barcode</button>
        </div>
      </div>

      {scanMessage && <div className={`fuel-scan-status ${scanStatus}`}><b>{scanStatus === "found" ? "Erkannt" : scanStatus === "loading" ? "Einen Moment" : "Hinweis"}</b><span>{scanMessage}</span>{product.barcode && <a className="fuel-contribution-link" href={openFoodFactsContributionUrl(product.barcode)} target="_blank" rel="noreferrer">Produkt bei Open Food Facts öffnen ↗</a>}</div>}

      <div className="fuel-photo-grid">
        <div className="fuel-photo-slot">
          <div className="fuel-photo-preview">{product.imageUrl ? <img src={product.imageUrl} alt="Produktvorderseite" /> : <span>Vorderseite</span>}</div>
          <b>Vorderseite & Barcode</b>
          <small>Für Erkennung und Produktbild</small>
          <button type="button" onClick={() => photoInput.current?.click()}>{product.imageUrl ? "Foto ersetzen" : "Foto hinzufügen"}</button>
        </div>
        <div className="fuel-photo-slot">
          <input ref={nutritionPhotoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => supportingPhoto("nutritionImageUrl", event)} />
          <div className="fuel-photo-preview">{product.nutritionImageUrl ? <img src={product.nutritionImageUrl} alt="Nährwerttabelle" /> : <span>Nährwerte</span>}</div>
          <b>Nährwerttabelle</b>
          <small>Hilft bei Carbs und Koffein</small>
          <button type="button" onClick={() => nutritionPhotoInput.current?.click()}>{product.nutritionImageUrl ? "Foto ersetzen" : "Foto hinzufügen"}</button>
        </div>
        <div className="fuel-photo-slot">
          <input ref={ingredientsPhotoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => supportingPhoto("ingredientsImageUrl", event)} />
          <div className="fuel-photo-preview">{product.ingredientsImageUrl ? <img src={product.ingredientsImageUrl} alt="Zutatenliste" /> : <span>Zutaten</span>}</div>
          <b>Zutatenliste</b>
          <small>Optional für den offenen Katalog</small>
          <button type="button" onClick={() => ingredientsPhotoInput.current?.click()}>{product.ingredientsImageUrl ? "Foto ersetzen" : "Foto hinzufügen"}</button>
        </div>
      </div>

      <form className="editor-form fuel-editor-form fuel-editor-sections" onSubmit={(event) => save(event, false)}>
        <div className="fuel-form-section wide">
          <p className="eyebrow">Grunddaten</p>
          <div className="fuel-form-grid">
            <label className="fuel-barcode-field">Barcode
              <div className="inline-input-action">
                <input name="barcode" inputMode="numeric" value={product.barcode} onChange={change} placeholder="z. B. 7310865004712" />
                <button type="button" onClick={() => lookupBarcode()} disabled={!product.barcode || scanStatus === "loading"}>Suchen</button>
              </div>
            </label>
            <label>Marke / Hersteller<input name="brand" value={product.brand} onChange={change} placeholder="Maurten" /></label>
            <label>Produktname<input name="name" value={product.name} onChange={change} placeholder="Gel 100" required /></label>
            <label>Kategorie<select name="category" value={product.category} onChange={change}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Packungsangabe<input name="packageSize" value={product.packageSize} onChange={change} placeholder="z. B. 60 g oder 500 ml" /></label>
          </div>
        </div>

        <div className="fuel-form-section wide">
          <p className="eyebrow">Für dein Training</p>
          <div className="fuel-form-grid">
            <label>Kohlenhydrate pro Einheit (g)<input name="carbs" type="number" min="0" step="0.1" value={product.carbs} onChange={change} /></label>
            <label>Koffein pro Einheit (mg)<input name="caffeine" type="number" min="0" step="1" value={product.caffeine} onChange={change} /></label>
            <label>Bestand<input name="quantity" type="number" min="0" step="0.1" value={product.quantity} onChange={change} /></label>
            <label>Bestandseinheit<select name="stockUnit" value={product.stockUnit} onChange={change}>{stockUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          </div>
        </div>

        <div className="fuel-form-section wide">
          <p className="eyebrow">Für vollständige Produktdaten</p>
          <div className="fuel-form-grid">
            <label>Portionsmenge<input name="servingQuantity" type="number" min="0" step="0.1" value={product.servingQuantity} onChange={change} placeholder="60" /></label>
            <label>Einheit<select name="servingUnit" value={product.servingUnit} onChange={change}>{servingUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label>Kohlenhydrate pro 100 g/ml<input name="carbsPer100" type="number" min="0" step="0.1" value={product.carbsPer100} onChange={change} placeholder={computedCarbsPer100 ?? ""} /></label>
            <label>Koffein pro 100 g/ml (mg)<input name="caffeinePer100" type="number" min="0" step="0.1" value={product.caffeinePer100} onChange={change} placeholder={computedCaffeinePer100 ?? ""} /></label>
            <label className="wide">Zutaten laut Verpackung<textarea name="ingredientsText" value={product.ingredientsText} onChange={change} placeholder="Optional: Zutatenliste abschreiben oder fotografieren" /></label>
          </div>
          {(computedCarbsPer100 != null || computedCaffeinePer100 != null) && <p className="fuel-derived-values">Aus Portion und Trainingswerten berechnet: {computedCarbsPer100 != null ? `${computedCarbsPer100} g Kohlenhydrate` : "–"} · {computedCaffeinePer100 != null ? `${computedCaffeinePer100} mg Koffein` : "–"} pro 100 {product.servingUnit || "g"}.</p>}
        </div>

        <div className="fuel-contribution-consent wide">
          <label><input type="checkbox" checked={contributionConsent} onChange={(event) => setContributionConsent(event.target.checked)} /> Ich bestätige, dass hochgeladene Fotos von mir stammen und unter der Open-Food-Facts-Lizenz geteilt werden dürfen.</label>
          <small>Bestand, persönliche Bewertungen und Verträglichkeit bleiben ausschließlich in EYM.</small>
        </div>

        <div className="fuel-editor-actions wide">
          <button className="secondary" type="submit">{editingId ? "Nur in EYM speichern" : state.fuel.some((item) => item.barcode && item.barcode === product.barcode) ? "Bestand auffüllen" : "Produkt in EYM speichern"}</button>
          <button className="primary fuel-contribute-button" type="button" disabled={!openFoodFactsContributionReady() || !product.barcode || contributionStatus === "loading"} onClick={(event) => save(event, true)}>{contributionStatus === "loading" ? "Wird gesendet …" : "Speichern & zu Open Food Facts beitragen"}</button>
        </div>
      </form>
    </Card>}

    <div className="fuel-grid">
      {active.length === 0 && <Card className="wide empty-state"><h2>Noch keine Produkte</h2><p>Lege Gel, Drink Mix, Elektrolyte, Riegel oder andere Produkte manuell oder per Barcode-Foto an.</p></Card>}
      {active.map((item) => <Card key={item.id} className="fuel-product-card fuel-product-card-compact">
        <div className="fuel-product-head">
          {item.imageUrl && <img className="fuel-product-image" src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div className="fuel-product-copy">
            <p className="eyebrow">{item.category}</p>
            <h2 title={item.brand ? `${item.brand} ${item.name}` : item.name}>{item.brand ? `${item.brand} ${item.name}` : item.name}</h2>
            <div className="fuel-stats"><b>{item.carbs} g Carbs</b><span>{item.caffeine} mg Koffein</span></div>
          </div>
          <div className="fuel-card-actions">
            <button type="button" className="fuel-refresh-button" onClick={() => refreshProduct(item)} disabled={productStatuses[item.id]?.tone === "loading"} title={item.barcode ? "Produktname und Nährwerte per Barcode prüfen" : "Produktdaten anhand von Marke und Name suchen"}>
              {productStatuses[item.id]?.tone === "loading" ? "Prüfe …" : "↻ Daten"}
            </button>
            <details className="action-menu fuel-card-menu">
              <summary aria-label="Produktaktionen" title="Produktaktionen">•••</summary>
              <div className="action-menu-panel">
                <button type="button" onClick={(event) => { editProduct(item); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Bearbeiten</button>
                <button type="button" onClick={(event) => { refreshProduct(item); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Produktdaten prüfen</button>
                <button type="button" onClick={(event) => { archive(item.id); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Archivieren</button>
                <button type="button" className="danger-button" onClick={(event) => { remove(item.id); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Dauerhaft löschen</button>
              </div>
            </details>
          </div>
        </div>
        <div className="fuel-product-meta">
          {item.barcode && <small className="fuel-barcode">Barcode {item.barcode}{item.source ? ` · ${item.source}` : ""}</small>}
          <small className="fuel-stock-start">Bestand seit {formatDate(`${item.stockTrackedFrom || new Date().toISOString().slice(0, 10)}T12:00:00`)}</small>
          {item.catalogCheckedAt && <small>Produktdaten geprüft am {formatDate(item.catalogCheckedAt)}{item.catalogCompleteness != null ? ` · Katalog ${Math.round(Number(item.catalogCompleteness) * 100)} % vollständig` : ""}</small>}
          {item.catalogSubmittedAt && <small>Zu Open Food Facts beigetragen am {formatDate(item.catalogSubmittedAt)}</small>}
        </div>
        {productNeedsContribution(item) && <div className="fuel-contribution-box">
          <div><b>Produktdaten ergänzen</b><span>{item.barcode ? "Vervollständige Verpackungsdaten und Fotos. Danach kannst du den Beitrag direkt aus EYM senden." : "Ein Barcode oder Foto verbessert die Zuordnung und ermöglicht einen Beitrag zum offenen Katalog."}</span></div>
          <div className="fuel-contribution-actions"><button type="button" onClick={() => editProduct(item, "Ergänze fehlende Angaben und Fotos. Lokale Daten bleiben unabhängig von Open Food Facts gespeichert.")}>Daten ergänzen</button>{item.barcode && <a href={openFoodFactsContributionUrl(item.barcode)} target="_blank" rel="noreferrer">Bei OFF öffnen ↗</a>}</div>
        </div>}
        {productStatuses[item.id] && <div className={`fuel-data-status ${productStatuses[item.id].tone}`}><span>{productStatuses[item.id].message}</span>{productStatuses[item.id].tone === "warn" && <button type="button" onClick={() => editProduct(item, productStatuses[item.id].message)}>Produktdaten ergänzen</button>}</div>}
        <div className="fuel-stock-row">
          <div><span>Bestand</span><strong>{item.quantity} <small>{item.stockUnit || "Stück"}</small></strong></div>
          <div className="qty fuel-qty"><button aria-label="Bestand reduzieren" onClick={() => qty(item.id, -1)}>−</button><button aria-label="Bestand erhöhen" onClick={() => qty(item.id, 1)}>+</button></div>
        </div>
        {Number(item.quantity || 0) <= 2 && <p className="fuel-low-stock">Bestand wird knapp.</p>}
      </Card>)}
      {archived.length > 0 && <Card className="wide"><p className="eyebrow">Archiv</p>{archived.map((item) => <div className="list-row" key={item.id}><span>{item.brand ? `${item.brand} ${item.name}` : item.name} · {item.category}</span><div className="event-actions"><button onClick={() => archive(item.id)}>Reaktivieren</button><button className="danger-button" onClick={() => remove(item.id)}>Löschen</button></div></div>)}</Card>}
    </div>
  </>;
}
