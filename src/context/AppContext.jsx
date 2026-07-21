/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { defaultState } from "../data/defaults";
import { loadState, saveState } from "../services/storage";
import { loadCloudState, saveCloudState, signOut, supabase } from "../services/supabase";
import { fetchIntervalsStatus, mapIntervalsActivities, mergeIntervalsActivities, syncIntervalsActivities } from "../services/intervals";
import { migrateConfiguration } from "../services/configuration";

const AppContext = createContext(null);

function asArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizeCatalogText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function reviewFuelCategory(item) {
  return item.type === "Salz" ? "Kapseln" : item.type || "Sonstiges";
}

function findFuelCatalogMatch(fuel, reviewItem, category = reviewFuelCategory(reviewItem)) {
  const productName = normalizeCatalogText(reviewItem.product);
  const manufacturer = normalizeCatalogText(reviewItem.manufacturer);
  const sameProduct = fuel.filter((candidate) => (
    normalizeCatalogText(candidate.name) === productName
    && candidate.category === category
  ));
  const exact = sameProduct.find((candidate) => normalizeCatalogText(candidate.brand) === manufacturer);
  if (exact) return exact;
  if (!manufacturer && sameProduct.length === 1) return sameProduct[0];
  const candidatesWithoutBrand = sameProduct.filter((candidate) => !normalizeCatalogText(candidate.brand));
  if (manufacturer && candidatesWithoutBrand.length === 1) return candidatesWithoutBrand[0];
  return null;
}

function normalizeInventory(activities, items, reviews) {
  const trackingStart = new Date().toISOString().slice(0, 10);
  const fuel = asArray(items).map((item) => ({
    ...item,
    stockTrackedFrom: item.stockTrackedFrom || trackingStart,
  }));
  const fuelById = new Map(fuel.map((item) => [item.id, item]));
  const activityById = new Map(asArray(activities).map((activity) => [activity.id, activity]));
  const restored = {};
  const normalizedReviews = Object.fromEntries(Object.entries(reviews || {}).map(([activityId, review]) => {
    const activity = activityById.get(activityId);
    const activityDay = String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
    const nutritionItems = asArray(review?.nutritionItems).map((item) => {
      if (typeof item.affectsInventory === "boolean") return item;
      const product = fuelById.get(item.fuelItemId);
      if (!product) return { ...item, affectsInventory: false };
      const affectsInventory = !activityDay || activityDay >= product.stockTrackedFrom;
      if (!affectsInventory) {
        restored[product.id] = (restored[product.id] || 0) + (Number(item.quantity) || 0);
      }
      return { ...item, affectsInventory };
    });
    return [activityId, { ...review, nutritionItems }];
  }));

  return {
    fuel: fuel.map((item) => restored[item.id]
      ? { ...item, quantity: Number(item.quantity || 0) + Number(restored[item.id] || 0) }
      : item),
    reviews: normalizedReviews,
  };
}


function migrateReviewFuelCatalog(inputState = {}) {
  const fuel = asArray(inputState.fuel).map((item) => ({ ...item }));
  Object.values(inputState.reviews || {}).forEach((review) => {
    (Array.isArray(review?.nutritionItems) ? review.nutritionItems : []).forEach((item) => {
      if (!String(item.product || "").trim() || item.hydrationLinked) return;
      const category = reviewFuelCategory(item);
      const match = findFuelCatalogMatch(fuel, item, category);
      if (match) {
        if (!String(match.brand || "").trim() && String(item.manufacturer || "").trim()) {
          match.brand = String(item.manufacturer).trim();
          match.brandSource = "Review";
        }
        return;
      }
      fuel.push({
        id: crypto.randomUUID(),
        brand: String(item.manufacturer || "").trim(),
        name: String(item.product || "").trim(),
        category,
        carbs: Number(item.carbohydratesPerUnit || 0),
        caffeine: 0,
        quantity: 0,
        stockUnit: item.unit === "Tabletten" ? "Tabletten" : item.unit === "Beutel" ? "Beutel" : item.unit === "Portionen" ? "Portionen" : "Stück",
        barcode: "",
        imageUrl: "",
        packageSize: "",
        source: "Review",
        archived: false,
        rating: 0,
        tolerance: 0,
        stockTrackedFrom: new Date().toISOString().slice(0, 10),
      });
    });
  });
  return { ...inputState, fuel };
}

