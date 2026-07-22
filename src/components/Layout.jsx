import { NavLink, Outlet } from "react-router-dom";
import { version } from "../../package.json";
import { useApp } from "../context/AppContext";

const links = [
  ["/", "Briefing", "◉"],
  ["/planner", "Wochenplan", "▦"],
  ["/coach", "Coach", "✦"],
  ["/mission", "Mission", "◎"],
  ["/training", "Training", "↗"],
  ["/fuel", "Fuel Lab", "◒"],
  ["/equipment", "Equipment", "◇"],
  ["/analytics", "Analytics", "▥"],
  ["/settings", "Settings", "⚙"],
];

export default function Layout() {
  const { state, cloudStatus, cloudUpdatedAt, cloudError } = useApp();
  const milestones = Array.isArray(state.mission?.milestones) ? state.mission.milestones : [];
  const mainTarget = milestones.find((item) => item.isMainTarget && !item.archived) || state.mission || {};
  const targetLabel = Number(mainTarget.targetKm || 0) > 0 ? `${Number(mainTarget.targetKm)} KM` : "ZIEL SETZEN";
  const cloudLabel = {
    local: "Nur lokal",
    loading: "Cloud lädt",
    saving: "Wird gespeichert",
    synced: "Cloud aktuell",
    conflict: "Cloud-Konflikt",
    error: "Cloud-Fehler",
  }[cloudStatus] || "Cloud-Status";
  const cloudTitle = cloudError || (cloudUpdatedAt ? `Zuletzt gespeichert: ${new Date(cloudUpdatedAt).toLocaleString("de-DE")}` : cloudLabel);
  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>Endurance Intelligence</b><span>Eat your miles.</span><small>v{version}</small></div>
        <nav>{links.map(([to, name, icon]) => <NavLink key={to} to={to} end={to === "/"}><i>{icon}</i>{name}</NavLink>)}</nav>
        <div className="aside-foot">
          <NavLink to="/settings" className={`aside-cloud-status ${cloudStatus}`} title={cloudTitle}><i />{cloudLabel}</NavLink>
          <span>{mainTarget.name || "Deine Mission"}</span><br /><strong>{targetLabel}</strong>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
