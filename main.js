// ═══════════════════════════════════════════════════════════════════
//  STUDENT SETTINGS: the things you will most likely want to change
// ═══════════════════════════════════════════════════════════════════

// ► MODEL FILE: change this path to point to your own trained model
const MODEL_PATH = 'assets/model.pict';

// ► CAMERA: 'user' = front camera (selfie), 'environment' = back camera on phones
const FACING_MODE = 'user';

// ► MIRROR: true flips the video like a mirror (feels natural for selfies)
const MIRROR = true;

// ► OVERLAY (optional): set to true to lay a transparent PNG over the camera.
//   Put your image at assets/overlay.png (or change OVERLAY_PATH).
//   The overlay shows on the canvas AND is included in the image sent to the model.
//   It is stretched to fill the square canvas, so a square PNG works best.
const USE_OVERLAY = false;
const OVERLAY_PATH = 'assets/overlay.png';

// ═════════════════════════DON'T EDIT BELOW THIS LINE══════════════════════════════════════════

const SIZE = 256;            // size the model works at (don't change unless your model differs)
const OUTPUT_SIZE = 512;     // size of the dithered output image
const MAX_CANVAS = 512;      // biggest the video canvas will get (on desktop)
const MARGIN = 32;           // space left around the canvas on small screens

let displaySize = MAX_CANVAS; // current canvas size, set in getCanvasSize()
let inputCanvas, modelCanvas, output, statusMsg, pix2pix, clearBtn, transferBtn;
let video;
let overlayImg = null;

// Mobile friendly: canvas shrinks to fit narrow screens, never grows past MAX_CANVAS
function getCanvasSize() {
  return Math.floor(Math.min(MAX_CANVAS, windowWidth - MARGIN));
}

// Draws the current video frame onto a canvas/graphics as a centered square crop
// (so the picture isn't stretched), mirrored if MIRROR is true.
function drawVideoSquare(target, size) {
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  if (!vw || !vh) return; // camera not ready yet

  const s  = Math.min(vw, vh);
  const sx = (vw - s) / 2;
  const sy = (vh - s) / 2;

  target.push();
  if (MIRROR) {
    target.translate(size, 0);
    target.scale(-1, 1);
  }
  target.image(video, 0, 0, size, size, sx, sy, s, s);
  target.pop();

  // Overlay goes on top of the video and is NOT mirrored (so text/shapes read correctly).
  // This helper is used for both the on-screen canvas and the image sent to the model.
  if (USE_OVERLAY && overlayImg && overlayImg.width > 0) {
    target.image(overlayImg, 0, 0, size, size);
  }
}

//this code section allows the generated image to scale up from 256 x 256 to 512 x 512 using a dithering effect
// ── Floyd-Steinberg dither ───────────────────────────────────────────
function ditherFloydSteinbergColor(pg) {
  pg.loadPixels();
  const w = pg.width, h = pg.height;

  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    r[i] = pg.pixels[o];
    g[i] = pg.pixels[o + 1];
    b[i] = pg.pixels[o + 2];
  }

  const levels = 4;
  const step = 255 / (levels - 1);
  const clamp = v => Math.min(255, Math.max(0, v));
  const quantize = v => Math.round(Math.round(v / step) * step);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const oldR = r[idx], oldG = g[idx], oldB = b[idx];
      const newR = quantize(oldR), newG = quantize(oldG), newB = quantize(oldB);
      r[idx] = newR; g[idx] = newG; b[idx] = newB;
      const errR = oldR - newR, errG = oldG - newG, errB = oldB - newB;
      if (x + 1 < w) {
        r[idx+1] = clamp(r[idx+1] + errR*7/16);
        g[idx+1] = clamp(g[idx+1] + errG*7/16);
        b[idx+1] = clamp(b[idx+1] + errB*7/16);
      }
      if (y + 1 < h) {
        if (x - 1 >= 0) {
          r[idx+w-1] = clamp(r[idx+w-1] + errR*3/16);
          g[idx+w-1] = clamp(g[idx+w-1] + errG*3/16);
          b[idx+w-1] = clamp(b[idx+w-1] + errB*3/16);
        }
        r[idx+w] = clamp(r[idx+w] + errR*5/16);
        g[idx+w] = clamp(g[idx+w] + errG*5/16);
        b[idx+w] = clamp(b[idx+w] + errB*5/16);
        if (x + 1 < w) {
          r[idx+w+1] = clamp(r[idx+w+1] + errR*1/16);
          g[idx+w+1] = clamp(g[idx+w+1] + errG*1/16);
          b[idx+w+1] = clamp(b[idx+w+1] + errB*1/16);
        }
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    pg.pixels[o]   = r[i];
    pg.pixels[o+1] = g[i];
    pg.pixels[o+2] = b[i];
    pg.pixels[o+3] = 255;
  }
  pg.updatePixels();
}
// ── END Floyd-Steinberg dither ───────────────────────────────────────────


