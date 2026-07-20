import { NavLink, Outlet } from "react-router-dom";
import packageJson from "../../package.json";
import { useApp } from "../context/AppContext";

const links = [
  ["/", "Briefing", "◉"],
  ["/mission", "Mission", "◎"],
  ["/training", "Training", "↗"],
  ["/planner", "Wochenplan", "▦"],
  ["/coach", "Coach", "✦"],
  ["/fuel", "Fuel Lab", "◒"],
  ["/equipment", "Equipment", "◇"],
  ["/analytics", "Analytics", "▥"],
  ["/settings", "Settings", "⚙"],
];

export default function Layout() {
  const { state } = useApp();
  const milestones = Array.isArray(state.mission?.milestones) ? state.mission.milestones : [];
  const mainTarget = milestones.find((item) => item.isMainTarget && !item.archived) || state.mission || {};
  const targetLabel = Number(mainTarget.targetKm || 0) > 0 ? `${Number(mainTarget.targetKm)} KM` : "ZIEL SETZEN";
  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>Endurance Intelligence</b><span>Eat your miles.</span><small>v{packageJson.version}</small></div>
        <nav>{links.map(([to, name, icon]) => <NavLink key={to} to={to} end={to === "/"}><i>{icon}</i>{name}</NavLink>)}</nav>
        <div className="aside-foot"><span>{mainTarget.name || "Deine Mission"}</span><br /><strong>{targetLabel}</strong></div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
