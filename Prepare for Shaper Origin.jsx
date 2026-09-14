#target illustrator
#include "src/ShaperCore.js"
#include "src/ShaperIllustrator.js"
(function(){try{if(!app.documents.length)throw new Error("Open a document first.");var layer=ShaperIllustrator.ensureRoot(app.activeDocument);alert("SHAPER layer is ready.\n\nCreate depth layers on demand or run Assign for Shaper Origin.");}catch(e){alert("Prepare for Shaper Origin failed:\n\n"+e.message);}}());
