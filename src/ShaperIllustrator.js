/* Illustrator-specific model, assignment, validation, export, and SVG encoding. */
(function (root) {
    var C = root.ShaperCore;
    if (!C) { throw new Error("ShaperCore.js must be loaded first."); }

    function findTopLayer(doc, name) {
        for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === name) return doc.layers[i];
        return null;
    }
    function findChildLayer(parent, name) {
        for (var i = 0; i < parent.layers.length; i++) if (parent.layers[i].name === name) return parent.layers[i];
        return null;
    }
    function ensureRoot(doc) {
        var layer = findTopLayer(doc, C.CONFIG.rootLayerName);
        if (!layer) { layer = doc.layers.add(); layer.name = C.CONFIG.rootLayerName; }
        return layer;
    }
    function ensureChild(parent, name) {
        var layer = findChildLayer(parent, name);
        if (!layer) { layer = parent.layers.add(); layer.name = name; }
        return layer;
    }

    function assignSelection(doc, depthText, cutType) {
        var depth = C.parseDepth(depthText);
        if (!depth.valid) throw new Error("Invalid depth '" + depthText + "': " + depth.error);
        if (!C.isCutType(cutType)) throw new Error("Unsupported cut type: " + cutType);
        if (!doc.selection || doc.selection.length === 0) throw new Error("Select artwork to assign first.");
        var rootLayer = ensureRoot(doc), depthLayer = ensureChild(rootLayer, depth.authoringName);
        var cutLayer = ensureChild(depthLayer, cutType), selection = [], i;
        for (i = 0; i < doc.selection.length; i++) selection.push(doc.selection[i]);
        unlockAncestors(cutLayer);
        for (i = selection.length - 1; i >= 0; i--) selection[i].move(cutLayer, ElementPlacement.PLACEATBEGINNING);
        return { depth: depth, cutType: cutType, count: selection.length };
    }

    function unlockAncestors(layer) {
        var current = layer;
        while (current && current.typename === "Layer") { current.locked = false; current.visible = true; current = current.parent; }
    }

    function validate(doc) {
        var result = { errors: [], warnings: [], assignments: [] };
        var roots = [], i;
        for (i = 0; i < doc.layers.length; i++) if (doc.layers[i].name === C.CONFIG.rootLayerName) roots.push(doc.layers[i]);
        if (roots.length === 0) { addError(result, "Document", "Missing top-level SHAPER layer.", "Run Prepare for Shaper Origin."); scanOutside(doc, null, result); return result; }
        if (roots.length > 1) addError(result, "Document", "Multiple top-level SHAPER layers make export ambiguous.", "Keep exactly one top-level SHAPER layer.");
        var shaper = roots[0];
        checkLayerState(shaper, "SHAPER", result);
        if (directPageItems(shaper).length) addError(result, "SHAPER", "Artwork is directly under SHAPER.", "Move it into SHAPER / depth / cut-type.");
        for (i = 0; i < shaper.layers.length; i++) validateDepthLayer(shaper.layers[i], result);
        if (shaper.layers.length === 0) addWarning(result, "SHAPER", "No depth layers exist.", "Assign artwork or create a valid depth layer.");
        scanOutside(doc, shaper, result);
        return result;
    }

    function validateDepthLayer(layer, result) {
        var path = "SHAPER / " + layer.name, parsed = C.parseDepth(layer.name), i;
        checkLayerState(layer, path, result);
        if (!parsed.valid) { addError(result, path, "Malformed depth layer: " + parsed.error, "Rename it using a positive value followed by mm or in."); return; }
        if (directPageItems(layer).length) addError(result, path, "Artwork is directly under a depth layer.", "Move it into a supported cut-type sublayer.");
        if (layer.layers.length === 0) addWarning(result, path, "Depth layer is empty.", "Add a cut-type layer or remove the empty depth layer.");
        for (i = 0; i < layer.layers.length; i++) validateCutLayer(layer.layers[i], parsed, result);
    }

    function validateCutLayer(layer, parsed, result) {
        var path = "SHAPER / " + layer.parent.name + " / " + layer.name;
        checkLayerState(layer, path, result);
        if (!C.isCutType(layer.name)) { addError(result, path, "Unknown cut-type layer.", "Use Outside, Inside, Pocket, OnLine, or Guide."); return; }
        if (layer.layers.length) addError(result, path, "Nested layers below a cut-type layer are ambiguous.", "Use groups, not additional layers, below the cut-type layer.");
        var items = directPageItems(layer);
        if (!items.length) addWarning(result, path, "Cut-type layer is empty.", "Add artwork or remove the empty layer.");
        for (var i = 0; i < items.length; i++) inspectItem(items[i], path, layer.name, parsed, result);
    }

    function inspectItem(item, path, cutType, parsed, result) {
        var objectPath = path + " / " + (item.name || item.typename);
        checkItemState(item, objectPath, result);
        if (item.typename === "GroupItem") {
            for (var i = 0; i < item.pageItems.length; i++) if (item.pageItems[i].parent === item) inspectItem(item.pageItems[i], objectPath, cutType, parsed, result);
        } else if (item.typename === "PathItem") {
            if (item.parent && item.parent.typename === "CompoundPathItem") return;
            validatePath(item, objectPath, cutType, result);
            result.assignments.push({ item: item, depth: parsed, cutType: cutType });
        } else if (item.typename === "CompoundPathItem") {
            if (!item.pathItems.length) addError(result, objectPath, "Empty compound path.", "Repair or remove it.");
            else { validatePath(item.pathItems[0], objectPath, cutType, result); result.assignments.push({ item: item, depth: parsed, cutType: cutType }); }
        } else if (item.typename === "TextFrame") {
            addError(result, objectPath, "Live text is not reliable Shaper geometry.", "Convert it to outlines before export.");
        } else if (item.typename === "RasterItem" || item.typename === "PlacedItem") {
            addError(result, objectPath, "Raster or placed artwork cannot be cut as vector geometry.", "Replace it with vector paths.");
        } else {
            addError(result, objectPath, "Unsupported Illustrator object type: " + item.typename + ".", "Expand it to paths or remove it from SHAPER.");
        }
    }

    function validatePath(path, objectPath, cutType, result) {
        if ((cutType === "Outside" || cutType === "Inside" || cutType === "Pocket") && !path.closed)
            addError(result, objectPath, cutType + " requires a closed path.", "Close the path or use OnLine/Guide.");
        if (path.guides || path.clipping) addWarning(result, objectPath, "Guide/clipping path semantics may affect export.", "Verify the exported SVG geometry.");
    }

    function checkLayerState(layer, path, result) {
        if (!layer.visible) addWarning(result, path, "Layer is hidden and will not export.", "Show it if it should be included.");
        if (layer.locked) addWarning(result, path, "Layer is locked.", "Unlock it before assigning or editing artwork.");
    }
    function checkItemState(item, path, result) {
        if (item.hidden) addWarning(result, path, "Artwork is hidden and will not export.", "Show it if it should be included.");
        if (item.locked) addWarning(result, path, "Artwork is locked.", "Unlock it before assigning or editing artwork.");
    }
    function scanOutside(doc, shaper, result) {
        for (var i = 0; i < doc.layers.length; i++) {
            var layer = doc.layers[i]; if (layer === shaper) continue;
            if (containsArtwork(layer)) addWarning(result, layer.name, "Artwork exists outside SHAPER and is excluded from export.", "Move intended cut geometry under SHAPER.");
        }
    }
    function containsArtwork(layer) { return layer.pageItems.length > 0; }
    function directPageItems(container) { var out=[]; for(var i=0;i<container.pageItems.length;i++) if(container.pageItems[i].parent===container) out.push(container.pageItems[i]); return out; }
    function addError(r,p,m,f){r.errors.push({path:p,message:m,fix:f});}
    function addWarning(r,p,m,f){r.warnings.push({path:p,message:m,fix:f});}

    function formatValidation(result) {
        var text = "ERRORS (" + result.errors.length + ")\n" + formatFindings(result.errors);
        text += "\n\nWARNINGS (" + result.warnings.length + ")\n" + formatFindings(result.warnings);
        text += "\n\nExportable vector objects: " + result.assignments.length;
        return text;
    }
    function formatFindings(items) {
        if (!items.length) return "None"; var text="";
        for(var i=0;i<items.length;i++) text += (i?"\n\n":"") + "• " + items[i].path + ": " + items[i].message + "\n  Fix: " + items[i].fix;
        return text;
    }

    function exportDocument(doc, destination) {
        var validation = validate(doc);
        if (validation.errors.length) throw new Error("Validation blocked export.\n\n" + formatValidation(validation));
        if (!validation.assignments.length) throw new Error("No exportable Shaper vector artwork was found.");
        var artboardIndex = doc.artboards.getActiveArtboardIndex(), rect = copyArray(doc.artboards[artboardIndex].artboardRect);
        var temp = null, tempSvg = null;
        try {
            temp = app.documents.add(doc.documentColorSpace, rect[2]-rect[0], rect[1]-rect[3]);
            temp.artboards[0].artboardRect = rect;
            var targetLayer = temp.layers[0], records=[], counter=1;
            var shaper=findTopLayer(doc,C.CONFIG.rootLayerName);
            for(var di=0;di<shaper.layers.length;di++){
                var parsed=C.parseDepth(shaper.layers[di].name);if(!parsed.valid)continue;
                for(var ci=0;ci<shaper.layers[di].layers.length;ci++){
                    var cutLayer=shaper.layers[di].layers[ci],cutType=cutLayer.name;if(!C.isCutType(cutType))continue;
                    var roots=directPageItems(cutLayer);
                    for(var ri=roots.length-1;ri>=0;ri--){
                        if(isEffectivelyHidden(roots[ri]))continue;
                        var copy=roots[ri].duplicate(targetLayer,ElementPlacement.PLACEATBEGINNING);unlockItem(copy);
                        counter=tagCopiedArtwork(copy,cutType,parsed,records,counter);
                    }
                }
            }
            if (!records.length) throw new Error("All Shaper artwork is hidden; nothing can be exported.");
            tempSvg=exportTempSvg(temp); var svg=readUtf8(tempSvg);
            svg=encodeSvg(svg,records,rect); writeUtf8(destination,svg);
            return { validation:validation, count:records.length, file:destination };
        } finally {
            if(temp) try{temp.close(SaveOptions.DONOTSAVECHANGES);}catch(e){}
            if(tempSvg&&tempSvg.exists) try{tempSvg.remove();}catch(e2){}
            try{app.activeDocument=doc;}catch(e3){}
        }
    }

    function tagCopiedArtwork(item,cutType,parsed,records,counter){
        if(item.typename==="GroupItem"){
            for(var i=0;i<item.pageItems.length;i++)if(item.pageItems[i].parent===item)counter=tagCopiedArtwork(item.pageItems[i],cutType,parsed,records,counter);
        }else if(item.typename==="PathItem"){
            if(item.parent&&item.parent.typename==="CompoundPathItem")return counter;
            var marker=C.CONFIG.markerPrefix+pad(counter++,6);item.name=marker;applyCutStyle(item,cutType);records.push({marker:marker,depth:C.normalizedDepthAttribute(parsed)});
        }else if(item.typename==="CompoundPathItem"){
            var compoundMarker=C.CONFIG.markerPrefix+pad(counter++,6);item.name=compoundMarker;applyCutStyle(item,cutType);records.push({marker:compoundMarker,depth:C.normalizedDepthAttribute(parsed)});
        }
        return counter;
    }

    function applyCutStyle(item, cutType) {
        var style=C.CONFIG.cutTypes[cutType];
        if(item.typename==="CompoundPathItem") { if(item.pathItems.length) stylePath(item.pathItems[0],style); }
        else stylePath(item,style);
    }
    function stylePath(path, style) {
        if(style.fill){path.filled=true;path.fillColor=rgb(style.fill);}else path.filled=false;
        if(style.stroke){path.stroked=true;path.strokeColor=rgb(style.stroke);path.strokeWidth=0.5;}else path.stroked=false;
    }
    function rgb(v){var c=new RGBColor();c.red=v[0];c.green=v[1];c.blue=v[2];return c;}
    function unlockItem(item){try{item.locked=false;}catch(e){} if(item.typename==="GroupItem")for(var i=0;i<item.pageItems.length;i++)unlockItem(item.pageItems[i]);}
    function isEffectivelyHidden(item){var n=item;while(n&&n.typename!=="Document"){try{if(n.hidden===true||n.visible===false)return true;}catch(e){}n=n.parent;}return false;}

    function exportTempSvg(doc){
        app.activeDocument=doc; var base=Folder.temp.fsName+"/shaper_"+(new Date().getTime())+"_"+Math.floor(Math.random()*1000000);
        var o=new ExportOptionsSVG();o.compressed=false;o.coordinatePrecision=C.CONFIG.svg.coordinatePrecision;o.cssProperties=SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;o.documentEncoding=SVGDocumentEncoding.UTF8;o.DTD=SVGDTDVersion.SVG1_1;o.embedRasterImages=false;o.preserveEditability=false;o.saveMultipleArtboards=true;o.artboardRange="1";o.slices=false;
        doc.exportFile(new File(base),ExportType.SVG,o);var f=new File(base+".svg");if(!f.exists)f=new File(base+"_1.svg");if(!f.exists)throw new Error("Illustrator did not create SVG output.");return f;
    }

    function encodeSvg(svg,records,rect){
        var root=/<svg\b[^>]*>/i.exec(svg);if(!root)throw new Error("Exported file has no root svg element.");
        var tag=root[0];if(!/\bxmlns:shaper\s*=/.test(tag))tag=tag.replace(/>$/,' xmlns:shaper="'+C.CONFIG.shaperNamespace+'">');
        tag=setAttribute(tag,"width",number((rect[2]-rect[0])*25.4/72)+"mm");tag=setAttribute(tag,"height",number((rect[1]-rect[3])*25.4/72)+"mm");
        svg=svg.substring(0,root.index)+tag+svg.substring(root.index+root[0].length);
        for(var i=0;i<records.length;i++)svg=injectRecord(svg,records[i]);return svg;
    }
    function injectRecord(svg,r){
        var re=new RegExp("<([A-Za-z_:][A-Za-z0-9_.:-]*)\\b[^>]*\\bid\\s*=\\s*([\\\"'])"+r.marker+"\\2[^>]*>","g"),m=re.exec(svg);
        if(!m)throw new Error("Illustrator did not preserve object marker "+r.marker+"; export stopped to prevent mismatched metadata.");if(re.exec(svg))throw new Error("Duplicate SVG marker "+r.marker+".");
        var original=m[0],clean=original.replace(new RegExp("\\s+id\\s*=\\s*([\\\"'])"+r.marker+"\\1","i"),"");
        if(isGeometry(m[1]))clean=addDepth(clean,r.depth);else{var close=findClose(svg,m.index+original.length,m[1]);if(close<0)throw new Error("Unclosed marker container "+r.marker);var body=svg.substring(m.index+original.length,close),count=0;body=body.replace(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*>/gi,function(t){count++;return addDepth(t,r.depth);});if(!count)throw new Error("Marker "+r.marker+" contains no SVG geometry.");return svg.substring(0,m.index)+clean+body+svg.substring(close);}
        return svg.substring(0,m.index)+clean+svg.substring(m.index+original.length);
    }
    function addDepth(tag,depth){return tag.replace(/\s*\/?\>$/,' '+C.CONFIG.cutDepthAttribute+'="'+depth+'"$&');}
    function isGeometry(n){return /^(path|rect|circle|ellipse|polygon|polyline|line)$/i.test(n);}
    function findClose(svg,start,name){var re=new RegExp("<\\/?"+name+"\\b[^>]*>","gi"),d=1,m;re.lastIndex=start;while((m=re.exec(svg))){if(/^<\//.test(m[0])){d--;if(!d)return m.index;}else if(!/\/\s*>$/.test(m[0]))d++;}return -1;}
    function setAttribute(tag,name,value){var re=new RegExp("\\s"+name+"\\s*=\\s*([\\\"'])[^\\\"']*\\1","i");return re.test(tag)?tag.replace(re," "+name+'="'+value+'"'):tag.replace(/>$/," "+name+'="'+value+'">');}
    function number(v){return v.toFixed(7).replace(/0+$/,"").replace(/\.$/,"");}
    function pad(v,n){var s=String(v);while(s.length<n)s="0"+s;return s;}
    function copyArray(a){var o=[];for(var i=0;i<a.length;i++)o.push(a[i]);return o;}
    function readUtf8(f){f.encoding="UTF-8";if(!f.open("r"))throw new Error("Cannot read SVG: "+f.error);var s=f.read();f.close();return s;}
    function writeUtf8(f,s){f.encoding="UTF-8";f.lineFeed="Unix";if(!f.open("w"))throw new Error("Cannot write SVG: "+f.error);if(!f.write(s)){var e=f.error;f.close();throw new Error("Cannot write SVG: "+e);}f.close();}

    root.ShaperIllustrator={ensureRoot:ensureRoot,assignSelection:assignSelection,validate:validate,formatValidation:formatValidation,exportDocument:exportDocument};
}(this));
