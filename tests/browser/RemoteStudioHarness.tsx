/** Dev/test harness only. Every screenshot identifies contract fixtures visibly. */
import React from "react";
import { createRoot } from "react-dom/client";
import RemoteStudio from "../../apps/web/src/components/RemoteStudio";
import "../../apps/web/src/styles.css";
declare global {
  interface Window {
    __remoteHarnessUse?: {
      kind: string;
      provider: string;
      feature: string;
      createdAt: string;
      size: number;
    };
  }
}
createRoot(document.getElementById("root")!).render(
  <>
    <div
      style={{
        padding: "10px 20px",
        background: "#4d3740",
        color: "#fffaf4",
        fontSize: 12,
        position: "sticky",
        top: 0,
        zIndex: 99,
      }}
      role="note"
    >
      CONTRACT FIXTURE · no live provider calls or credit spend · result imagery
      is test data
    </div>
    <div
      className="main-sheet"
      style={{ maxWidth: 1270, margin: "20px auto", minHeight: 900 }}
    >
      <RemoteStudio
        onUseResult={(blob, meta) => {
          window.__remoteHarnessUse = { ...meta, size: blob.size };
        }}
      />
    </div>
  </>,
);
