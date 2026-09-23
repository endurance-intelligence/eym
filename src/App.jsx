import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Briefing from "./pages/Briefing";
import Auth from "./pages/Auth";
import PitCrewSharedSession from "./components/PitCrewSharedSession";
import Onboarding from "./pages/Onboarding";
import { useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";

const Mission = lazy(() => import("./pages/Mission"));
const Training = lazy(() => import("./pages/Training"));
const Coach = lazy(() => import("./pages/Coach"));
const Exercises = lazy(() => import("./pages/Exercises"));
const Fuel = lazy(() => import("./pages/Fuel"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Planner = lazy(() => import("./pages/Planner"));

function deferredPage(Component) {
  return (
    <Suspense fallback={<div className="route-loading" role="status">Bereich wird geladen …</div>}>
      <Component />
    </Suspense>
  );
}

function sharedPitCrewTokenFromLocation(location = window.location) {
  const direct = new URLSearchParams(location.search || "").get("crew");
  if (direct) return String(direct).trim();
  const hash = String(location.hash || "").replace(/^#\/?/, "");
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
  const fallback = new URLSearchParams(hashQuery).get("crew");
  return fallback ? String(fallback).trim() : "";
}

export default function App() {
  const { state, session, authLoading, cloudStatus, cloudError, reloadCloudState, logout } = useApp();
  const sharedPitCrewToken = sharedPitCrewTokenFromLocation(window.location);
  if (sharedPitCrewToken) return <ErrorBoundary><PitCrewSharedSession token={sharedPitCrewToken} /></ErrorBoundary>;
  if (authLoading) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Cloud wird verbunden …</h1></section></main>;
  if (!session) return <Auth />;
  if (cloudStatus === "local" || cloudStatus === "loading") return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Dein Profil wird geladen …</h1><p className="muted">Dein vorhandener Stand wird zuerst geprüft, damit nichts überschrieben wird.</p></section></main>;
  if (cloudStatus === "error" && state.onboarding?.status !== "completed") return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Dein Profil konnte nicht geladen werden</h1><p className="muted">Deine Anmeldung ist noch aktiv. Die App startet kein neues Onboarding, solange der bestehende Cloud-Stand nicht geprüft werden konnte.</p>{cloudError && <p className="connection-message cloud-error-message">{cloudError}</p>}<div className="button-row"><button onClick={reloadCloudState}>Cloud erneut laden</button><button className="secondary" onClick={logout}>Abmelden</button></div></section></main>;
  if (state.onboarding?.status !== "completed") return <ErrorBoundary><Onboarding /></ErrorBoundary>;
  return <ErrorBoundary><HashRouter useTransitions={false}><Routes><Route element={<Layout />}><Route index element={<Briefing />} /><Route path="mission" element={deferredPage(Mission)} /><Route path="training" element={deferredPage(Training)} /><Route path="planner" element={deferredPage(Planner)} /><Route path="coach" element={deferredPage(Coach)} /><Route path="coach/exercises" element={deferredPage(Exercises)} /><Route path="fuel" element={deferredPage(Fuel)} /><Route path="equipment" element={<Navigate to="/settings?section=equipment" replace />} /><Route path="analytics" element={deferredPage(Analytics)} /><Route path="settings" element={deferredPage(Settings)} /></Route></Routes></HashRouter></ErrorBoundary>;
}