function setup() {
  pixelDensity(1);

  displaySize = getCanvasSize();
  inputCanvas = createCanvas(displaySize, displaySize);
  inputCanvas.class('border-box').parent('input');

  modelCanvas = createGraphics(SIZE, SIZE);
  modelCanvas.pixelDensity(1);

  background(0);

  output    = select('#output');
  statusMsg = select('#status');

  // Keep the output image inside the screen on phones
  output.elt.style.maxWidth = '100%';
  output.elt.style.height = 'auto';

  transferBtn = select('#transferBtn');
  clearBtn    = select('#clearBtn');
  clearBtn.mousePressed(clearOutput);

  // Start the camera. The browser will ask for permission.
  // (Needs localhost or https to work.)
  video = createCapture({ video: { facingMode: FACING_MODE }, audio: false });
  video.hide(); // hide the default <video> element; we draw it on the canvas instead

  // Load the optional overlay image. If the file is missing, the sketch still runs without it.
  if (USE_OVERLAY) {
    overlayImg = loadImage(
      OVERLAY_PATH,
      () => {},
      () => {
        console.warn('Could not load ' + OVERLAY_PATH + '. Check that the file exists in the assets folder.');
        overlayImg = null;
      }
    );
  }

  // p5 accessibility: describe the canvas for screen readers
  describe(
    'A live webcam view. Click the Transfer button to generate an AI-rendered image from the current camera frame.'
  );

  pix2pix = ml5.pix2pix(MODEL_PATH, modelLoaded);
}

function draw() {
  background(0);
  drawVideoSquare(window, displaySize);
}

// Keeps the canvas sized to the screen (e.g. when a phone rotates).
function windowResized() {
  const newSize = getCanvasSize();
  if (newSize === displaySize) return;
  displaySize = newSize;
  resizeCanvas(displaySize, displaySize);
}

function modelLoaded() {
  statusMsg.html('Model Loaded!');
  transferBtn.mousePressed(transfer);
}

// Clears the generated image (the live video keeps running)
function clearOutput() {
  statusMsg.html('');
  output.elt.src = '';
  output.elt.alt = 'The AI-generated image will appear here after clicking Transfer.';
}

function transfer() {
  statusMsg.html('Transferring...');
  output.elt.alt = 'Generating AI image from your camera frame, please wait.';

  // Grab the current video frame, cropped square and scaled to the model's 256 x 256
  modelCanvas.background(0);
  drawVideoSquare(modelCanvas, SIZE);

  pix2pix.transfer(modelCanvas.elt, function(err, result) {
    if (err) { console.log(err); return; }
    if (result && result.src) {
      statusMsg.html('generation done!');

      loadImage(result.src, p5img => {
        const tmp = createGraphics(OUTPUT_SIZE, OUTPUT_SIZE);
        tmp.pixelDensity(1);
        tmp.image(p5img, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        ditherFloydSteinbergColor(tmp);

        tmp.canvas.toBlob(blob => {
          output.elt.src = URL.createObjectURL(blob);
          output.elt.alt = 'AI-generated image produced from your camera frame. A color-dithered result.';
        });
      });
    }
  });
}