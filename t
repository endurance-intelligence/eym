[1mdiff --git a/src/App.jsx b/src/App.jsx[m
[1mindex 546ebd0..ec749b2 100644[m
[1m--- a/src/App.jsx[m
[1m+++ b/src/App.jsx[m
[36m@@ -1,10 +1,5 @@[m
 import { lazy, Suspense } from "react";[m
[31m-import {[m
[31m-  HashRouter,[m
[31m-  Navigate,[m
[31m-  Routes,[m
[31m-  Route,[m
[31m-} from "react-router-dom";[m
[32m+[m[32mimport { HashRouter, Navigate, Routes, Route } from "react-router-dom";[m
 import Layout from "./components/Layout";[m
 import Briefing from "./pages/Briefing";[m
 import Auth from "./pages/Auth";[m
[36m@@ -23,13 +18,7 @@[m [mconst Planner = lazy(() => import("./pages/Planner"));[m
 [m
 function deferredPage(Component) {[m
   return ([m
[31m-    <Suspense[m
[31m-      fallback={[m
[31m-        <div className="route-loading" role="status">[m
[31m-          Bereich wird geladen …[m
[31m-        </div>[m
[31m-      }[m
[31m-    >[m
[32m+[m[32m    <Suspense fallback={<div className="route-loading" role="status">Bereich wird geladen …</div>}>[m
       <Component />[m
     </Suspense>[m
   );[m
[36m@@ -37,78 +26,9 @@[m [mfunction deferredPage(Component) {[m
 [m
 export default function App() {[m
   const { state, session, authLoading, cloudStatus } = useApp();[m
[31m-[m
[31m-  if (authLoading) {[m
[31m-    return ([m
[31m-      <main className="auth-shell">[m
[31m-        <section className="auth-card">[m
[31m-          <p className="eyebrow">Endurance Intelligence</p>[m
[31m-          <h1>Cloud wird verbunden …</h1>[m
[31m-        </section>[m
[31m-      </main>[m
[31m-    );[m
[31m-  }[m
[31m-[m
[31m-  if (!session) {[m
[31m-    return <Auth />;[m
[31m-  }[m
[31m-[m
[31m-  if (cloudStatus === "local" || cloudStatus === "loading") {[m
[31m-    return ([m
[31m-      <main className="auth-shell">[m
[31m-        <section className="auth-card">[m
[31m-          <p className="eyebrow">Endurance Intelligence</p>[m
[31m-          <h1>Dein Profil wird geladen …</h1>[m
[31m-          <p className="muted">[m
[31m-            Dein vorhandener Stand wird zuerst geprüft, damit nichts überschrieben wird.[m
[31m-          </p>[m
[31m-        </section>[m
[31m-      </main>[m
[31m-    );[m
[31m-  }[m
[31m-[m
[31m-  if (state.onboarding?.status !== "completed") {[m
[31m-    return ([m
[31m-      <ErrorBoundary>[m
[31m-        <Onboarding />[m
[31m-      </ErrorBoundary>[m
[31m-    );[m
[31m-  }[m
[31m-[m
[31m-  return ([m
[31m-    <ErrorBoundary>[m
[31m-      <HashRouter unstable_useTransitions={false}>[m
[31m-        <Routes>[m
[31m-          <Route element={<Layout />}>[m
[31m-            <Route index element={<Briefing />} />[m
[31m-[m
[31m-            <Route path="mission" element={deferredPage(Mission)} />[m
[31m-            <Route path="training" element={deferredPage(Training)} />[m
[31m-            <Route path="planner" element={deferredPage(Planner)} />[m
[31m-[m
[31m-            <Route path="coach" element={deferredPage(Coach)} />[m
[31m-            <Route[m
[31m-              path="coach/exercises"[m
[31m-              element={deferredPage(Exercises)}[m
[31m-            />[m
[31m-[m
[31m-            <Route path="fuel" element={deferredPage(Fuel)} />[m
[31m-[m
[31m-            <Route[m
[31m-              path="equipment"[m
[31m-              element={[m
[31m-                <Navigate[m
[31m-                  to="/settings?section=equipment"[m
[31m-                  replace[m
[31m-                />[m
[31m-              }[m
[31m-            />[m
[31m-[m
[31m-            <Route path="analytics" element={deferredPage(Analytics)} />[m
[31m-            <Route path="settings" element={deferredPage(Settings)} />[m
[31m-          </Route>[m
[31m-        </Routes>[m
[31m-      </HashRouter>[m
[31m-    </ErrorBoundary>[m
[31m-  );[m
[31m-}[m
\ No newline at end of file[m
[32m+[m[32m  if (authLoading) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Cloud wird verbunden …</h1></section></main>;[m
[32m+[m[32m  if (!session) return <Auth />;[m
[32m+[m[32m  if (cloudStatus === "local" || cloudStatus === "loading") return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Endurance Intelligence</p><h1>Dein Profil wird geladen …</h1><p className="muted">Dein vorhandener Stand wird zuerst geprüft, damit nichts überschrieben wird.</p></section></main>;[m
[32m+[m[32m  if (state.onboarding?.status !== "completed") return <ErrorBoundary><Onboarding /></ErrorBoundary>;[m
[32m+[m[32m  return <ErrorBoundary><HashRouter><Routes><Route element={<Layout />}><Route index element={<Briefing />} /><Route path="mission" element={deferredPage(Mission)} /><Route path="training" element={deferredPage(Training)} /><Route path="planner" element={deferredPage(Planner)} /><Route path="coach" element={deferredPage(Coach)} /><Route path="coach/exercises" element={deferredPage(Exercises)} /><Route path="fuel" element={deferredPage(Fuel)} /><Route path="equipment" element={<Navigate to="/settings?section=equipment" replace />} /><Route path="analytics" element={deferredPage(Analytics)} /><Route path="settings" element={deferredPage(Settings)} /></Route></Routes></HashRouter></ErrorBoundary>;[m
[32m+[m[32m}[m
[1mdiff --git a/src/main.jsx b/src/main.jsx[m
[1mindex ede8149..f1d7399 100644[m
[1m--- a/src/main.jsx[m
[1m+++ b/src/main.jsx[m
[36m@@ -3,39 +3,21 @@[m [mimport ReactDOM from "react-dom/client";[m
 import App from "./App";[m
 import { AppProvider } from "./context/AppContext";[m
 import { removeRecoveryMarker } from "./services/appRecovery";[m
[31m-import {[m
[31m-  briefingStartupUrl,[m
[31m-  shouldResetToBriefing,[m
[31m-} from "./services/startupNavigation";[m
 import "./styles/main.css";[m
 [m
[31m-const redirectToBriefing = shouldResetToBriefing(window.location);[m
[32m+[m[32mReactDOM.createRoot(document.getElementById("root")).render([m
[32m+[m[32m  <React.StrictMode>[m
[32m+[m[32m    <AppProvider>[m
[32m+[m[32m      <App />[m
[32m+[m[32m    </AppProvider>[m
[32m+[m[32m  </React.StrictMode>,[m
[32m+[m[32m);[m
 [m
[31m-if (redirectToBriefing) {[m
[31m-  window.location.replace(briefingStartupUrl(window.location));[m
[31m-} else {[m
[31m-  ReactDOM.createRoot(document.getElementById("root")).render([m
[31m-    <React.StrictMode>[m
[31m-      <AppProvider>[m
[31m-        <App />[m
[31m-      </AppProvider>[m
[31m-    </React.StrictMode>,[m
[31m-  );[m
[32m+[m[32mremoveRecoveryMarker();[m
 [m
[31m-  removeRecoveryMarker();[m
[31m-[m
[31m-  if ("serviceWorker" in navigator && import.meta.env.PROD) {[m
[31m-    window.addEventListener("load", () => {[m
[31m-      navigator.serviceWorker[m
[31m-        .register(`${import.meta.env.BASE_URL}sw.js`, {[m
[31m-          scope: import.meta.env.BASE_URL,[m
[31m-        })[m
[31m-        .catch((error) =>[m
[31m-          console.warn([m
[31m-            "Offline-Unterstützung konnte nicht aktiviert werden.",[m
[31m-            error,[m
[31m-          ),[m
[31m-        );[m
[31m-    });[m
[31m-  }[m
[31m-}[m
\ No newline at end of file[m
[32m+[m[32mif ("serviceWorker" in navigator && import.meta.env.PROD) {[m
[32m+[m[32m  window.addEventListener("load", () => {[m
[32m+[m[32m    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })[m
[32m+[m[32m      .catch((error) => console.warn("Offline-Unterstützung konnte nicht aktiviert werden.", error));[m
[32m+[m[32m  });[m
[32m+[m[32m}[m
