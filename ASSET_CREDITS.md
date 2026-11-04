# Asset credits


Every asset added to this project must be recorded here with:
- Asset name
- Creator
- Source URL
- License
- Required attribution
- Local file path


## Audio assets (CC0 1.0)

Audio currently uses CC0 assets hosted by SFXMint. The provider describes these clips as AI-generated or synthesized; they are not presented as field recordings. They are used as initial ambience and movement layers and can later be replaced with real field recordings.

- Square village ambience (voices, footsteps, cart): https://sfxmint.com/sounds/village-ambience-01
- Market ambience (chatter and pottery): https://sfxmint.com/sounds/village-ambience-05
- Riverside water ambience: https://sfxmint.com/sounds/village-ambience-08
- Cafe interior (conversation and cup clinks): https://sfxmint.com/sounds/cafe-interior-ambience-01
- Fireplace: https://sfxmint.com/sounds/roaring-fireplace-sound-effect-01
- Stone footsteps: https://sfxmint.com/sounds/footsteps-stone-01
- Wooden-floor footsteps: https://sfxmint.com/sounds/footsteps-wood-05

All listed clips are marked CC0 1.0 by their provider.

## 3D models (CC0 1.0)

The following optional models are loaded at runtime from the public glTF repository below. The source repository includes a CC0 1.0 license file. The model files and their referenced textures are served from its `glTF/` directory.

- Asset pack: J-Ponzo, glTF Medieval Village MegaKit (standard GLTF subset)
- Source: https://github.com/J-Ponzo/gltf-medieval-village-megakit
- License: CC0 1.0 (see repository LICENSE)
- Models currently used: `Prop_Vine1.gltf`, `Prop_Vine2.gltf`, `Prop_Vine4.gltf`, `Prop_Vine5.gltf` (facade ivy), `Roof_RoundTiles_6x8.gltf` (tiled roof layers), `Roof_Dormer_RoundTile.gltf` (dormers), `Prop_Crate.gltf` (market crates), `Prop_Wagon.gltf` (merchant wagon)
- Runtime asset base: https://raw.githubusercontent.com/J-Ponzo/gltf-medieval-village-megakit/main/glTF/
- Local file path: remote runtime assets (not bundled in this repository)

These are stylized modular assets, not photorealistic scans. They are a first asset-driven pass and do not yet replace the main building, castle, or world-tree geometry.


The same CC0 pack provides the following runtime PBR texture maps: `T_Plaster_BaseColor.png`, `T_Plaster_Normal.png`, `T_WoodTrim_BaseColor.png`, `T_RoundTiles_BaseColor.png`, `T_RoundTiles_Normal.png`, `T_UnevenBrick_BaseColor.png`, and `T_UnevenBrick_Normal.png`.

## Animated townspeople and horse (CC0 1.0)

- Asset library: Gobkit free rigged character and animal models
- Source catalogue and exact model URLs: https://gobkit.com/api/free
- Licence: CC0 1.0 Universal (the library's model metadata identifies these files as public domain)
- Human models used: PeasantMilitia, Priestess, Scout, Footman, King
- Horse model used: PalominoHorse
- Runtime files: https://gobkit.com/freebies/human003/ and https://gobkit.com/freebies/animal012/
- These are stylized, rigged low-poly models with baked animation groups; they are a step up from the hand-built primitive figures, not photorealistic scans.
