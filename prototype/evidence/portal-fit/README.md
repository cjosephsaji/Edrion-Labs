# Portal text containment correction

Both the pre-entry loading message and teleportation caption now share a centered composition with the circle. The text is bounded to 68% of its diameter, the headline uses two intentional lines, and the animation reveals text after the ring reaches a safe size. Loading has an opaque backdrop. Short windows get smaller typography; exceptionally short windows omit the decorative boundary.

Modified: `prototype/world/portal.tsx`, `prototype/world/portal.module.css`.
Added browser verification: `prototype/tests/portal-fit.mjs`.

`results.json` records live DOM/circle geometry during loading and animated entry at eight viewport sizes: 1920×1080, 1566×1086, 1440×900, 1366×768, 390×844, 360×800, 844×390 and 640×320. It checks circle clearance for readable text frames, no document overflow, and successful arrival in World. Both phases have actual screenshots here. TypeScript also passed (`typecheck.txt`).

The earlier V2 continuous recording predates this small portal layout correction; its teaching portion remains representative. These current screenshots show the corrected entry presentation.
