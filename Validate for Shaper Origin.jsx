#target illustrator
#include "src/ShaperCore.js"
#include "src/ShaperIllustrator.js"
(function(){try{if(!app.documents.length)throw new Error("Open a document first.");var r=ShaperIllustrator.validate(app.activeDocument);alert(ShaperIllustrator.formatValidation(r));}catch(e){alert("Validate for Shaper Origin failed:\n\n"+e.message);}}());
