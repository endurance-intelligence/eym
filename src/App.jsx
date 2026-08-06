import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Briefing from "./pages/Briefing";
import Auth from "./pages/Auth";
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

export default function App() {
  const { state, session, authLoading, cloudStatus } = useApp();
  if (authLoading) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Cloud wird verbunden …</h1></section></main>;
  if (!session) return <Auth />;
  if (cloudStatus === "local" || cloudStatus === "loading") return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Dein Profil wird geladen …</h1><p className="muted">Dein vorhandener Stand wird zuerst geprüft, damit nichts überschrieben wird.</p></section></main>;
  if (state.onboarding?.status !== "completed") return <ErrorBoundary><Onboarding /></ErrorBoundary>;
  return <ErrorBoundary><HashRouter><Routes><Route element={<Layout />}><Route index element={<Briefing />} /><Route path="mission" element={deferredPage(Mission)} /><Route path="training" element={deferredPage(Training)} /><Route path="planner" element={deferredPage(Planner)} /><Route path="coach" element={deferredPage(Coach)} /><Route path="coach/exercises" element={deferredPage(Exercises)} /><Route path="fuel" element={deferredPage(Fuel)} /><Route path="equipment" element={<Navigate to="/settings?section=equipment" replace />} /><Route path="analytics" element={deferredPage(Analytics)} /><Route path="settings" element={deferredPage(Settings)} /></Route></Routes></HashRouter></ErrorBoundary>;
}
