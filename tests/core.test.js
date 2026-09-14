const assert = require("assert");
const core = require("../src/ShaperCore.js");

const valid = ["3mm", "6.35mm", "12.5mm", "0.23in", "0.25in", "1.125in",
  "1/3in", "1/4in", "3/8in", "5/16in", "7/32in", "1 1/2in", "2 5/16in"];
valid.forEach(value => assert.strictEqual(core.parseDepth(value).valid, true, value));

assert.ok(Math.abs(core.parseDepth("1/4in").millimeters - core.parseDepth("0.25in").millimeters) < 1e-12);
assert.ok(Math.abs(core.parseDepth("1/2in").millimeters - core.parseDepth("12.7mm").millimeters) < 1e-12);

const normalized = {
  "1/4in": "6.35mm", "1/3in": "8.467mm", "0.23in": "5.842mm",
  "5/16in": "7.938mm", "1 1/2in": "38.1mm", "6.350mm": "6.35mm", "8.000mm": "8mm"
};
Object.keys(normalized).forEach(value => {
  assert.strictEqual(core.normalizedDepthAttribute(core.parseDepth(value)), normalized[value], value);
});

const invalid = ["0mm", "0in", "-3mm", "-1/4in", "1/0in", "1//4in",
  "1/4/8in", "6cm", "depth6mm", "sixmm", "1 2/0in", "1/4in junk"];
invalid.forEach(value => assert.strictEqual(core.parseDepth(value).valid, false, value));

console.log("ShaperCore: all depth parser and normalization tests passed");
