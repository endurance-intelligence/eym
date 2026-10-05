import { Link } from "react-router-dom";
import { PageTitle } from "../components/UI";
import SectionNav from "../components/SectionNav";
import Coach from "./Coach";
import "./TrainingMobility.css";

export default function TrainingMobility() {
  return (
    <>
      <PageTitle eyebrow="Training" title="Kraft & Mobility"><Link className="button-link" to="/coach/exercises">Übungen verwalten</Link></PageTitle>
      <SectionNav />
      <div className="training-mobility-embed"><Coach embeddedTab="mobility" /></div>
    </>
  );
}
