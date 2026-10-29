# Imported reference room

This replaces the finished environment with authored CC0 mesh assets. The runtime does not use the former procedural `world/interior.tsx`. Mathematical teaching diagrams, annotation planes and the original static Petros sprite remain programmatically presented. The existing scaffold and river illustrations remain legacy teaching models, pending the owner's mandatory room approval gate.

See [ASSETS.md](ASSETS.md) for readable credits and [asset-register.json](asset-register.json) for exact formats, triangle counts, texture dimensions, sizes, hashes and placement status. Twelve runtime files are used by the reference room; the worn bookshelf and lounge chair were acquired candidates and are not mounted.

## Reproduce the preparation

Run from the repository root, using Python 3, Node 24 and Blender 4.5.9 LTS. Blender was run from its official portable macOS ARM disk image, without installing a new system application. Download [Blender 4.5.9 ARM](https://download.blender.org/release/Blender4.5/blender-4.5.9-macos-arm64.dmg), mount the image, then use the executable path below (or substitute the path to your Blender installation). The temporary image used for this task has been unmounted after conversion.

```sh
python3 prototype/tools/acquire-realism.py
npm ci --prefix prototype/tools/asset-pipeline --ignore-scripts
node prototype/tools/asset-pipeline/convert.mjs
node prototype/tools/asset-pipeline/trim-material-maps.mjs
curl -fL https://download.blender.org/demo/test/classroom.zip -o prototype/assets/realism/source/classroom.zip
unzip -q -o prototype/assets/realism/source/classroom.zip -d prototype/assets/realism/source
/Volumes/Blender/Blender.app/Contents/MacOS/Blender -b prototype/assets/realism/source/classroom/classroom.blend --python prototype/tools/export-classroom.py
node prototype/tools/asset-pipeline/convert-classroom.mjs
python3 prototype/tools/finalize-realism.py
```

The converter keeps the original modeled geometry and authored image maps. Poly Haven downloads use the cached official metadata, a unique preparation User-Agent and MD5 validation. The Classroom ZIP comes from Blender's official demo library; its SHA256 is included in the handoff inventory. No source or preparation dependency is requested by the running browser.

Classroom extraction copies evaluated architectural meshes with their world transforms, removes the original internal corridor partition and its attached trim, and exports isolated room and board scenes. It translates the room; Blender's glTF exporter performs the standard Z-up to Y-up conversion. Old Cycles materials are adapted to glTF metallic/roughness materials using authored image maps. This is an adaptation, not a pixel-identical reproduction of the original offline render. Window portal surfaces become glass. The board's actual modeled frame and light fixture surround the generated teaching canvas.

GLBs use Meshopt geometry compression and WebP images. Color maps retain up to 2K resolution; normal and packed data maps use 1K. Geometry was not replaced by procedural shapes or decimated. Multiple book placements share imported geometry and texture objects. Runtime URLs include a content hash to prevent stale models after an asset update.

The existing gated showcase API serves an explicit filename allowlist from `runtime/`; source archives and metadata are never exposed by the asset route. Models are cached privately. A fresh browser context is used for reported loading measurements.

## Verify

```sh
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
PETROS_ISOLATED_VERIFICATION=1 PETROS_SHOWCASE_ENABLED=1 pnpm --filter @edrion/student-web exec next build
node prototype/tests/realism-loading.mjs
node prototype/tests/realism-verify.mjs
pnpm --filter @edrion/petros-showcase exec tsx tests/realism-regression.mts
```

The full regression covers the existing six lessons in both presenters and six viewports. It does not constitute visual approval of the legacy experiments. The reference capture is native browser footage at 1920 × 1080 with silent, prepared teaching; no offline renders or edited mockups are used as implementation evidence.

Only the imported room should be reviewed at this gate. A professionally modeled construction scaffold has not yet been acquired or integrated. Its five hazard controls still operate the previous procedural model. Live broad-topic model answers and articulated Petros animation retain the limitations documented in the main prototype README.
