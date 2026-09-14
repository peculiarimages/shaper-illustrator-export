# Shaper Origin tools for Adobe Illustrator

Four commands for the latest production Adobe Illustrator:

- **Prepare for Shaper Origin** creates the top-level `SHAPER` layer.
- **Assign for Shaper Origin** moves selected artwork to a validated depth/cut-type layer.
- **Validate for Shaper Origin** reports structural errors and warnings.
- **Export for Shaper Origin** creates a ready-to-use Shaper SVG.

The Layers panel is the sole authoring source of truth:

```text
SHAPER
└── 1/3in                 depth, preserved exactly as typed
    └── Pocket            cut type
        └── Group
            └── Path
```

No color encodes depth in Illustrator. Depth comes only from the depth-layer name; cut type comes only from the cut-type-layer name.

## Architecture

Adobe's current UXP host matrix does not list Illustrator, and native C++ would be excessive. This uses Illustrator's supported ExtendScript DOM and lightweight ScriptUI dialogs. Commands are separate `.jsx` entry points; reusable logic is split into `src/ShaperCore.js` (Illustrator-independent parsing/configuration) and `src/ShaperIllustrator.js` (layers, assignment, validation, traversal, export, matching, and SVG encoding). The UI can therefore be replaced later without rewriting the engine.

References: [Illustrator SVG scripting](https://ai-scripting.docsforadobe.dev/jsobjref/ExportOptionsSVG/), [Illustrator artwork tree](https://ai-scripting.docsforadobe.dev/objectmodel/theArtworkTree/), [Adobe UXP matrix](https://developer.adobe.com/premiere-pro/uxp/uxp-api/versions3-p/), [official Shaper cut encoding](https://support.shapertools.com/hc/en-us/articles/115002721473-Cut-Type-Encoding), and [Shaper real-world SVG units](https://support.shapertools.com/hc/en-us/articles/115002735274-SVG-Files-Basics).

## Installation

Quit Illustrator and copy this entire folder, including `src`, into:

```text
macOS:   /Applications/Adobe Illustrator [version]/Presets.localized/en_US/Scripts/Shaper Origin/
Windows: C:\Program Files\Adobe\Adobe Illustrator [version]\Presets\en_US\Scripts\Shaper Origin\
```

Restart Illustrator. The commands appear under **File > Scripts**. During development, run them through **File > Scripts > Other Script…** while retaining the folder structure.

## Usage

Run **Prepare** once. It creates only `SHAPER`; depths are never pre-populated. Select artwork and run **Assign**, enter a depth, select `Outside`, `Inside`, `Pocket`, `OnLine`, or `Guide`, and assign. Missing layers are created without modifying geometry. Equivalent names such as `1/4in` and `0.25in` remain distinct and are never renamed or merged.

Run **Validate** to inspect the full hierarchy, then **Export**. Only visible vector artwork under `SHAPER / valid depth / supported cut type` is exported. Artwork outside SHAPER is reported and excluded.

## Depth grammar and normalization

After trimming surrounding whitespace, a valid positive depth is:

- integer: `3mm`, `2in`
- decimal: `6.35mm`, `0.23in`
- fraction: `1/2mm`, `5/16in`
- mixed fraction: `1 1/2in`, `2 5/16in`

It must end in `mm` or `in` (case-insensitive). Denominators must be nonzero; a mixed fractional part must be less than one. Zero, negative, malformed, suffixed, and unsupported-unit values are rejected.

Inches use exactly `1in = 25.4mm`. Serialization rounds only at the end to the centralized `0.001mm` resolution and removes trailing zeroes:

```text
1/4in   → 6.35mm
1/3in   → 8.467mm
0.23in  → 5.842mm
5/16in  → 7.938mm
1 1/2in → 38.1mm
```

All constants—including namespace, precision, marker prefix, and cut types—live in `ShaperCore.CONFIG`.

## Cut types

The centralized export mapping follows Shaper's official RGB encoding:

| Layer | SVG appearance |
|---|---|
| `Outside` | black fill and black stroke |
| `Inside` | white fill and black stroke |
| `Pocket` | gray fill, no stroke |
| `OnLine` | gray stroke, no fill |
| `Guide` | blue stroke, no fill |

These colors are applied only to a temporary document. Outside, Inside, and Pocket require closed paths.

## Validation

Errors block export: missing/duplicate SHAPER roots, artwork at an invalid hierarchy level, malformed depths, unknown cut types, layers below cut types, live text, raster/placed or unsupported artwork, empty compounds, and open paths assigned a closed-shape cut type.

Warnings do not block automatically: artwork outside SHAPER, hidden/locked relevant layers or artwork, empty depth/cut-type layers, and guide/clipping paths. Every finding identifies the affected hierarchy and suggests a fix.

## Export and object matching

Each cut-layer's top-level artwork is duplicated intact into a temporary one-artboard document, preserving nested group transforms and compound paths. Every descendant path/compound receives a unique XML-safe name such as `shaperObject_000004`; Illustrator exports it as an SVG ID. The postprocessor requires every marker exactly once, injects normalized `shaper:cutDepth`, handles compound containers by annotating descendant geometry, and removes temporary IDs. Missing/duplicate markers abort instead of risking wrong metadata.

The SVG root receives `xmlns:shaper="http://www.shapertools.com/namespaces/shaper"`. Active-artboard width/height are converted from Illustrator points with exactly `25.4 / 72` and written in millimetres, while Illustrator's `viewBox` is retained.

```text
SHAPER / 1/3in / Pocket / Path
SHAPER / 0.23in / Outside / Path
```

becomes conceptually:

```xml
<path fill="#808080" shaper:cutDepth="8.467mm" d="…"/>
<path fill="#000000" stroke="#000000" shaper:cutDepth="5.842mm" d="…"/>
```

No source artwork is renamed/restyled/saved, and no manual XML editing is required.

## Tests

Run core tests:

```sh
node tests/core.test.js
```

For integration, run `tests/Create Shaper Test Document.jsx`, then **Validate** and **Export**. It creates a 200mm × 120mm artboard with all cut types, several depths, multiple objects, deeply nested groups, a compound path, and outside-SHAPER artwork. Verify exact root dimensions, intact `viewBox`, `1/3in → 8.467mm`, `0.23in → 5.842mm`, correct cut colors, compound metadata, excluded unrelated artwork, no temporary IDs, and an unchanged source document.

Add deliberately malformed layers plus hidden/locked, live text, raster, placed, and unsupported objects to exercise remaining diagnostics.
