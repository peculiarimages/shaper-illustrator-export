#target illustrator

/* Creates a 200 mm x 120 mm Illustrator test document for the exporter. */
(function () {
    var MM = 72 / 25.4;
    var doc = app.documents.add(DocumentColorSpace.RGB, 200 * MM, 120 * MM);
    doc.artboards[0].artboardRect = [0, 120 * MM, 200 * MM, 0];
    var layer = doc.layers[0];
    layer.name = "Shaper exporter tests";

    function rgb(r, g, b) {
        var c = new RGBColor(); c.red = r; c.green = g; c.blue = b; return c;
    }
    function cmyk(c, m, y, k) {
        var color = new CMYKColor(); color.cyan = c; color.magenta = m;
        color.yellow = y; color.black = k; return color;
    }
    function style(path, fill, stroke) {
        path.filled = true; path.fillColor = fill; path.stroked = true;
        path.strokeColor = stroke; path.strokeWidth = 2;
    }

    // Nested group: RGB red -> 3 mm and RGB green -> 6 mm.
    var outer = layer.groupItems.add(); outer.name = "Nested group";
    var inner = outer.groupItems.add(); inner.name = "Inner group";
    var redPath = inner.pathItems.rectangle(105 * MM, 10 * MM, 30 * MM, 25 * MM);
    style(redPath, rgb(0, 0, 0), rgb(255, 0, 0)); redPath.name = "Nested RGB red";
    var greenPath = inner.pathItems.ellipse(105 * MM, 50 * MM, 25 * MM, 25 * MM);
    style(greenPath, rgb(255, 255, 255), rgb(0, 255, 0)); greenPath.name = "Nested RGB green";

    // CMYK cyan converts to RGB cyan -> 9 mm.
    var cyanPath = layer.pathItems.rectangle(65 * MM, 10 * MM, 35 * MM, 25 * MM);
    style(cyanPath, rgb(0, 0, 255), cmyk(100, 0, 0, 0)); cyanPath.name = "CMYK cyan";

    // Unmapped blue: remains a visible SVG stroke and gets no depth metadata.
    var unmapped = layer.pathItems.rectangle(65 * MM, 55 * MM, 35 * MM, 25 * MM);
    style(unmapped, rgb(255, 255, 0), rgb(0, 0, 255)); unmapped.name = "Unmapped blue";

    // Compound path: two component rectangles, RGB magenta -> 12 mm.
    var compound = layer.compoundPathItems.add(); compound.name = "Compound magenta";
    var outerRect = compound.pathItems.rectangle(110 * MM, 105 * MM, 55 * MM, 35 * MM);
    var hole = compound.pathItems.rectangle(100 * MM, 120 * MM, 25 * MM, 15 * MM);
    style(outerRect, rgb(128, 128, 128), rgb(255, 0, 255));
    // Illustrator shares appearance across compound components.
    hole.evenodd = true;

    alert("Test document created. Run File > Scripts > Export for Shaper Origin.");
}());
