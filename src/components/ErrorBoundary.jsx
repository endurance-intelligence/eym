import { Component } from "react";
import {
  isDeploymentChunkError,
  recoverApplication,
} from "../services/appRecovery";

export default class ErrorBoundary extends Component {
  state = { error: null, recovering: false, recoveryError: "" };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error("Endurance Intelligence page failed", error, details);
  }

  recover = async (destinationHash = "") => {
    this.setState({ recovering: true, recoveryError: "" });
    try {
      await recoverApplication({
        baseUrl: import.meta.env.BASE_URL,
        destinationHash,
      });
    } catch (error) {
      console.error("Endurance Intelligence recovery failed", error);
      this.setState({
        recovering: false,
        recoveryError: "Der App-Cache konnte nicht automatisch bereinigt werden. Bitte nutze einmal Strg+F5.",
      });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    const deploymentError = isDeploymentChunkError(this.state.error);
    return <main className="route-error-shell" role="alert">
      <section className="card route-error-card">
        <p className="eyebrow">Bereich konnte nicht geladen werden</p>
        <h1>Deine Daten sind weiterhin sicher gespeichert.</h1>
        <p className="muted">{deploymentError
          ? "Während des Deployments wurde noch eine ältere Datei angefordert. Der App-Cache wird jetzt vollständig erneuert."
          : "Beim Öffnen dieses Bereichs ist ein Fehler aufgetreten. Du kannst den aktuellen App-Stand sauber neu laden oder sicher zum Briefing zurückkehren."}</p>
        <div className="route-error-actions">
          <button className="primary" type="button" disabled={this.state.recovering} onClick={() => this.recover()}>
            {this.state.recovering ? "App-Stand wird erneuert …" : "Aktuellen App-Stand laden"}
          </button>
          <button type="button" disabled={this.state.recovering} onClick={() => this.recover("#/")}>Zum Briefing</button>
        </div>
        {this.state.recoveryError && <p className="bad">{this.state.recoveryError}</p>}
      </section>
    </main>;
  }
}
