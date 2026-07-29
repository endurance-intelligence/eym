import { NavLink } from "react-router-dom";
import { TRAINING_SECTIONS } from "../services/navigation";

export default function TrainingSectionNav() {
  return (
    <div className="section-tabs training-section-tabs" role="navigation" aria-label="Training-Bereiche">
      {TRAINING_SECTIONS.map((item) => (
        <NavLink to={item.to} className={({ isActive }) => isActive ? "selected" : ""} key={item.key}>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
