import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Briefing from "./pages/Briefing";
import Auth from "./pages/Auth";
import { useApp } from "./context/AppContext";

const Mission = lazy(() => import("./pages/Mission"));
const Training = lazy(() => import("./pages/Training"));
const Coach = lazy(() => import("./pages/Coach"));
const Fuel = lazy(() => import("./pages/Fuel"));
const Equipment = lazy(() => import("./pages/Equipment"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Planner = lazy(() => import("./pages/Planner"));

function deferredPage(Component) {
  return (
    <Suspense fallback={<span className="visually-hidden" role="status">Bereich wird geladen …</span>}>
      <Component />
    </Suspense>
  );
}

export default function App() {
  const { session, authLoading } = useApp();
  if (authLoading) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Cloud wird verbunden …</h1></section></main>;
  if (!session) return <Auth />;
  return <HashRouter><Routes><Route element={<Layout />}><Route index element={<Briefing />} /><Route path="mission" element={deferredPage(Mission)} /><Route path="training" element={deferredPage(Training)} /><Route path="planner" element={deferredPage(Planner)} /><Route path="coach" element={deferredPage(Coach)} /><Route path="fuel" element={deferredPage(Fuel)} /><Route path="equipment" element={deferredPage(Equipment)} /><Route path="analytics" element={deferredPage(Analytics)} /><Route path="settings" element={deferredPage(Settings)} /></Route></Routes></HashRouter>;
}
