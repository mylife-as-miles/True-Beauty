import { useEffect, useState, lazy, Suspense } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ScanFace,
  Sparkles,
  FlaskConical,
  Shirt,
  ShoppingBag,
  NotebookPen,
  Settings2,
  ArrowUpRight,
  Menu,
  X,
  Palette,
  WifiOff,
  UserRound,
} from "lucide-react";
import { db, initializeDatabase } from "../../../packages/local-database/src";
import { useApp } from "./state/store";
import { Mark, IconButton } from "./components/ui";
import { ViewErrorBoundary } from "./components/ErrorBoundary";
import Studio from "./components/Studio";
import Discover from "./components/Discover";
import Journal from "./components/Journal";
const SkinLab = lazy(() => import("./components/SkinLab"));
const DressingRoom = lazy(() => import("./components/DressingRoom"));
const VisualCanvas = lazy(() => import("./components/VisualCanvas"));
const AgentPanel = lazy(() =>
  import("./components/AgentPanel").then((m) => ({ default: m.AgentPanel })),
);
const PrivacySettings = lazy(() =>
  import("./components/PrivacySettings").then((m) => ({
    default: m.PrivacySettings,
  })),
);
export default function App() {
  const mirrorFocused = useApp((s) => s.mirrorFocused);
  const space = useApp((s) => s.space),
    setSpace = useApp((s) => s.setSpace),
    toast = useApp((s) => s.toast),
    agentOpen = useApp((s) => s.agentOpen),
    settingsOpen = useApp((s) => s.settingsOpen);
  const [menu, setMenu] = useState(false),
    [wardrobeTab, setWardrobeTab] = useState("products"),
    [online, setOnline] = useState(navigator.onLine),
    [dbError, setDbError] = useState("");
  const saved = useLiveQuery(() => db.savedLooks.count(), []) ?? 0;
  useEffect(() => {
    initializeDatabase().catch(() =>
      setDbError(
        "Local storage could not open. Enable browser storage and reload to save your beauty data.",
      ),
    );
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useApp.getState().notify(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setMenu(false);
  }, [space]);
  const nav = [
    { id: "studio", label: "The studio", Icon: ScanFace },
    { id: "skin", label: "Skin & rituals", Icon: FlaskConical },
    { id: "wardrobe", label: "My wardrobe", Icon: Shirt },
    { id: "discover", label: "The beauty edit", Icon: ShoppingBag },
  ] as const;
  return (
    <div
      className={`app-shell ${space === "studio" && mirrorFocused ? "mirror-focused" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to your beauty space
      </a>
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => setSpace("studio")}
          aria-label="True Beauty A little more you. Home"
        >
          <Mark size={28} />
          <span>
            TRUE BEAUTY <span>A little more you.</span>
          </span>
        </button>
        <nav className="topnav" aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={space === n.id ? "active" : ""}
              onClick={() => setSpace(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <button
            className="companion-button"
            aria-label="Your beauty companion"
            onClick={() => useApp.getState().setAgentOpen(!agentOpen)}
          >
            <Sparkles size={16} />
            <span>Your beauty companion</span>
            <ArrowUpRight size={14} />
          </button>
          <button
            className="profile-button"
            onClick={() => useApp.getState().setSettingsOpen(true)}
            aria-label="Your profile and privacy"
          >
            <UserRound size={18} aria-hidden="true" />
            <span />
          </button>
          <IconButton
            className="mobile-menu"
            label={menu ? "Close navigation" : "Open navigation"}
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </IconButton>
        </div>
      </header>
      <div className="workspace">
        <aside
          className={`nav-rail ${menu ? "open" : ""}`}
          aria-label="Beauty spaces"
        >
          <nav aria-label="Beauty spaces">
            {nav.map((n) => (
              <button
                className={space === n.id ? "active" : ""}
                key={n.id}
                onClick={() => setSpace(n.id)}
                aria-label={n.label}
                title={n.label}
              >
                <n.Icon size={21} />
                <span>{n.label}</span>
              </button>
            ))}
            <div className="rail-divider" />
            <button
              className={space === "canvas" ? "active" : ""}
              onClick={() => setSpace("canvas")}
              aria-label="Inspiration canvas"
              title="Inspiration canvas"
            >
              <Palette size={21} />
              <span>Inspiration canvas</span>
            </button>
            <button
              className={space === "journal" ? "active" : ""}
              onClick={() => setSpace("journal")}
              aria-label="Beauty journal"
              title="Beauty journal"
            >
              <NotebookPen size={21} />
              <span>Beauty journal</span>
            </button>
          </nav>
          <div className="rail-bottom">
            <button
              aria-label="Privacy and settings"
              title="Privacy and settings"
              onClick={() => useApp.getState().setSettingsOpen(true)}
            >
              <Settings2 size={20} />
              <span>Privacy & settings</span>
            </button>
            <div className="rail-flower">
              <Mark size={23} />
            </div>
          </div>
        </aside>
        <main
          id="main"
          className={`main-sheet ${space === "studio" ? "studio-sheet" : ""}`}
          tabIndex={-1}
        >
          {!online && (
            <div className="offline-banner">
              <WifiOff size={16} />
              You’re offline. Your saved looks, wardrobe and rituals are still
              here.
            </div>
          )}
          {dbError && (
            <p role="alert" className="inline-error">
              {dbError}
            </p>
          )}
          <ViewErrorBoundary key={space}>
            <Suspense
              fallback={
                <div className="view-loading">
                  <Mark size={36} />
                  <p>Making space for you…</p>
                </div>
              }
            >
              {space === "studio" ? (
                <Studio />
              ) : space === "skin" || space === "intelligence" ? (
                <SkinLab />
              ) : space === "discover" ? (
                <Discover />
              ) : space === "journal" ? (
                <Journal />
              ) : space === "canvas" ? (
                <VisualCanvas />
              ) : (
                <>
                  <div className="wardrobe-tabs filter-tabs">
                    <button
                      className={wardrobeTab === "products" ? "active" : ""}
                      onClick={() => setWardrobeTab("products")}
                    >
                      My products
                    </button>
                    <button
                      className={wardrobeTab === "outfits" ? "active" : ""}
                      onClick={() => setWardrobeTab("outfits")}
                    >
                      Dressing room
                    </button>
                    <button onClick={() => setSpace("journal")}>
                      Saved looks ({saved}) <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {wardrobeTab === "products" ? (
                    <Discover ownedOnly />
                  ) : (
                    <DressingRoom />
                  )}
                </>
              )}
            </Suspense>
          </ViewErrorBoundary>
        </main>
      </div>
      {agentOpen && (
        <Suspense fallback={null}>
          <AgentPanel />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <PrivacySettings />
        </Suspense>
      )}
      {toast && (
        <div className="toast" role="status">
          <Mark size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => useApp.getState().notify("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <footer className="app-footer">
        <span>TRUE BEAUTY</span>
        <p>Made for self-expression. Kept personal.</p>
        <button onClick={() => useApp.getState().setSettingsOpen(true)}>
          Your data, your choice <ArrowUpRight size={12} />
        </button>
      </footer>
    </div>
  );
}
