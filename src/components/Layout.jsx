import { NavLink, Outlet } from "react-router-dom";

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
  return (
    <div className="shell">
      <aside>
        <div className="brand"><b>Endurance Intelligence</b><span>Eat your miles.</span><small>v2.6</small></div>
        <nav>{links.map(([to, name, icon]) => <NavLink key={to} to={to} end={to === "/"}><i>{icon}</i>{name}</NavLink>)}</nav>
        <div className="aside-foot">MISSION 01<br /><strong>112 KM</strong></div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
