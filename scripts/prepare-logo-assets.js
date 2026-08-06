// Converts the user-supplied logo reference images into cropped PNGs with
// transparent backgrounds. The screenshots contain the logo's background and
// its interior holes in the same colour, so removing that colour family also
// correctly opens the holes for use on Atlas surfaces and native Windows UI.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const assetDir = path.join(__dirname, '..', 'src', 'renderer', 'assets');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function alphaFromBackground(pixel, mode) {
  const [r, g, b] = pixel;
  if (mode === 'dark') {
    // The dark reference has a near-black background and an off-white/yellow
    // mark. Keep a soft edge where the source anti-aliasing mixes both.
    const brightness = Math.max(r, g, b);
    return Math.round(clamp((brightness - 28) / 90, 0, 1) * 255);
  }

  // The light reference has a warm-white background. The mark is charcoal or
  // ochre, so the minimum channel is a reliable distance from that background.
  const distanceFromWhite = 238 - Math.min(r, g, b);
  return Math.round(clamp(distanceFromWhite / 70, 0, 1) * 255);
}

async function prepare(mode) {
  const source = path.join(assetDir, `atlas-logo-reference-${mode}.png`);
  const image = await loadImage(source);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, image.width, image.height);
  const { data, width, height } = imageData;
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = alphaFromBackground(data.subarray(offset, offset + 3), mode);
    data[offset + 3] = alpha;
    if (alpha < 18) continue;
    const index = offset / 4;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  context.putImageData(imageData, 0, 0);
  const contentWidth = right - left + 1;
  const contentHeight = bottom - top + 1;
  const padding = Math.round(Math.max(contentWidth, contentHeight) * 0.055);
  const cropSize = Math.max(contentWidth, contentHeight) + padding * 2;
  const cropLeft = Math.max(0, Math.round(left - (cropSize - contentWidth) / 2));
  const cropTop = Math.max(0, Math.round(top - (cropSize - contentHeight) / 2));
  const output = createCanvas(1024, 1024);
  const outputContext = output.getContext('2d');
  outputContext.drawImage(canvas, cropLeft, cropTop, cropSize, cropSize, 0, 0, 1024, 1024);
  const destination = path.join(assetDir, `atlas-logo-reference-${mode}-transparent.png`);
  fs.writeFileSync(destination, output.toBuffer('image/png'));
  if (mode === 'dark') {
    const nativeIconDir = path.join(__dirname, '..', 'assets', 'icons');
    fs.mkdirSync(nativeIconDir, { recursive: true });
    fs.copyFileSync(destination, path.join(nativeIconDir, 'atlas.png'));
  }
  console.log(`prepared ${destination}`);
}

Promise.all([prepare('dark'), prepare('light')]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
