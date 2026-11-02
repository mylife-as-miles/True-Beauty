# Development organization

This run uses actual independent coding agents in a shared workspace. Seven concurrent slots are available, so the requested ten ownership roles are covered by combined briefs. Roles are responsibilities, not a claim that ten agents ran.

| Actual task | Requested role coverage | Owned areas |
|---|---|---|
| `/root` | 1 Principal Architect; 8 UX implementation; integration owner | shared contracts, application shell/UI, repository foundation, integration, final verification |
| `/root/graphics` | 2 source integration (OpenMakeupSDK); 4 Shader/Graphics | makeup engine, AR renderer, GLSL, source notes |
| `/root/vision` | 3 Computer Vision; 6 hair tracking/camera | coordinated MediaPipe pipeline, camera lifecycle, face/hair/hands, virtual-makeup integration |
| `/root/skin_intelligence` | 2 source integration (SKIN_AI, Skyn); 5 Skin/Intelligence | analysis algorithms, provider API boundary, routine/recommendation algorithms |
| `/root/memory_agent` | 7 Agentic AI/Memory; database architect | Dexie schema, BeautyGraph, tool runtime, privacy controls |
| `/root/fashion_commerce` | 6 Fashion/Hair domain; 9 Product/Commerce | wardrobe/styling, static garment workflow, catalog/provenance, budget/prices |
| `/root/design_research_qa` | 8 Creative Direction research; 10 QA/review planning | product inventory, design/reference audit, Cook brief/evidence scenarios |

File ownership was assigned explicitly to avoid parallel writes. Source/model/asset licensing is audited by the owning integration agent; principal review checks cross-engine contracts before integration. Shared filesystem changes are visible immediately; separate worktrees are optional when independent commits are useful. No agent should overwrite another agent's files without coordination.

## Review roles

Visual, technical and product critique are separate review passes and must receive screenshots/test evidence and concrete requirements. A critic may not rate its own implementation as independent evidence. Fresh-context critics are preferred once initial implementation has screenshots. Their actual invocation, inputs and outputs belong in Cook rounds and the quality report. This file does not claim any review has already passed. Security and fairness require specialist perspectives when those gates are evaluated.
