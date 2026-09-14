/* Pure ES3-compatible Shaper logic. Runs in Illustrator ExtendScript and Node. */
(function (root) {
    var CONFIG = {
        rootLayerName: "SHAPER",
        shaperNamespace: "http://www.shapertools.com/namespaces/shaper",
        cutDepthAttribute: "shaper:cutDepth",
        depthResolutionMm: 0.001,
        markerPrefix: "shaperObject_",
        supportedUnits: ["mm", "in"],
        cutTypes: {
            Outside: { fill: [0, 0, 0], stroke: [0, 0, 0] },
            Inside:  { fill: [255, 255, 255], stroke: [0, 0, 0] },
            Pocket:  { fill: [128, 128, 128], stroke: null },
            OnLine:  { fill: null, stroke: [128, 128, 128] },
            Guide:   { fill: null, stroke: [0, 0, 255] }
        },
        svg: { coordinatePrecision: 7 }
    };

    function trim(text) { return String(text).replace(/^\s+|\s+$/g, ""); }

    function parseDepth(input) {
        var original = String(input);
        var text = trim(original);
        var match = /^(?:(\d+(?:\.\d+)?)|(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+))\s*(mm|in)$/i.exec(text);
        if (!match) { return invalid(original, "Use a positive integer, decimal, fraction, or mixed fraction followed by mm or in."); }

        var value;
        if (match[1] !== undefined) {
            value = Number(match[1]);
        } else if (match[2] !== undefined) {
            var whole = Number(match[2]), mixedNumerator = Number(match[3]), mixedDenominator = Number(match[4]);
            if (mixedDenominator === 0) { return invalid(original, "Fraction denominator cannot be zero."); }
            if (mixedNumerator >= mixedDenominator) { return invalid(original, "The fractional part of a mixed number must be less than one."); }
            value = whole + mixedNumerator / mixedDenominator;
        } else {
            var numerator = Number(match[5]), denominator = Number(match[6]);
            if (denominator === 0) { return invalid(original, "Fraction denominator cannot be zero."); }
            value = numerator / denominator;
        }
        if (!isFinite(value) || value <= 0) { return invalid(original, "Depth must be greater than zero."); }
        var unit = match[7].toLowerCase();
        return { valid: true, original: original, authoringName: text, value: value,
                 unit: unit, millimeters: unit === "in" ? value * 25.4 : value };
    }

    function invalid(original, message) {
        return { valid: false, original: original, error: message };
    }

    function normalizeMillimeters(mm) {
        var resolution = CONFIG.depthResolutionMm;
        var rounded = Math.round(mm / resolution) * resolution;
        var digits = decimalPlaces(resolution);
        return trimZeros(rounded.toFixed(digits));
    }

    function decimalPlaces(number) {
        var text = String(number);
        var index = text.indexOf(".");
        return index < 0 ? 0 : text.length - index - 1;
    }

    function trimZeros(text) {
        return text.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    }

    function normalizedDepthAttribute(parsed) {
        return normalizeMillimeters(parsed.millimeters) + "mm";
    }

    function cutTypeNames() {
        var names = [], name;
        for (name in CONFIG.cutTypes) {
            if (CONFIG.cutTypes.hasOwnProperty(name)) { names.push(name); }
        }
        return names;
    }

    function isCutType(name) { return CONFIG.cutTypes.hasOwnProperty(String(name)); }

    var api = {
        CONFIG: CONFIG,
        parseDepth: parseDepth,
        normalizeMillimeters: normalizeMillimeters,
        normalizedDepthAttribute: normalizedDepthAttribute,
        cutTypeNames: cutTypeNames,
        isCutType: isCutType
    };
    root.ShaperCore = api;
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
}(this));
