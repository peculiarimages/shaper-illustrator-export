#target illustrator

/*
 * Export for Shaper Origin
 *
 * Illustrator ExtendScript (ES3). The original document is never edited: visible
 * top-level artwork is duplicated into a temporary, one-artboard document, tagged,
 * exported, post-processed, and then discarded.
 */
(function () {
    // -------------------------------------------------------------------------
    // 1. DEPTH-COLOR MAPPING — edit only this table.
    // RGB values are 0..255; depthMm is written as shaper:cutDepth="Xmm".
    // tolerance is the maximum per-channel difference accepted after Illustrator's
    // color-managed conversion to RGB. Set to 0 for exact comparisons.
    // -------------------------------------------------------------------------
    var SETTINGS = {
        tolerance: 2,
        removeMappedDepthStrokes: true,
        coordinatePrecision: 7,
        depthColors: [
            { label: "red",     rgb: [255,   0,   0], depthMm: 3 },
            { label: "green",   rgb: [  0, 255,   0], depthMm: 6 },
            { label: "cyan",    rgb: [  0, 255, 255], depthMm: 9 },
            { label: "magenta", rgb: [255,   0, 255], depthMm: 12 }
        ]
    };

    var MARKER_PREFIX = "shaperDepthObject_";
    var SHAPER_NS = "http://www.shapertools.com/namespaces/shaper";
    var tempDoc = null;
    var exportedFile = null;

    try {
        if (app.documents.length === 0) {
            throw new Error("Open an Illustrator document before running this command.");
        }

        var sourceDoc = app.activeDocument;
        var destination = File.saveDialog("Export for Shaper Origin", "SVG:*.svg");
        if (!destination) { return; }
        destination = ensureSvgExtension(destination);

        var activeArtboardIndex = sourceDoc.artboards.getActiveArtboardIndex();
        var artboardRect = copyArray(sourceDoc.artboards[activeArtboardIndex].artboardRect);
        tempDoc = makeTemporaryDocument(sourceDoc, artboardRect);
        duplicateExportableArtwork(sourceDoc, tempDoc);

        var records = [];
        var counter = 1;
        // ---------------------------------------------------------------------
        // 2. ILLUSTRATOR OBJECT TRAVERSAL
        // Walk every duplicated layer/group recursively. Compound paths are one
        // semantic object because all component paths share appearance values.
        // ---------------------------------------------------------------------
        for (var li = 0; li < tempDoc.layers.length; li++) {
            counter = traverseContainer(tempDoc.layers[li], records, counter);
        }

        if (records.length === 0) {
            throw new Error("No visible path or compound path has a mapped stroke color.");
        }

        exportedFile = exportTemporarySvg(tempDoc);
        var svg = readUtf8(exportedFile);
        svg = injectShaperMetadata(svg, records, artboardRect);
        writeUtf8(destination, svg);

        if (exportedFile.fsName !== destination.fsName && exportedFile.exists) {
            exportedFile.remove();
        }
        tempDoc.close(SaveOptions.DONOTSAVECHANGES);
        tempDoc = null;
        app.activeDocument = sourceDoc;

        alert("Export for Shaper Origin complete.\n\n" + destination.fsName +
              "\n\nDepth-tagged objects: " + records.length);
    } catch (error) {
        if (tempDoc) {
            try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeError) {}
        }
        if (exportedFile && exportedFile.exists &&
                (!destination || exportedFile.fsName !== destination.fsName)) {
            try { exportedFile.remove(); } catch (removeError) {}
        }
        alert("Export for Shaper Origin failed:\n\n" + error.message);
    }

    function ensureSvgExtension(file) {
        if (!/\.svg$/i.test(file.name)) {
            return new File(file.fsName + ".svg");
        }
        return file;
    }

    function copyArray(value) {
        var result = [];
        for (var i = 0; i < value.length; i++) { result.push(value[i]); }
        return result;
    }

    function makeTemporaryDocument(source, rect) {
        var width = rect[2] - rect[0];
        var height = rect[1] - rect[3];
        var doc = app.documents.add(source.documentColorSpace, width, height);
        doc.artboards[0].artboardRect = rect;
        doc.artboards.setActiveArtboardIndex(0);
        return doc;
    }

    function isVisibleThroughParents(item) {
        var node = item;
        while (node && node.typename !== "Document") {
            try { if (node.hidden === true || node.visible === false) { return false; } } catch (e) {}
            node = node.parent;
        }
        return true;
    }

    function duplicateExportableArtwork(source, target) {
        var destinationLayer = target.layers[0];
        destinationLayer.name = "Shaper Export";
        var roots = [];
        for (var i = 0; i < source.pageItems.length; i++) {
            var item = source.pageItems[i];
            if (item.parent && item.parent.typename === "Layer" && isVisibleThroughParents(item)) {
                roots.push(item);
            }
        }
        // Illustrator's document pageItems are front-to-back. PLACEATBEGINNING in
        // reverse order retains the original stacking order in the temporary copy.
        for (i = roots.length - 1; i >= 0; i--) {
            try {
                var copy = roots[i].duplicate(destinationLayer, ElementPlacement.PLACEATBEGINNING);
                unlockRecursively(copy);
            } catch (e) {
                throw new Error("Could not duplicate exportable object '" +
                    (roots[i].name || roots[i].typename) + "': " + e.message);
            }
        }
    }

    function unlockRecursively(item) {
        try { item.locked = false; } catch (e) {}
        if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i++) { unlockRecursively(item.pageItems[i]); }
        }
    }

    function traverseContainer(container, records, counter) {
        var items = container.pageItems;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            // Some Illustrator collections expose descendants as well as direct
            // children. Parent filtering guarantees each object is visited once.
            if (item.parent !== container) { continue; }
            if (!isVisibleThroughParents(item)) { continue; }
            if (item.typename === "GroupItem") {
                counter = traverseContainer(item, records, counter);
            } else if (item.typename === "CompoundPathItem") {
                if (item.pathItems.length > 0) {
                    counter = tagIfMapped(item, item.pathItems[0], records, counter);
                }
            } else if (item.typename === "PathItem") {
                // A component path is visited through its CompoundPathItem only.
                if (!item.parent || item.parent.typename !== "CompoundPathItem") {
                    counter = tagIfMapped(item, item, records, counter);
                }
            }
        }
        return counter;
    }

    function tagIfMapped(namedItem, styledPath, records, counter) {
        if (!styledPath.stroked) { return counter; }
        var rgb = colorToRgb(styledPath.strokeColor);
        if (!rgb) { return counter; }
        var mapping = findDepth(rgb);
        if (!mapping) { return counter; }

        var marker = MARKER_PREFIX + zeroPad(counter, 6);
        namedItem.name = marker;
        records.push({ marker: marker, depthMm: mapping.depthMm });

        // Only the temporary copy is changed. Fill, geometry, and transforms stay
        // intact; mapped authoring strokes are suppressed before SVG export.
        if (SETTINGS.removeMappedDepthStrokes) {
            styledPath.stroked = false;
        }
        return counter + 1;
    }

    function zeroPad(value, length) {
        var text = String(value);
        while (text.length < length) { text = "0" + text; }
        return text;
    }

    function findDepth(rgb) {
        for (var i = 0; i < SETTINGS.depthColors.length; i++) {
            var candidate = SETTINGS.depthColors[i];
            if (Math.abs(rgb[0] - candidate.rgb[0]) <= SETTINGS.tolerance &&
                Math.abs(rgb[1] - candidate.rgb[1]) <= SETTINGS.tolerance &&
                Math.abs(rgb[2] - candidate.rgb[2]) <= SETTINGS.tolerance) {
                return candidate;
            }
        }
        return null;
    }

    function colorToRgb(color) {
        if (!color || color.typename === "NoColor") { return null; }
        var rgb;
        if (color.typename === "RGBColor") {
            rgb = [color.red, color.green, color.blue];
        } else if (color.typename === "CMYKColor") {
            // Deterministic device-CMYK conversion. This makes the authoring code
            // C=100 M=0 Y=0 K=0 compare to RGB [0,255,255] regardless of the user's
            // current ICC working profile.
            var c = color.cyan / 100, m = color.magenta / 100;
            var y = color.yellow / 100, k = color.black / 100;
            rgb = [255 * (1 - c) * (1 - k),
                   255 * (1 - m) * (1 - k),
                   255 * (1 - y) * (1 - k)];
        } else if (color.typename === "GrayColor") {
            // GrayColor.gray is 0=black, 100=white. The direct expression is
            // stable across Illustrator versions whose grayscale enum names vary.
            var gray = 255 * color.gray / 100;
            rgb = [gray, gray, gray];
        } else if (color.typename === "LabColor") {
            rgb = convertToRgb(ImageColorSpace.LAB, [color.l, color.a, color.b]);
        } else if (color.typename === "SpotColor") {
            rgb = colorToRgb(color.spot.color);
            if (!rgb) { return null; }
            var tint = color.tint / 100;
            rgb = [255 - (255 - rgb[0]) * tint,
                   255 - (255 - rgb[1]) * tint,
                   255 - (255 - rgb[2]) * tint];
        } else {
            return null; // Gradients and patterns cannot represent one depth color.
        }
        return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
    }

    function convertToRgb(sourceSpace, components) {
        return app.convertSampleColor(sourceSpace, components, ImageColorSpace.RGB,
                                      ColorConvertPurpose.defaultpurpose);
    }

    function exportTemporarySvg(doc) {
        app.activeDocument = doc;
        // Export to an isolated temporary path. The chosen destination is not
        // overwritten until matching and metadata injection have fully succeeded.
        var tempName = "shaper_origin_export_" + (new Date().getTime()) + "_" +
                       Math.floor(Math.random() * 1000000);
        var basePath = new File(Folder.temp.fsName + "/" + tempName).fsName;
        var fileSpec = new File(basePath);
        var options = new ExportOptionsSVG();
        options.compressed = false;
        options.coordinatePrecision = SETTINGS.coordinatePrecision;
        options.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
        options.documentEncoding = SVGDocumentEncoding.UTF8;
        options.DTD = SVGDTDVersion.SVG1_1;
        options.embedRasterImages = true;
        options.includeVariablesAndDatasets = false;
        options.optimizeForSVGViewer = false;
        options.preserveEditability = false;
        options.saveMultipleArtboards = true;
        options.artboardRange = "1";
        options.slices = false;
        doc.exportFile(fileSpec, ExportType.SVG, options);

        var direct = new File(basePath + ".svg");
        if (direct.exists) { return direct; }
        var suffixed = new File(basePath + "_1.svg");
        if (suffixed.exists) { return suffixed; }
        throw new Error("Illustrator did not create the expected SVG output file.");
    }

    function readUtf8(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) { throw new Error("Cannot read exported SVG: " + file.error); }
        var text = file.read();
        file.close();
        return text;
    }

    function writeUtf8(file, text) {
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) { throw new Error("Cannot write final SVG: " + file.error); }
        if (!file.write(text)) {
            var message = file.error;
            file.close();
            throw new Error("Cannot write final SVG: " + message);
        }
        file.close();
    }

    // -------------------------------------------------------------------------
    // 3. OBJECT-TO-EXPORTED-SVG MATCHING
    // Valid, unique marker names become SVG IDs. A marker may land directly on a
    // geometry element or (notably for some compound paths) on a container. In the
    // latter case metadata is propagated only to descendant geometry elements.
    // Every marker must match exactly once or export aborts.
    // -------------------------------------------------------------------------
    function injectShaperMetadata(svg, records, artboardRect) {
        svg = addNamespaceAndPhysicalSize(svg, artboardRect);
        for (var i = 0; i < records.length; i++) {
            svg = injectOneRecord(svg, records[i]);
        }
        return svg;
    }

    function injectOneRecord(svg, record) {
        var idPattern = "\\bid\\s*=\\s*([\\\"'])" + record.marker + "\\1";
        var startTagRe = new RegExp("<([A-Za-z_:][A-Za-z0-9_.:-]*)\\b[^>]*" + idPattern + "[^>]*>", "g");
        var match = startTagRe.exec(svg);
        if (!match) {
            throw new Error("SVG matching failed: Illustrator did not preserve marker " + record.marker + ".");
        }
        if (startTagRe.exec(svg)) {
            throw new Error("SVG matching failed: marker is not unique: " + record.marker + ".");
        }

        var tagName = match[1];
        var originalTag = match[0];
        var cleanedTag = removeMarkerId(originalTag, record.marker);
        if (isGeometryTag(tagName)) {
            cleanedTag = addDepthAttribute(cleanedTag, record.depthMm);
            return svg.substring(0, match.index) + cleanedTag + svg.substring(match.index + originalTag.length);
        }

        var closeIndex = findMatchingClose(svg, match.index + originalTag.length, tagName);
        if (closeIndex < 0) {
            throw new Error("SVG matching failed: unclosed marker container " + record.marker + ".");
        }
        var bodyStart = match.index + originalTag.length;
        var body = svg.substring(bodyStart, closeIndex);
        var geometryCount = 0;
        body = body.replace(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/gi, function (tag) {
            geometryCount++;
            return addDepthAttribute(tag, record.depthMm);
        });
        if (geometryCount === 0) {
            throw new Error("SVG matching failed: marker container has no vector geometry: " + record.marker + ".");
        }
        return svg.substring(0, match.index) + cleanedTag + body + svg.substring(closeIndex);
    }

    function removeMarkerId(tag, marker) {
        var re = new RegExp("\\s+id\\s*=\\s*([\\\"'])" + marker + "\\1", "i");
        return tag.replace(re, "");
    }

    function isGeometryTag(name) {
        return /^(path|rect|circle|ellipse|polygon|polyline|line)$/i.test(name);
    }

    function addDepthAttribute(tag, depthMm) {
        if (/\bshaper:cutDepth\s*=/.test(tag)) {
            return tag.replace(/\bshaper:cutDepth\s*=\s*(["'])[^"']*\1/,
                               'shaper:cutDepth="' + formatNumber(depthMm) + 'mm"');
        }
        return tag.replace(/\s*\/?\>$/, ' shaper:cutDepth="' + formatNumber(depthMm) + 'mm"$&');
    }

    function findMatchingClose(svg, bodyStart, tagName) {
        var tokenRe = new RegExp("<\\/?" + tagName + "\\b[^>]*>", "gi");
        tokenRe.lastIndex = bodyStart;
        var depth = 1;
        var token;
        while ((token = tokenRe.exec(svg)) !== null) {
            if (/^<\//.test(token[0])) {
                depth--;
                if (depth === 0) { return token.index; }
            } else if (!/\/\s*>$/.test(token[0])) {
                depth++;
            }
        }
        return -1;
    }

    // -------------------------------------------------------------------------
    // 4. SHAPER METADATA INJECTION
    // Add the Shaper namespace, force canonical physical dimensions in mm from the
    // exact artboard point dimensions (72 pt/in), and retain Illustrator's viewBox.
    // -------------------------------------------------------------------------
    function addNamespaceAndPhysicalSize(svg, rect) {
        var rootRe = /<svg\b[^>]*>/i;
        var match = rootRe.exec(svg);
        if (!match) { throw new Error("Exported file has no root <svg> element."); }
        var root = match[0];
        if (!/\bxmlns:shaper\s*=/.test(root)) {
            root = root.replace(/>$/, ' xmlns:shaper="' + SHAPER_NS + '">');
        }
        var widthMm = (rect[2] - rect[0]) * 25.4 / 72;
        var heightMm = (rect[1] - rect[3]) * 25.4 / 72;
        root = setRootAttribute(root, "width", formatNumber(widthMm) + "mm");
        root = setRootAttribute(root, "height", formatNumber(heightMm) + "mm");
        return svg.substring(0, match.index) + root + svg.substring(match.index + match[0].length);
    }

    function setRootAttribute(tag, name, value) {
        var re = new RegExp("\\s" + name + "\\s*=\\s*([\\\"'])[^\\\"']*\\1", "i");
        if (re.test(tag)) { return tag.replace(re, " " + name + '=\"' + value + '\"'); }
        return tag.replace(/>$/, " " + name + '=\"' + value + '\">');
    }

    function formatNumber(value) {
        var text = value.toFixed(7);
        text = text.replace(/0+$/, "").replace(/\.$/, "");
        return text;
    }
}());
