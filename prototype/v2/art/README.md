# Editable world assets

The `.blend` files and Python source are project-authored models, not third-party asset packs. Blender 4.5.3 LTS, glTF Transform 4.5.1 and KTX-Software 4.4.2 were used. No paid service is needed. Keep the Petros identity under its owner's existing rights; see `../ASSETS.md`.

To regenerate with Blender and `toktx` available:

```sh
blender -b --python art/build_world.py
blender -b --python art/bake_hero.py
blender -b --python art/bake_environment.py
blender -b --python art/build_cloud.py
blender -b --python art/build_planet.py
python3 art/prepare_assets.py
node art/proxies.mjs
node art/asset_inventory.mjs
```

`PETROS_KTX_BIN` can point to the directory containing `toktx`. The compression pipeline applies Meshopt **after** texture transforms; otherwise reading a compressed GLB for texture work silently decodes its geometry. Validate both `EXT_meshopt_compression` and `KHR_texture_basisu` in `evidence/world-rebuild/assets.json`.

For environment-only edits, use `rebuild_environment.py` then `bake_environment.py` and compress that export. This leaves rigged, baked hero exports intact. Final car/proxy geometry was simplified to about 2,004 triangles with glTF Transform `simplify --ratio .48 --error .005` before final Meshopt; preserve the UVs and embedded AO.

Fonts are self-hosted. The SDF Outfit font is a static weight-450 instance generated from the OFL variable original with `fontTools.varLib.instancer.instantiateVariableFont`; CSS keeps the variable original. Text is rendered with Troika SDF, never painted into the scenery's image maps.

`bake_hero.py` also renders `evidence/world-rebuild/petros-model-preview.png`. Browser captures remain the authority for actual composition, shading and performance; a Blender render is an asset check, not application acceptance.
