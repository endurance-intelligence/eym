import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error("EYM page failed", error, details);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="route-error-shell" role="alert">
      <section className="card route-error-card">
        <p className="eyebrow">Bereich konnte nicht geladen werden</p>
        <h1>EYM ist weiterhin sicher gespeichert.</h1>
        <p className="muted">Meist wurde während eines Deployments noch eine ältere Datei angefordert. Lade die Anwendung einmal vollständig neu.</p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>Anwendung neu laden</button>
      </section>
    </main>;
  }
}
