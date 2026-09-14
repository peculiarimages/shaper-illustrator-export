# Export for Shaper Origin

An Adobe Illustrator ExtendScript workflow that treats **fill color as the Shaper cut type** and **stroke color as an authoring-only depth code**. The exported SVG keeps Illustrator's fill and geometry, removes mapped depth strokes, and adds `shaper:cutDepth="Xmm"` metadata.

## Why this is an Illustrator script

As of September 2026, Adobe's published UXP application matrix does not list Illustrator. Illustrator's established ExtendScript DOM already exposes the required artwork tree, color models, color conversion, SVG export, and filesystem APIs, so a `.jsx` script is the smallest supported implementation. Adobe also documents that valid object names are used as SVG/XML IDs and that SVG export supports object IDs based on names.

References: [Illustrator scripting SVG options](https://ai-scripting.docsforadobe.dev/jsobjref/ExportOptionsSVG/), [Illustrator color conversion API](https://ai-scripting.docsforadobe.dev/jsobjref/Application/#applicationconvertsamplecolor), [Adobe SVG export options](https://helpx.adobe.com/illustrator/using/exporting-artwork.html), and [Adobe UXP support matrix](https://developer.adobe.com/premiere-pro/uxp/uxp-api/versions3-p/).

## Install

1. Quit Illustrator.
2. Copy `Export for Shaper Origin.jsx` into Illustrator's Scripts folder:
   - macOS: `/Applications/Adobe Illustrator [version]/Presets.localized/en_US/Scripts/`
   - Windows: `C:\Program Files\Adobe\Adobe Illustrator [version]\Presets\en_US\Scripts\`
3. Restart Illustrator.
4. Open a document, select the artboard to export, then choose **File > Scripts > Export for Shaper Origin**.

The script exports the active artboard as one SVG. Its `width` and `height` are written in canonical millimetres from Illustrator's exact 72-points-per-inch artboard dimensions; Illustrator's `viewBox` is left unchanged.

You can also run the file without installing it via **File > Scripts > Other Script…**.

## Edit the depth mapping

Open `Export for Shaper Origin.jsx` and edit only `SETTINGS.depthColors` near the top:

```javascript
depthColors: [
    { label: "red", rgb: [255, 0, 0], depthMm: 3 },
    { label: "green", rgb: [0, 255, 0], depthMm: 6 }
]
```

Comparisons use numeric RGB channels after conversion. `RGBColor`, `CMYKColor`, `GrayColor`, `LabColor`, and tinted `SpotColor` values are supported. CMYK uses a deterministic device-CMYK conversion so authoring primaries (for example C=100/M=0/Y=0/K=0) map predictably on every machine; Lab uses Illustrator's color conversion API. `tolerance` is a per-channel RGB tolerance (default `2`). Set it to `0` for exact matches.

Only mapped strokes are removed. Unmapped strokes remain exactly as Illustrator exports them and receive no `shaper:cutDepth`.

## How reliable object matching works

The script never tags the original artwork. It duplicates visible, exportable top-level artwork into a temporary one-artboard document, then recursively finds paths inside groups and treats each compound path as one semantic object. Each mapped object receives a unique XML-safe name such as `shaperDepthObject_000003` in the temporary copy.

Illustrator exports these names as SVG `id` values. The postprocessor requires every marker to occur exactly once. It attaches depth to that geometry element; if Illustrator places a compound-path marker on a container, it attaches the depth to the container's descendant vector geometry. It then removes the temporary ID. A missing or duplicate marker aborts with an error, preventing silent object/depth mismatches.

## Test workflow

1. Run `Create Shaper Export Test Document.jsx` with **File > Scripts > Other Script…**.
2. Run **Export for Shaper Origin** on the generated 200 mm × 120 mm document.
3. Open the SVG in a text editor and verify:
   - the nested black rectangle has `shaper:cutDepth="3mm"`;
   - the nested white circle has `shaper:cutDepth="6mm"`;
   - the blue-filled object whose stroke is CMYK cyan has `shaper:cutDepth="9mm"`;
   - the compound gray shape has `shaper:cutDepth="12mm"`;
   - the yellow object retains its unmapped blue stroke and has no cut depth;
   - mapped red/green/cyan/magenta strokes are absent;
   - root size is exactly `width="200mm" height="120mm"`, with the original `viewBox` intact;
   - the root contains `xmlns:shaper="http://www.shapertools.com/namespaces/shaper"` and no `shaperDepthObject_` IDs remain.

## Scope and safeguards

- Hidden artwork is not exported, matching Illustrator's SVG behavior.
- Paths, nested groups, clipping structures, and compound paths are duplicated without changing source geometry or transforms.
- Mapped strokes are removed only in the temporary document. The Illustrator source is never renamed, restyled, saved, or closed.
- Text, raster, mesh, and placed art are preserved by duplication but do not receive depth metadata. Convert text to outlines first if it must carry a Shaper cut depth.
- Illustrator export may rasterize unsupported effects; the script fails if a tagged marker does not survive as vector SVG.
