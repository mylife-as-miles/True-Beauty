# Engineering decisions

2026-11-02, initial development rounds.

1. Preserve full product scope in a219-capability inventory; implement connected local workflows while explicitly blocking unavailable providers and unvalidated classifiers. No cosmetic fallback is labelled a clinical result.
2. React19/Vite7/TypeScript5.9, Tailwind4 custom design system, Dexie4, Zod4 and Zustand5 are installed with a lockfile and verified together. Custom Canvas/WebGL geometry is currently more direct than a Three.js scene; Three/R3F are available but no unnecessary3D dependency is put in the initial UI.
3. Real source reuse from all four pinned repositories, with full retained notices where present. Upstream Virtual Makeup's missing LICENSE file and separate model/asset rights remain distribution blockers. No scraped Skyn datasets/weights or upstream uncertain raster assets.
4. One Tasks Vision pipeline, CPU worker baseline: headless GPU inference unsupported/unpredictable; actual worker benchmarks preserve UI responsiveness. Face, hair and hands share input coordination but use independent cadence. Temporal hair smoothing does not claim optical flow.
5. Shader backend runs on actual hardware WebGL2. Software GPU is slower in measured fixtures, so Canvas fallback is selected and reflective finishes are disabled/labeled. OpenCV masking is optional because its512px masks measured slower than Canvas in this environment, while offering an independently testable precision route.
6. Skyn classifiers are not deployed without licensed training/evaluation evidence. Its deterministic k-means and feature/cosine recommendation logic are operational instead; user correction and self-report are authoritative.
7. Current official YouCam docs replace MIROIR's stale file endpoint. Paid requests require server-held credential, reviewed SKU hash/plan, one-use quote, explicit image/credit authorization and spending reservation; no key/no authorization means no remote operation.
8. Taste framed-sheet direction + original pigment-derived palette and editorial fonts. Proofline selection lenses inform ingredient exploration; Common Table continuity informs preserving the current scene across products/wardrobe. No restricted reference code copied.
9. Independent review exposed consent TOCTOU, revoked prose reimport and late camera leaks. Fixed with atomic consent/write transactions, import dependency filtering and shared camera lifecycle; exact adversarial regressions retained.
10. Split comparison must be in display space. A static source fraction is wrong under object-fit cropping and zoom. Map the visible slider through drawn image scale; ResizeObserver invalidates the static frame after resize.
11. Local sample catalogue never claims current prices, inventory, exact dupes or checkout. NGN/USD are separate illustrative amounts, not exchange conversions. Missing GBP/EUR prices are explicitly unavailable.
12. Production offline shell is built from the real asset graph. Vite development HMR is not a reliable offline target. Restrict Vite/Tailwind watchers to exclude Playwright trace HTML, which caused real reload loops during early tests.
13. No remote deployment/push/publishing or paid requests in this checkpoint. No background completion claim; persistent files preserve exact next tasks.
