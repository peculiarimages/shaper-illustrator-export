#target illustrator
#include "../src/ShaperCore.js"
#include "../src/ShaperIllustrator.js"
(function(){
    var mm=72/25.4,doc=app.documents.add(DocumentColorSpace.RGB,200*mm,120*mm);doc.artboards[0].artboardRect=[0,120*mm,200*mm,0];
    var shaper=ShaperIllustrator.ensureRoot(doc),d1=shaper.layers.add();d1.name="1/3in";var pocket=d1.layers.add();pocket.name="Pocket";
    var deep=pocket.groupItems.add(),g=deep.groupItems.add();g.pathItems.rectangle(105*mm,10*mm,30*mm,25*mm).name="Deep nested pocket";
    var compound=pocket.compoundPathItems.add();compound.name="Compound pocket";compound.pathItems.rectangle(100*mm,50*mm,35*mm,30*mm);compound.pathItems.rectangle(90*mm,60*mm,15*mm,10*mm);
    var d2=shaper.layers.add();d2.name="0.23in";var outside=d2.layers.add();outside.name="Outside";outside.pathItems.ellipse(105*mm,100*mm,30*mm,30*mm).name="Decimal inch outside";
    var d3=shaper.layers.add();d3.name="6.35mm";var names=ShaperCore.cutTypeNames();for(var i=0;i<names.length;i++){var l=d3.layers.add();l.name=names[i];var p=l.pathItems.rectangle((75-i*12)*mm,(115-i*20)*mm,10*mm,10*mm);p.name=names[i]+" test";if(names[i]==="OnLine"||names[i]==="Guide")p.closed=false;}
    var other=doc.layers.add();other.name="Outside SHAPER warning";other.pathItems.rectangle(20*mm,150*mm,10*mm,10*mm);
    alert("Test document created. Run Validate, then Export for Shaper Origin.");
}());
