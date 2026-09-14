#target illustrator
#include "src/ShaperCore.js"
#include "src/ShaperIllustrator.js"
(function(){
    try{
        if(!app.documents.length)throw new Error("Open a document first.");
        var w=new Window("dialog","Assign for Shaper Origin");w.orientation="column";w.alignChildren="fill";
        var depthGroup=w.add("group");depthGroup.add("statictext",undefined,"Depth");var depth=depthGroup.add("edittext",undefined,"1/3in");depth.characters=18;
        var typeGroup=w.add("group");typeGroup.add("statictext",undefined,"Cut type");var types=ShaperCore.cutTypeNames();var cut=typeGroup.add("dropdownlist",undefined,types);var defaultIndex=0;for(var ti=0;ti<types.length;ti++)if(types[ti]==="Pocket")defaultIndex=ti;cut.selection=defaultIndex;
        var preview=w.add("statictext",undefined,"Export: 8.467mm");
        depth.onChanging=function(){var p=ShaperCore.parseDepth(depth.text);preview.text=p.valid?"Export: "+ShaperCore.normalizedDepthAttribute(p):"Invalid depth";};
        var buttons=w.add("group");buttons.alignment="right";buttons.add("button",undefined,"Cancel",{name:"cancel"});buttons.add("button",undefined,"Assign Selection",{name:"ok"});
        if(w.show()!==1)return;var result=ShaperIllustrator.assignSelection(app.activeDocument,depth.text,cut.selection.text);
        alert("Assigned "+result.count+" object(s) to\nSHAPER / "+result.depth.authoringName+" / "+result.cutType+"\n\nExport depth: "+ShaperCore.normalizedDepthAttribute(result.depth));
    }catch(e){alert("Assign for Shaper Origin failed:\n\n"+e.message);}
}());