function mergeState(localState = {}, cloudState = {}) {
  const local = localState || {};
  const cloud = cloudState || {};
  const activities = asArray(cloud.activities, asArray(local.activities));
  const reviews = { ...(local.reviews || {}), ...(cloud.reviews || {}) };
  const inventory = normalizeInventory(activities, cloud.fuel ?? local.fuel, reviews);
  const merged = {
    ...defaultState,
    ...local,
    ...cloud,
    activities,
    activityGroups: asArray(cloud.activityGroups, asArray(local.activityGroups)),
    plan: asArray(cloud.plan, asArray(local.plan)),
    equipment: asArray(cloud.equipment, asArray(local.equipment)),
    fuel: inventory.fuel,
    healthCheckins: asArray(cloud.healthCheckins, asArray(local.healthCheckins)),
    mobilityCoach: {
      ...defaultState.mobilityCoach,
      ...(local.mobilityCoach || {}),
      ...(cloud.mobilityCoach || {}),
      equipment: asArray(cloud.mobilityCoach?.equipment, asArray(local.mobilityCoach?.equipment, defaultState.mobilityCoach.equipment)),
      physioExerciseIds: asArray(cloud.mobilityCoach?.physioExerciseIds, asArray(local.mobilityCoach?.physioExerciseIds, defaultState.mobilityCoach.physioExerciseIds)),
      focusAreaIds: asArray(cloud.mobilityCoach?.focusAreaIds, asArray(local.mobilityCoach?.focusAreaIds, defaultState.mobilityCoach.focusAreaIds)),
      knownExerciseIds: asArray(cloud.mobilityCoach?.knownExerciseIds, asArray(local.mobilityCoach?.knownExerciseIds, defaultState.mobilityCoach.knownExerciseIds)),
      history: asArray(cloud.mobilityCoach?.history, asArray(local.mobilityCoach?.history)),
    },
    reviews: inventory.reviews,
    profile: { ...defaultState.profile, ...(local.profile || {}), ...(cloud.profile || {}) },
    mission: {
      ...defaultState.mission,
      ...(local.mission || {}),
      ...(cloud.mission || {}),
      milestones: asArray(cloud.mission?.milestones, asArray(local.mission?.milestones, defaultState.mission.milestones)),
    },
    planner: { ...defaultState.planner, ...(local.planner || {}), ...(cloud.planner || {}) },
    garmin: { ...defaultState.garmin, ...(local.garmin || {}), ...(cloud.garmin || {}) },
    calendar: { ...defaultState.calendar, ...(local.calendar || {}), ...(cloud.calendar || {}) },
    intervals: { ...defaultState.intervals, ...(local.intervals || {}), ...(cloud.intervals || {}) },
  };
  // Remove the retired direct Strava connection while keeping already imported activities.
  delete merged.strava;
  return migrateConfiguration(migrateReviewFuelCatalog(merged));
}

function stateForCloud(state) {
  const cloudState = { ...state };
  delete cloudState.strava;
  return cloudState;
}

