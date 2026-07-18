import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* Error boundary: a crash shows a friendly recovery screen,
   never a white page (React best practice for production). */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("DECODE crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F7", fontFamily: "system-ui, sans-serif", padding: 20 }}>
          <div style={{ background: "#fff", border: "1px solid #DDD", borderRadius: 16, padding: 30, maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🔍</div>
            <h2 style={{ color: "#222", margin: "10px 0 6px" }}>Something went wrong</h2>
            <p style={{ color: "#6A6A6A", fontSize: 14, lineHeight: 1.6 }}>Your progress is saved. Reload to continue where you left off.</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "12px 24px", borderRadius: 10, border: "none", background: "#E00B41", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// PWA: register the service worker (production only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
