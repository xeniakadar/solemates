// ═══════════════════════════════════════════════════════════════════
//  WHAT I STAND ON — exhibition experience
//  Home → Instructions → Camera → Preview → Result → Wall / Dataset
// ═══════════════════════════════════════════════════════════════════

// ── SETTINGS: the things you will most likely want to change ───────

// Trained pix2pix model
const MODEL_PATH = "assets/shoes.pict";

// The blob the model was trained to replace. It is stretched over the whole
// square photo, so keep it a square PNG with the blob in its trained position.
const OVERLAY_PATH = "assets/overlay.png";

// 'environment' = back camera (iPad pointed at the table), 'user' = front camera.
// A laptop just uses whatever webcam it has.
const FACING_MODE = "environment";

// Flip the picture like a mirror. Only useful with the front camera.
const MIRROR = false;

// How far the dashed square sits in from the edge of the camera view (0 to 0.2).
// The photo is cropped to exactly this square.
const GUIDE_INSET = 0.06;

// false = show the result at the model's own 256 x 256.
// true  = scale it up to 512 x 512 with the colour dither from the class template.
const DITHER = false;

// Wall: how many posts to keep, and how often the wall checks for new ones.
const WALL_MAX = 60;
const WALL_REFRESH_MS = 3000;
const WALL_KEY = "what-i-stand-on-wall";

// ═══════════════════════════════════════════════════════════════════

const SIZE = 256; // the size the model works at

const $ = (id) => document.getElementById(id);
const screens = document.querySelectorAll("[data-screen]");

// One visitor's run through the experience.
// photo  = the plain square photo (never shown with the blob to the model twice)
// input  = photo + blob, exactly what is sent to the model
// output = data URL of the generated image
const session = { photo: null, input: null, output: null };

let pix2pix = null;
let modelReady = false;
let stream = null;
let wallTimer = null;
let datasetLoaded = false;

const overlay = new Image();
let overlayReady = false;

// ── Routing: each screen is a #hash, so the Back button works ──────

const NEEDS = {
  preview: () => session.input,
  result: () => session.output,
};

function currentRoute() {
  const name = location.hash.replace("#", "") || "home";
  const exists = document.querySelector(`[data-screen="${name}"]`);
  if (!exists) return "home";
  // e.g. reloading on the result screen with nothing generated → go home
  if (NEEDS[name] && !NEEDS[name]()) return "home";
  return name;
}

function go(name) {
  if (location.hash === "#" + name) render();
  else location.hash = name;
}

function render() {
  const name = currentRoute();
  screens.forEach((s) => (s.hidden = s.dataset.screen !== name));
  document.body.classList.toggle(
    "dark-page",
    document.querySelector(`[data-screen="${name}"]`).classList.contains("dark")
  );
  window.scrollTo(0, 0);

  if (name === "camera") startCamera();
  else stopCamera();

  if (name === "preview") showPreview();
  if (name === "dataset") loadDataset();

  clearInterval(wallTimer);
  if (name === "wall") {
    renderWall();
    wallTimer = setInterval(renderWall, WALL_REFRESH_MS);
  }
}

window.addEventListener("hashchange", render);

// ── Model + overlay ────────────────────────────────────────────────

function loadModel() {
  pix2pix = ml5.pix2pix(MODEL_PATH, () => {
    modelReady = true;
    updateGenerateButton();
  });
}

function loadOverlay() {
  overlay.onload = () => {
    overlayReady = true;
    placeGuides();
  };
  overlay.onerror = () =>
    console.warn("Could not load " + OVERLAY_PATH + ". Check the assets folder.");
  overlay.src = OVERLAY_PATH;
}

// Reads the blob's position out of overlay.png so the dashed oval on the
// camera screen always matches the real blob, even if you swap the file.
function overlayBounds() {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  ctx.drawImage(overlay, 0, 0, SIZE, SIZE);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (px[(y * SIZE + x) * 4 + 3] > 127) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / SIZE, y0: y0 / SIZE, x1: (x1 + 1) / SIZE, y1: (y1 + 1) / SIZE };
}

function placeGuides() {
  const inset = GUIDE_INSET * 100;
  const side = 100 - inset * 2;
  const sq = $("guideSquare");
  sq.setAttribute("x", inset);
  sq.setAttribute("y", inset);
  sq.setAttribute("width", side);
  sq.setAttribute("height", side);

  const b = overlayReady ? overlayBounds() : null;
  const blob = $("guideBlob");
  if (!b) {
    blob.style.display = "none";
    return;
  }
  blob.style.display = "";
  blob.setAttribute("cx", inset + ((b.x0 + b.x1) / 2) * side);
  blob.setAttribute("cy", inset + ((b.y0 + b.y1) / 2) * side);
  blob.setAttribute("rx", ((b.x1 - b.x0) / 2) * side);
  blob.setAttribute("ry", ((b.y1 - b.y0) / 2) * side);
}

