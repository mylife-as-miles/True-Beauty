# Virtual Makeup attribution

Source: https://github.com/otdnnc/virtual-makeup
Commit: 1d6ed5ef2b1c947dcbc144fa9fde2a26b6745fc1
Author listed in README: otdnnc <otdnnc@gmail.com>

The upstream README declares exactly: `MIT — see [LICENSE](./LICENSE).`
The linked standalone LICENSE file is absent at this commit. We preserve the
available licensing declaration and attribution without inventing a copyright
year or fabricating a missing upstream file. Commercial redistribution audit
must resolve the missing full notice with the upstream author.

Adapted implementation paths:
- apps/web/src/hooks/useCamera.ts -> src/useCamera.ts
- apps/web/src/hooks/useMediaPipeVision.ts -> src/index.ts
- apps/web/src/hooks/useMakeupRenderer.ts -> src/index.ts frame scheduler
- apps/web/src/lib/makeup/landmarks.ts -> ../face-tracking/src/index.ts coordinate utility
- apps/web/src/lib/makeup/hair.ts -> ../hair-segmentation/src/index.ts mask recolouring

Changes are documented in docs/source-notes/virtual-makeup.md.