export function AppProvider({ children }) {
  const [state, setState] = useState(() => mergeState(loadState(defaultState), {}));
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState("local");
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState(null);
  const [calendarToken, setCalendarToken] = useState(null);
  const [intervalsSyncStatus, setIntervalsSyncStatus] = useState("idle");
  const cloudHydrated = useRef(false);
  const skipNextCloudSave = useRef(false);
  const intervalsAutoSyncStarted = useRef(false);

  useEffect(() => saveState(state), [state]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      if (!nextSession) {
        cloudHydrated.current = false;
        setCloudStatus("local");
        setCalendarToken(null);
        intervalsAutoSyncStarted.current = false;
        setIntervalsSyncStatus("idle");
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || cloudHydrated.current) return;
    let cancelled = false;
    async function hydrate() {
      setCloudStatus("loading");
      try {
        const cloud = await loadCloudState(session.user.id);
        if (cancelled) return;
        if (cloud?.app_data && Object.keys(cloud.app_data).length > 0) {
          skipNextCloudSave.current = true;
          setState((local) => mergeState(local, cloud.app_data));
          setCalendarToken(cloud.calendar_token);
          setCloudUpdatedAt(cloud.updated_at);
        } else {
          const saved = await saveCloudState(session.user.id, stateForCloud(state));
          if (cancelled) return;
          setCalendarToken(saved.calendar_token);
          setCloudUpdatedAt(saved.updated_at);
        }
        cloudHydrated.current = true;
        setCloudStatus("synced");
      } catch (error) {
        console.error("Supabase hydration failed", error);
        setCloudStatus("error");
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [session, state]);

  useEffect(() => {
    if (!session?.user?.id || !cloudHydrated.current) return;
    if (skipNextCloudSave.current) {
      skipNextCloudSave.current = false;
      return;
    }
    setCloudStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const saved = await saveCloudState(session.user.id, stateForCloud(state));
        setCalendarToken(saved.calendar_token);
        setCloudUpdatedAt(saved.updated_at);
        setCloudStatus("synced");
      } catch (error) {
        console.error("Supabase save failed", error);
        setCloudStatus("error");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [state, session]);



  async function syncIntervalsNow({ silent = false } = {}) {
    if (!session?.user?.id) return { added: 0, duplicates: 0 };
    if (!silent) setIntervalsSyncStatus("syncing");
    try {
      const dates = state.activities.map((activity) => activity.date).filter(Boolean).sort();
      const latest = dates.at(-1);
      const firstIntervalsSync = !state.intervals?.lastSyncAt;
      const afterDate = firstIntervalsSync
        ? new Date(`${state.intervals?.importFrom || "2025-01-01"}T00:00:00Z`)
        : latest ? new Date(`${latest}T00:00:00Z`) : new Date("2025-01-01T00:00:00Z");
      if (!firstIntervalsSync) afterDate.setUTCDate(afterDate.getUTCDate() - 2);
      const result = await syncIntervalsActivities(afterDate.toISOString().slice(0, 10));
      const imported = mapIntervalsActivities(Array.isArray(result.activities) ? result.activities : []);
      const merged = mergeIntervalsActivities(state.activities, imported);
      const syncedAt = result.syncedAt || new Date().toISOString();
      setState((current) => ({
        ...current,
        activities: mergeIntervalsActivities(current.activities, imported).activities,
        intervals: {
          ...current.intervals,
          connected: true,
          configured: true,
          lastSyncAt: syncedAt,
        },
      }));
      setIntervalsSyncStatus("synced");
      return { added: merged.added, duplicates: merged.duplicates, total: imported.length };
    } catch (error) {
      setIntervalsSyncStatus("error");
      if (!silent) throw error;
      console.warn("Automatic Intervals.icu sync failed", error);
      return { added: 0, duplicates: 0, error };
    }
  }

  useEffect(() => {
    if (!session?.user?.id || cloudStatus !== "synced" || intervalsAutoSyncStarted.current) return;
    intervalsAutoSyncStarted.current = true;
    let cancelled = false;
    async function checkAndSync() {
      try {
        const status = await fetchIntervalsStatus();
        if (cancelled) return;
        setState((current) => ({
          ...current,
          intervals: {
            ...current.intervals,
            configured: Boolean(status.configured),
            connected: Boolean(status.connected),
          },
        }));
        if (!status.connected) return;
        const lastSync = state.intervals?.lastSyncAt ? new Date(state.intervals.lastSyncAt).getTime() : 0;
        if (Date.now() - lastSync > 15 * 60_000) await syncIntervalsNow({ silent: true });
      } catch (error) {
        console.warn("Intervals.icu status check failed", error);
      }
    }
    checkAndSync();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, cloudStatus]);


  async function uploadLocalState() {
    if (!session?.user?.id) return;
    setCloudStatus("saving");
    const saved = await saveCloudState(session.user.id, stateForCloud(state));
    setCalendarToken(saved.calendar_token);
    setCloudUpdatedAt(saved.updated_at);
    setCloudStatus("synced");
  }

  async function reloadCloudState() {
    if (!session?.user?.id) return;
    setCloudStatus("loading");
    const cloud = await loadCloudState(session.user.id);
    if (cloud?.app_data) {
      skipNextCloudSave.current = true;
      setState((local) => mergeState(local, cloud.app_data));
      setCalendarToken(cloud.calendar_token);
      setCloudUpdatedAt(cloud.updated_at);
    }
    setCloudStatus("synced");
  }

  const api = {
    state,
    setState,
    session,
    authLoading,
    cloudStatus,
    cloudUpdatedAt,
    calendarToken,
    intervalsSyncStatus,
    syncIntervalsNow,
    uploadLocalState,
    reloadCloudState,
    logout: signOut,
    upsertReview: (id, review, options = {}) => setState((current) => {
      const usage = (items) => (Array.isArray(items) ? items : []).reduce((result, item) => {
        if (!item.fuelItemId || item.affectsInventory === false) return result;
        result[item.fuelItemId] = (result[item.fuelItemId] || 0) + (Number(item.quantity) || 0);
        return result;
      }, {});

      const fuel = [...current.fuel];
      const nutritionItems = (Array.isArray(review.nutritionItems) ? review.nutritionItems : []).map((item) => {
        if (item.fuelItemId || !String(item.product || "").trim() || item.hydrationLinked) return item;
        const category = reviewFuelCategory(item);
        const match = findFuelCatalogMatch(fuel, item, category);
        if (match) {
          if (!String(match.brand || "").trim() && String(item.manufacturer || "").trim()) {
            match.brand = String(item.manufacturer).trim();
            match.brandSource = "Review";
          }
          return { ...item, manufacturer: item.manufacturer || match.brand || "", fuelItemId: match.id, affectsInventory: false };
        }
        const created = {
          id: crypto.randomUUID(),
          brand: String(item.manufacturer || "").trim(),
          name: String(item.product || "").trim(),
          category,
          carbs: Number(item.carbohydratesPerUnit || 0),
          caffeine: 0,
          quantity: 0,
          stockUnit: item.unit === "Tabletten" ? "Tabletten" : item.unit === "Beutel" ? "Beutel" : item.unit === "Portionen" ? "Portionen" : "Stück",
          barcode: "",
          imageUrl: "",
          packageSize: "",
          source: "Review",
          archived: false,
          rating: 0,
          tolerance: 0,
          stockTrackedFrom: new Date().toISOString().slice(0, 10),
        };
        fuel.push(created);
        return { ...item, fuelItemId: created.id, affectsInventory: false };
      });

      const normalizedReview = { ...review, nutritionItems };
      const previousUsage = usage(current.reviews[id]?.nutritionItems);
      const nextUsage = usage(nutritionItems);
      const adjustedFuel = fuel.map((item) => {
        const restored = Number(previousUsage[item.id] || 0);
        const consumed = Number(nextUsage[item.id] || 0);
        if (!restored && !consumed) return item;
        return { ...item, quantity: Math.max(0, Number(item.quantity || 0) + restored - consumed) };
      });
      const reviews = { ...current.reviews, [id]: normalizedReview };
      (options.memberIds || []).forEach((memberId) => {
        reviews[memberId] = {
          ...normalizedReview,
          linkedReviewId: id,
          groupReview: true,
          nutritionItems: [],
          usedNutrition: false,
          isEvent: false,
        };
      });
      return { ...current, fuel: adjustedFuel, reviews };
    }),
    setActivities: (activities) => setState((current) => ({ ...current, activities })),
    addActivity: (activity) => setState((current) => ({ ...current, activities: [activity, ...current.activities] })),
    updateActivity: (id, changes) => setState((current) => ({
      ...current,
      activities: current.activities.map((activity) => activity.id === id ? { ...activity, ...changes } : activity),
    })),
  };

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp muss innerhalb des AppProvider verwendet werden.");
  return context;
}
