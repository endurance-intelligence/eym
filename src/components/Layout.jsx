import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { version } from "../../package.json";
import { useApp } from "../context/AppContext";
import { isMainNavigationActive, MAIN_NAV_ITEMS } from "../services/navigation";

export default function Layout() {
  const { state, cloudStatus, cloudUpdatedAt, cloudError } = useApp();
  const location = useLocation();
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
        <nav>{MAIN_NAV_ITEMS.map((item) => {
          const active = isMainNavigationActive(location.pathname, item);
          return (
            <Link key={item.key} to={item.to} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <i>{item.icon}</i>{item.label}
            </Link>
          );
        })}</nav>
        <div className="aside-foot">
          <NavLink to="/settings" className={`aside-cloud-status ${cloudStatus}`} title={cloudTitle}><i />{cloudLabel}</NavLink>
          <span>{mainTarget.name || "Deine Mission"}</span><br /><strong>{targetLabel}</strong>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
