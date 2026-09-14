#target illustrator
#include "src/ShaperCore.js"
#include "src/ShaperIllustrator.js"
(function(){
    try{
        if(!app.documents.length)throw new Error("Open a document first.");
        var file=File.saveDialog("Export for Shaper Origin","SVG:*.svg");if(!file)return;if(!/\.svg$/i.test(file.name))file=new File(file.fsName+".svg");
        var result=ShaperIllustrator.exportDocument(app.activeDocument,file);
        var message="Export complete.\n\n"+file.fsName+"\n\nObjects: "+result.count;
        if(result.validation.warnings.length)message+="\nWarnings: "+result.validation.warnings.length+" (run Validate for details)";alert(message);
    }catch(e){alert("Export for Shaper Origin failed:\n\n"+e.message);}
}());
