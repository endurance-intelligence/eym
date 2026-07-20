import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Briefing from "./pages/Briefing";
import Mission from "./pages/Mission";
import Training from "./pages/Training";
import Coach from "./pages/Coach";
import Fuel from "./pages/Fuel";
import Equipment from "./pages/Equipment";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Planner from "./pages/Planner";
import Auth from "./pages/Auth";
import StravaCallback from "./pages/StravaCallback";
import { useApp } from "./context/AppContext";

export default function App() {
  const { session, authLoading } = useApp();
  if (authLoading) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Cloud wird verbunden …</h1></section></main>;
  if (!session) return <Auth />;
  const params = new URLSearchParams(window.location.search);
  const stravaCallback = params.get("connection") === "strava" && (params.get("code") || params.get("error"));
  return <HashRouter>{stravaCallback ? <StravaCallback /> : <Routes><Route element={<Layout />}><Route index element={<Briefing />} /><Route path="mission" element={<Mission />} /><Route path="training" element={<Training />} /><Route path="planner" element={<Planner />} /><Route path="coach" element={<Coach />} /><Route path="fuel" element={<Fuel />} /><Route path="equipment" element={<Equipment />} /><Route path="analytics" element={<Analytics />} /><Route path="settings" element={<Settings />} /></Route></Routes>}</HashRouter>;
}