// ── Camera ─────────────────────────────────────────────────────────

async function startCamera() {
  const video = $("video");
  const msg = $("cameraMsg");
  $("shutterBtn").disabled = true;
  video.classList.toggle("mirrored", MIRROR);
  if (stream) return;

  msg.textContent = "Starting the camera…";
  try {
    // Needs localhost or https to work.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: FACING_MODE }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
  } catch (err) {
    console.warn(err);
    msg.textContent =
      "The camera could not be opened. Allow camera access for this page, then go back and try again.";
    return;
  }
  // The visitor may have left this screen while the permission prompt was open.
  if (currentRoute() !== "camera") return stopCamera();

  video.srcObject = stream;
  video.onloadedmetadata = () => {
    video.play();
    msg.textContent = "";
    $("shutterBtn").disabled = false;
  };
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $("video").srcObject = null;
}

// Takes the photo: the part of the video inside the dashed square, at 256 x 256.
function takePhoto() {
  const video = $("video");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  // The viewfinder shows a centred square crop of the video…
  const view = Math.min(vw, vh);
  // …and the dashed square is inset inside that.
  const side = view * (1 - GUIDE_INSET * 2);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  const photo = document.createElement("canvas");
  photo.width = photo.height = SIZE;
  const ctx = photo.getContext("2d");
  if (MIRROR) {
    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, SIZE, SIZE);

  // Under the hood: stamp the blob on a copy. This copy is what the model gets.
  const input = document.createElement("canvas");
  input.width = input.height = SIZE;
  const ictx = input.getContext("2d");
  ictx.drawImage(photo, 0, 0);
  if (overlayReady) ictx.drawImage(overlay, 0, 0, SIZE, SIZE);

  session.photo = photo;
  session.input = input;
  session.output = null;
  go("preview");
}

// ── Preview + generate ─────────────────────────────────────────────

function updateGenerateButton() {
  const btn = $("generateBtn");
  btn.disabled = !modelReady;
  btn.textContent = modelReady ? "Generate" : "Loading model…";
}

function showPreview() {
  $("previewCanvas").getContext("2d").drawImage(session.input, 0, 0);
  $("previewButtons").hidden = false;
  $("generateMsg").hidden = true;
  updateGenerateButton();
}

function generate() {
  if (!modelReady || !session.input) return;
  const msg = $("generateMsg");
  $("previewButtons").hidden = true;
  msg.hidden = false;
  msg.textContent = "Choosing a shoe for this ground…";

  const fail = (err) => {
    console.error(err);
    msg.textContent = "Something went wrong. Please try again.";
    $("previewButtons").hidden = false;
  };

  // Give the browser a moment to show the loading message before the model
  // takes over (it can freeze the page for a few seconds while it works).
  setTimeout(() => {
    try {
      pix2pix.transfer(session.input, (err, result) => {
        if (err || !result || !result.src) return fail(err || "No result");
        finishOutput(result.src);
      });
    } catch (err) {
      fail(err);
    }
  }, 60);
}

// Turns the model's result into the image we show, save and post.
function finishOutput(src) {
  const img = new Image();
  img.onload = () => {
    const out = DITHER ? 512 : SIZE;
    const c = document.createElement("canvas");
    c.width = c.height = out;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, out, out);
    if (DITHER) ditherFloydSteinbergColor(ctx, out, out);

    session.output = c.toDataURL("image/png");
    $("resultPhoto").getContext("2d").drawImage(session.photo, 0, 0);
    $("resultOutput").src = session.output;
    $("postBtn").disabled = false;
    $("postBtn").textContent = "Post to the wall";
    go("result");
  };
  img.src = src;
}

// ── Result actions ─────────────────────────────────────────────────

function saveResult() {
  if (!session.output) return;
  const a = document.createElement("a");
  a.href = session.output;
  a.download = "what-i-stand-on.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function discardResult() {
  session.photo = session.input = session.output = null;
  go("home");
}

function postResult() {
  if (!session.output) return;
  // Stored as a small JPEG so many posts fit.
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const img = $("resultOutput");
  c.getContext("2d").drawImage(img, 0, 0, SIZE, SIZE);

  const posts = readWall();
  posts.unshift({ id: Date.now(), img: c.toDataURL("image/jpeg", 0.85) });
  if (!writeWall(posts.slice(0, WALL_MAX))) {
    $("postBtn").textContent = "Could not post";
    return;
  }
  session.photo = session.input = session.output = null;
  go("wall");
}

