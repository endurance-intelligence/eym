import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { lookupOpenFoodFactsProduct, lookupOpenFoodFactsProductByText, openFoodFactsContributionUrl, scanBarcodeFromImage, stockUnitForCategory } from "../services/productLookup";
import { compressImageFile } from "../services/imageTools";

const categories = ["Gel", "Drink Mix", "Elektrolyte", "Riegel", "Recovery", "Kapseln", "Sonstiges"];
const stockUnits = ["Stück", "Portionen", "Tabletten", "Beutel"];
const emptyProduct = {
  brand: "",
  name: "",
  category: "Gel",
  carbs: "",
  caffeine: "",
  quantity: "1",
  stockUnit: "Stück",
  barcode: "",
  imageUrl: "",
  packageSize: "",
  source: "",
  brandSource: null,
  catalogContributionPending: false,
};

export default function Fuel() {
  const { state, setState } = useApp();
  const [product, setProduct] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);
  const [scanStatus, setScanStatus] = useState("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [productStatuses, setProductStatuses] = useState({});
  const photoInput = useRef(null);

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
      setProduct((current) => ({ ...current, barcode: result.barcode, catalogContributionPending: true }));
      setScanStatus("not-found");
      setScanMessage("Barcode erkannt, aber das Produkt fehlt bei Open Food Facts. Trage die Daten einmal manuell ein. Danach kannst du den Barcode direkt bei Open Food Facts ergänzen und später hier erneut prüfen.");
      return;
    }
    setProduct((current) => ({
      ...current,
      ...result.product,
      carbs: result.product.carbs ?? current.carbs,
      caffeine: result.product.caffeine ?? current.caffeine,
      brand: result.product.brand || current.brand,
      name: result.product.name || current.name,
      imageUrl: result.product.imageUrl || current.imageUrl,
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
      const imageUrl = await compressImageFile(file, { maxSize: 900, quality: 0.82 });
      setProduct((current) => ({ ...current, imageUrl }));
      const barcode = await scanBarcodeFromImage(file);
      setProduct((current) => ({ ...current, barcode }));
      await lookupBarcode(barcode);
    } catch (error) {
      setScanStatus("error");
      setScanMessage(`${error.message || "Der Barcode konnte nicht gelesen werden."} Das Foto bleibt erhalten; Produktname und Nährwerte kannst du einmal manuell ergänzen.`);
    }
  }

  function resetEditor() {
    setProduct(emptyProduct);
    setEditingId(null);
    setScanStatus("idle");
    setScanMessage("");
    setShowForm(false);
  }

  function openNewProduct() {
    setProduct(emptyProduct);
    setEditingId(null);
    setScanStatus("idle");
    setScanMessage("");
    setShowForm(true);
  }

  function editProduct(item) {
    setProduct({
      brand: item.brand || "",
      name: item.name || "",
      category: item.category || "Gel",
      carbs: item.carbs ?? "",
      caffeine: item.caffeine ?? "",
      quantity: String(item.quantity ?? 0),
      stockUnit: item.stockUnit || stockUnitForCategory(item.category),
      barcode: item.barcode || "",
      imageUrl: item.imageUrl || "",
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
    setScanMessage(item.barcode ? "Produkt bearbeiten oder die Katalogdaten erneut prüfen." : "Die Daten-Suche nutzt zuerst Marke und Produktname. Ein Barcode macht die Zuordnung genauer.");
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
        if (item.barcode) {
          setState((current) => ({
            ...current,
            fuel: current.fuel.map((candidate) => candidate.id === item.id
              ? { ...candidate, catalogContributionPending: true, catalogCheckedAt: new Date().toISOString() }
              : candidate),
          }));
        }
        setProductStatuses((current) => ({
          ...current,
          [item.id]: {
            tone: "warn",
            message: item.barcode
              ? "Der Barcode fehlt bei Open Food Facts. Deine lokalen Werte bleiben erhalten; über „Beitrag ergänzen“ kannst du das Produkt dort anlegen."
              : "Über Marke und Produktname wurde kein eindeutiger Treffer gefunden. Ein Barcode oder Foto verbessert die Suche.",
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
          stockUnit: candidate.stockUnit || result.product.stockUnit,
          imageUrl: result.product.imageUrl || candidate.imageUrl,
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

  function add(event) {
    event.preventDefault();
    if (!product.name.trim()) return;
    const quantity = Number(product.quantity) || 0;
    const normalizedBarcode = product.barcode.replace(/\D/g, "");

    setState((current) => {
      if (editingId) {
        return {
          ...current,
          fuel: current.fuel.map((item) => item.id !== editingId ? item : {
            ...item,
            brand: product.brand.trim(),
            name: product.name.trim(),
            category: product.category,
            carbs: Number(product.carbs) || 0,
            caffeine: Number(product.caffeine) || 0,
            quantity,
            stockUnit: product.stockUnit || item.stockUnit || "Stück",
            barcode: normalizedBarcode,
            imageUrl: product.imageUrl || item.imageUrl || "",
            packageSize: product.packageSize || "",
            source: product.source || item.source || "",
            brandSource: product.brandSource || item.brandSource || null,
            catalogContributionPending: Boolean(product.catalogContributionPending),
            catalogCompleteness: product.catalogCompleteness ?? item.catalogCompleteness ?? null,
            catalogModifiedAt: product.catalogModifiedAt || item.catalogModifiedAt || null,
            catalogCheckedAt: product.catalogCheckedAt || item.catalogCheckedAt || null,
            archived: false,
          }),
        };
      }

      const match = normalizedBarcode
        ? current.fuel.find((item) => String(item.barcode || "").replace(/\D/g, "") === normalizedBarcode)
        : null;

      if (match) {
        return {
          ...current,
          fuel: current.fuel.map((item) => item.id === match.id ? {
            ...item,
            brand: product.brand.trim() || item.brand,
            name: product.name.trim() || item.name,
            category: product.category,
            carbs: Number(product.carbs) || 0,
            caffeine: Number(product.caffeine) || 0,
            quantity: Math.max(0, Number(item.quantity || 0) + quantity),
            stockUnit: product.stockUnit || item.stockUnit || "Stück",
            barcode: normalizedBarcode,
            imageUrl: product.imageUrl || item.imageUrl || "",
            packageSize: product.packageSize || item.packageSize || "",
            source: product.source || item.source || "",
            brandSource: product.brandSource || item.brandSource || null,
            catalogContributionPending: Boolean(product.catalogContributionPending),
            catalogCompleteness: product.catalogCompleteness ?? item.catalogCompleteness ?? null,
            catalogModifiedAt: product.catalogModifiedAt || item.catalogModifiedAt || null,
            catalogCheckedAt: product.catalogCheckedAt || item.catalogCheckedAt || null,
            archived: false,
            stockTrackedFrom: item.stockTrackedFrom || new Date().toISOString().slice(0, 10),
          } : item),
        };
      }

      return {
        ...current,
        fuel: [
          ...current.fuel,
          {
            id: crypto.randomUUID(),
            brand: product.brand.trim(),
            name: product.name.trim(),
            category: product.category,
            carbs: Number(product.carbs) || 0,
            caffeine: Number(product.caffeine) || 0,
            quantity,
            stockUnit: product.stockUnit || "Stück",
            barcode: normalizedBarcode,
            imageUrl: product.imageUrl || "",
            packageSize: product.packageSize || "",
            source: product.source || "",
            brandSource: product.brandSource || null,
            catalogContributionPending: Boolean(product.catalogContributionPending),
            catalogCompleteness: product.catalogCompleteness ?? null,
            catalogModifiedAt: product.catalogModifiedAt || null,
            catalogCheckedAt: product.catalogCheckedAt || null,
            archived: false,
            rating: 0,
            tolerance: 0,
            stockTrackedFrom: new Date().toISOString().slice(0, 10),
          },
        ],
      };
    });
    resetEditor();
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

  return <>
    <PageTitle eyebrow="Fuel Intelligence" title="Fuel Lab">
      <button onClick={() => showForm ? resetEditor() : openNewProduct()}>{showForm ? "Schließen" : "+ Produkt"}</button>
    </PageTitle>

    {showForm && <Card className="wide fuel-product-editor">
      <div className="fuel-photo-import">
        <div>
          <p className="eyebrow">Foto-Import</p>
          <h2>{editingId ? "Produkt bearbeiten" : "Barcode fotografieren"}</h2>
          <p className="muted">{editingId ? "Ergänze oder korrigiere Produktname, Bestand und Nährwerte. Mit Barcode wird die Katalogsuche genauer." : "Fotografiere den Barcode auf Gel, Riegel oder Drink Mix. Endurance Intelligence sucht Produktname, Marke und Nährwerte automatisch."}</p>
        </div>
        <div className="fuel-photo-actions">
          <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={scanPhoto} />
          <button type="button" className="secondary" onClick={() => photoInput.current?.click()}>Foto aufnehmen / auswählen</button>
        </div>
      </div>

      {scanMessage && <div className={`fuel-scan-status ${scanStatus}`}><b>{scanStatus === "found" ? "Erkannt" : scanStatus === "loading" ? "Einen Moment" : "Hinweis"}</b><span>{scanMessage}</span>{product.catalogContributionPending && product.barcode && <a className="fuel-contribution-link" href={openFoodFactsContributionUrl(product.barcode)} target="_blank" rel="noreferrer">Bei Open Food Facts ergänzen ↗</a>}</div>}
      {product.imageUrl && <div className="fuel-manual-photo"><img src={product.imageUrl} alt="Ausgewähltes Produkt" /><span>Das Foto wird auch gespeichert, wenn der offene Produktkatalog den Barcode nicht kennt.</span></div>}

      <form className="editor-form fuel-editor-form" onSubmit={add}>
        <label className="fuel-barcode-field">Barcode
          <div className="inline-input-action">
            <input name="barcode" inputMode="numeric" value={product.barcode} onChange={change} placeholder="z. B. 7310865004712" />
            <button type="button" onClick={() => lookupBarcode()} disabled={!product.barcode || scanStatus === "loading"}>Suchen</button>
          </div>
        </label>
        <label>Marke / Hersteller<input name="brand" value={product.brand} onChange={change} placeholder="Maurten" /></label>
        <label>Produktname<input name="name" value={product.name} onChange={change} placeholder="Gel 100" required /></label>
        <label>Kategorie<select name="category" value={product.category} onChange={change}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Kohlenhydrate pro Einheit (g)<input name="carbs" type="number" min="0" step="0.1" value={product.carbs} onChange={change} /></label>
        <label>Koffein pro Einheit (mg)<input name="caffeine" type="number" min="0" step="1" value={product.caffeine} onChange={change} /></label>
        <label>Bestand<input name="quantity" type="number" min="0" step="0.1" value={product.quantity} onChange={change} /></label>
        <label>Bestandseinheit<select name="stockUnit" value={product.stockUnit} onChange={change}>{stockUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        {product.packageSize && <label>Packungsangabe<input name="packageSize" value={product.packageSize} onChange={change} /></label>}
        <button className="primary" type="submit">{editingId ? "Änderungen speichern" : state.fuel.some((item) => item.barcode && item.barcode === product.barcode) ? "Bestand auffüllen" : "Produkt speichern"}</button>
      </form>
    </Card>}

    <div className="fuel-grid">
      {active.length === 0 && <Card className="wide empty-state"><h2>Noch keine Produkte</h2><p>Lege Gel, Drink Mix, Elektrolyte, Riegel oder andere Produkte manuell oder per Barcode-Foto an.</p></Card>}
      {active.map((item) => <Card key={item.id} className="fuel-product-card fuel-product-card-compact">
        <div className="fuel-product-head">
          {item.imageUrl && <img className="fuel-product-image" src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div className="fuel-product-copy">
            <p className="eyebrow">{item.category}</p>
            <h2>{item.brand ? `${item.brand} ${item.name}` : item.name}</h2>
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
          <small className="fuel-stock-start">Bestand seit {new Intl.DateTimeFormat("de-DE").format(new Date(`${item.stockTrackedFrom || new Date().toISOString().slice(0, 10)}T12:00:00`))}</small>
          {item.catalogCheckedAt && <small>Produktdaten geprüft am {new Intl.DateTimeFormat("de-DE").format(new Date(item.catalogCheckedAt))}{item.catalogCompleteness != null ? ` · Katalog ${Math.round(Number(item.catalogCompleteness) * 100)} % vollständig` : ""}</small>}
        </div>
        {item.catalogContributionPending && item.barcode && <div className="fuel-contribution-box"><div><b>Produkt fehlt im offenen Katalog</b><span>Foto und Nährwerte bleiben im Fuel Lab gespeichert. Ergänze den Barcode bei Open Food Facts und prüfe die Daten danach erneut.</span></div><a href={openFoodFactsContributionUrl(item.barcode)} target="_blank" rel="noreferrer">Beitrag ergänzen ↗</a></div>}
        {productStatuses[item.id] && <p className={`fuel-data-status ${productStatuses[item.id].tone}`}>{productStatuses[item.id].message}</p>}
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
