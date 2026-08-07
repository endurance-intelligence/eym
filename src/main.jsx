import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { removeRecoveryMarker } from "./services/appRecovery";
import {
  briefingStartupUrl,
  shouldResetToBriefing,
} from "./services/startupNavigation";
import "./styles/main.css";

const redirectToBriefing = shouldResetToBriefing(window.location);

if (redirectToBriefing) {
  window.location.replace(briefingStartupUrl(window.location));
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>,
  );

  removeRecoveryMarker();

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch((error) =>
          console.warn(
            "Offline-Unterstützung konnte nicht aktiviert werden.",
            error,
          ),
        );
    });
  }
}