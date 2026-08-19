import { isProvisionalTrackWorkout, isTrackWorkout } from "./trackWorkout.js";

export const TRACK_PUBLICATION_STATES = Object.freeze({
  DRAFT: "draft",
  NEEDS_APPROVAL: "needs-approval",
  NOT_PUBLISHED: "not-published",
  UPDATE_OPEN: "update-open",
  INTERVALS_CONFIRMED: "intervals-confirmed",
  CURRENT: "current",
});

function publicationSnapshot(item = {}) {
  return {
    id: item.id,
    date: item.date,
    time: item.spontaneous ? "" : item.time,
    spontaneous: Boolean(item.spontaneous),
    title: item.title,
    type: item.type,
    distance: Number(item.distance || 0),
    duration: Number(item.duration || 0),
    optional: Boolean(item.optional),
    notes: item.notes || "",
    structuredWorkout: item.structuredWorkout || null,
    goalWorkout: item.goalWorkout || null,
    paceGuidance: item.paceGuidance || null,
    loopTraining: item.loopTraining || null,
  };
}

export function workoutPublicationFingerprint(item = {}) {
  return JSON.stringify(publicationSnapshot(item));
}

export function planPublicationFingerprint(plan = []) {
  return JSON.stringify((Array.isArray(plan) ? plan : [])
    .map(publicationSnapshot)
    .sort((a, b) => `${a.date}${a.time}${a.id}`.localeCompare(`${b.date}${b.time}${b.id}`)));
}

export function trackPublicationStatus({
  item,
  approvalState = "pending",
  publishedWeekCurrent = false,
  weekWasPublished = false,
} = {}) {
  if (!isTrackWorkout(item)) return null;

  if (isProvisionalTrackWorkout(item)) {
    return {
      state: TRACK_PUBLICATION_STATES.DRAFT,
      label: "VORLÄUFIG · NICHT FÜR GARMIN",
      detail: "Die Einheit bleibt nur im Wochenplan, bis du sie im Editor final freigibst.",
      action: "edit",
    };
  }

  const currentFingerprint = workoutPublicationFingerprint(item);
  const storedFingerprint = String(item?.intervalsPublishedFingerprint || "");
  const wasPublished = Boolean(item?.intervalsPublishedAt || storedFingerprint);
  const legacyCurrent = !storedFingerprint && Boolean(item?.intervalsPublishedAt) && publishedWeekCurrent;
  const isCurrent = legacyCurrent || storedFingerprint === currentFingerprint;

  if (isCurrent) {
    const deviceConfirmed = String(item?.garminConfirmedFingerprint || "") === currentFingerprint;
    if (deviceConfirmed) {
      return {
        state: TRACK_PUBLICATION_STATES.CURRENT,
        label: "✓ AUF UHR BESTÄTIGT",
        detail: "Diese Fassung wurde über Intervals.icu veröffentlicht und von dir auf der Garmin-Uhr geprüft.",
        action: null,
      };
    }
    return {
      state: TRACK_PUBLICATION_STATES.INTERVALS_CONFIRMED,
      label: "INTERVALS ✓ · GARMIN PRÜFEN",
      detail: "Intervals.icu hat diese Fassung erhalten. EI kann technisch nicht sehen, ob Garmin Connect sie schon auf die Uhr übertragen hat. Bitte synchronisieren und das Workout einmal auf der Uhr öffnen.",
      action: "confirm-device",
      actionLabel: "Auf Uhr bestätigt",
      secondaryAction: "publish",
      secondaryActionLabel: "Sync erneut anstoßen",
    };
  }

  if (approvalState !== "accepted") {
    const changed = approvalState === "changed";
    return {
      state: TRACK_PUBLICATION_STATES.NEEDS_APPROVAL,
      label: changed ? "FINAL · ERNEUT ANNEHMEN" : "FINAL · PLAN ANNEHMEN",
      detail: changed
        ? "Die Track-Abfolge wurde nach der letzten Freigabe geändert. Erst erneut annehmen, dann Garmin aktualisieren."
        : "Die Track-Abfolge ist lokal final, aber noch nicht als Wochenplan freigegeben.",
      action: "accept",
      actionLabel: changed ? "Erneut annehmen" : "Plan annehmen",
    };
  }

  if (wasPublished) {
    return {
      state: TRACK_PUBLICATION_STATES.UPDATE_OPEN,
      label: "FINAL · UPDATE OFFEN",
      detail: "Intervals.icu enthält noch die ältere Fassung. Jetzt erneut für Garmin veröffentlichen.",
      action: "publish",
      actionLabel: "Für Garmin aktualisieren",
    };
  }

  return {
    state: TRACK_PUBLICATION_STATES.NOT_PUBLISHED,
    label: "FINAL · NICHT ÜBERTRAGEN",
    detail: "Die Einheit ist freigegeben, wurde aber noch nicht an Intervals.icu veröffentlicht.",
    action: "publish",
    actionLabel: weekWasPublished ? "Für Garmin aktualisieren" : "Für Garmin senden",
  };
}