// ── Wall ───────────────────────────────────────────────────────────
// Posts are kept in this browser's storage, so the wall shows what was made
// on THIS device. A wall shared between devices needs a backend (see notes).

function readWall() {
  try {
    return JSON.parse(localStorage.getItem(WALL_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function writeWall(posts) {
  try {
    localStorage.setItem(WALL_KEY, JSON.stringify(posts));
    return true;
  } catch (err) {
    console.warn("Could not save the wall", err);
    return false;
  }
}

let wallSignature = null;

function renderWall() {
  const posts = readWall(); // newest first
  const signature = posts.map((p) => p.id).join(",");
  if (signature === wallSignature) return;
  wallSignature = signature;

  const grid = $("wallGrid");
  grid.innerHTML = "";
  posts.forEach((p) => {
    const img = document.createElement("img");
    img.src = p.img;
    img.alt = "A shoe generated for a visitor's photo of the ground";
    grid.appendChild(img);
  });
  $("wallEmpty").hidden = posts.length > 0;
  $("clearWallBtn").hidden = posts.length === 0;
}

// Two taps to clear, so it can't happen by accident.
let clearArmed = null;
function clearWall() {
  const btn = $("clearWallBtn");
  if (!clearArmed) {
    btn.textContent = "Tap again to clear";
    clearArmed = setTimeout(() => {
      clearArmed = null;
      btn.textContent = "Clear wall";
    }, 3000);
    return;
  }
  clearTimeout(clearArmed);
  clearArmed = null;
  btn.textContent = "Clear wall";
  writeWall([]);
  renderWall();
}

// ── Dataset ────────────────────────────────────────────────────────

const pretty = (s) => s.replace(/_/g, " ");

async function loadDataset() {
  if (datasetLoaded) return;
  const list = $("datasetList");
  try {
    const pairs = await (await fetch("assets/dataset/manifest.json")).json();
    const byShoe = {};
    pairs.forEach((p) => (byShoe[p.shoe] = byShoe[p.shoe] || []).push(p));

    Object.keys(byShoe).forEach((shoe) => {
      const group = document.createElement("section");
      group.className = "shoe-group";
      const h = document.createElement("h3");
      h.textContent = pretty(shoe);
      const row = document.createElement("div");
      row.className = "pairs";
      byShoe[shoe].forEach((p) => {
        const pair = document.createElement("div");
        pair.className = "pair-small";
        [["a", "with the shoe covered"], ["b", "on the ground"]].forEach(([side, what]) => {
          const img = document.createElement("img");
          img.src = p[side];
          img.loading = "lazy";
          img.alt = `${pretty(shoe)} ${what}`;
          pair.appendChild(img);
        });
        row.appendChild(pair);
      });
      group.append(h, row);
      list.appendChild(group);
    });
    datasetLoaded = true;
  } catch (err) {
    console.warn(err);
    list.textContent = "The dataset samples could not be loaded.";
  }
}

// ── Floyd-Steinberg colour dither (from the class template) ────────
// Only used when DITHER is true.
function ditherFloydSteinbergColor(ctx, w, h) {
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const ch = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  for (let i = 0; i < w * h; i++) {
    for (let k = 0; k < 3; k++) ch[k][i] = px[i * 4 + k];
  }
  const step = 255 / 3; // 4 levels per channel
  const clamp = (v) => Math.min(255, Math.max(0, v));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let k = 0; k < 3; k++) {
        const c = ch[k];
        const old = c[i];
        const next = Math.round(Math.round(old / step) * step);
        const e = old - next;
        c[i] = next;
        if (x + 1 < w) c[i + 1] = clamp(c[i + 1] + (e * 7) / 16);
        if (y + 1 < h) {
          if (x > 0) c[i + w - 1] = clamp(c[i + w - 1] + (e * 3) / 16);
          c[i + w] = clamp(c[i + w] + (e * 5) / 16);
          if (x + 1 < w) c[i + w + 1] = clamp(c[i + w + 1] + (e * 1) / 16);
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    for (let k = 0; k < 3; k++) px[i * 4 + k] = ch[k][i];
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

// ── Start ──────────────────────────────────────────────────────────

$("shutterBtn").addEventListener("click", takePhoto);
$("generateBtn").addEventListener("click", generate);
$("postBtn").addEventListener("click", postResult);
$("saveBtn").addEventListener("click", saveResult);
$("discardBtn").addEventListener("click", discardResult);
$("clearWallBtn").addEventListener("click", clearWall);

placeGuides();
loadOverlay();
loadModel();
render();
