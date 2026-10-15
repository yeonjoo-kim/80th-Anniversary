const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(require("node:path").join(__dirname, "../core.js"), "utf8") +
    ";globalThis.core=afsCore;",
  sandbox,
);
const core = sandbox.core;
const rgb = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
function pixels(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4);
  return data;
}
test("all eight supplied palette colors map to distinct analysis families", () => {
  assert.equal(core.assets.length, 8);
  for (const [i, asset] of core.assets.entries())
    assert.equal(core.family(...rgb(asset.hex), 0.18), i, asset.hex);
});
test("eight significant color regions produce eight different directions", () => {
  const w = 80,
    h = 80,
    data = pixels(w, h, [255, 255, 255]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      data.set(
        [...rgb(core.assets[Math.floor(x / 10)].hex), 255],
        (y * w + x) * 4,
      );
  const result = core.analyze(data, w, h, "low");
  assert.equal(result.active.length, 8);
  assert.equal(result.fallback, false);
  assert.equal(new Set(result.active.map((a) => a.dir)).size, 8);
  for (const arrow of result.active) assert.equal(arrow.coverage, 0.125);
});
test("three-percent boundary and weak-color fallback retain a real photo color", () => {
  const w = 20,
    h = 20,
    data = pixels(w, h, [255, 255, 255]);
  for (let i = 0; i < 12; i++) data.set([0, 153, 255, 255], i * 4);
  let result = core.analyze(data, w, h, "low");
  assert.equal(result.active.length, 1);
  assert.equal(result.fallback, false);
  assert.equal(result.active[0].coverage, 0.03);
  for (let i = 8; i < 12; i++) data.set([255, 255, 255, 255], i * 4);
  result = core.analyze(data, w, h, "low");
  assert.equal(result.fallback, "weak");
  assert.equal(result.active[0].hex, "#0099FF");
});
test("white and transparent inputs use the declared default, mid-gray is analyzed", () => {
  for (const data of [
    pixels(20, 20, [255, 255, 255]),
    new Uint8ClampedArray(20 * 20 * 4),
  ]) {
    const result = core.analyze(data, 20, 20, "low");
    assert.equal(result.fallback, "neutral");
    assert.equal(result.active[0].hex, "#0099FF");
  }
  const gray = core.analyze(pixels(20, 20, [198, 199, 201]), 20, 20, "low");
  assert.equal(gray.fallback, false);
  assert.equal(gray.active[0].hex, "#C6C7C9");
});
