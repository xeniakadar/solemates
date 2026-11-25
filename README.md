# What I Stand On

The exhibition experience, built on the class pix2pix template (original template notes are below).

- `index.html` + `main.js` + `styles.css`: Home, Instructions, Camera, Preview, Result, Wall, Dataset. Each screen is a `#hash` in the one page.
- `about.html` + `about.css`: the about page the QR code points to.
- `assets/shoes.pict`: the trained model. `assets/overlay.png`: the blob stamped on every photo before it goes to the model.
- `assets/dataset/`: 26 sample pairs (two per shoe) for the dataset screen, listed in `manifest.json`.
- Settings (model path, camera, guide size, dither, wall size) are at the top of `main.js`.
- The wall is stored in the browser (`localStorage`), so it only shows posts made on the same device.

Run it with Live Server or `python3 -m http.server 8000`, as described below.

---

# Template video to image --  pix2pix (p5.js + ml5.js)

Point your webcam at something and a trained pix2pix model turns the current frame into an image. The output is then color-dithered.

## Folder structure

```
./assets/model.pict   your trained model
./styles.css
./index.html
./main.js             the sketch (all the code you will edit)
```

## Getting started

### 1. Add your model

Copy your trained `.pict` file into the `assets` folder. Easiest is to name it `model.pict`, replacing the existing one.

If you use a different filename, open `main.js` and change this line at the top:

```js
const MODEL_PATH = 'assets/model.pict';
```
## optional: add an overlay

The overlay image shows on the canvas AND is included in the image sent to the model.

Put your image at assets/overlay.png (make sure it's called overlay.png)

change this line in `main.js`:
```js
const USE_OVERLAY = true; //change from false to true
```


### 2. Run a local server

Browsers block model files when you open `index.html` by double-clicking it, so you need a local server. Use one of these from the project folder:

- **VS Code:** install the *Live Server* extension, right-click `index.html`, choose *Open with Live Server*.
- **Python:**
  ```
  python3 -m http.server 8000
  ```
  then go to `http://localhost:8000`.

The camera also needs `localhost` or `https` to work, so a local server is required here too.

### 3. Try it

1. Allow camera access when the browser asks.
2. Wait for the status text to say **Model Loaded!**
3. Point the camera at your subject. The canvas shows a live square crop of the video.
4. Click **Transfer** to generate an image from the current frame.
5. Click **Clear** to remove the generated image. The video keeps running.

## Things to customize

All of these are in the **STUDENT SETTINGS** block at the top of `main.js`:

| Setting | What it does |
| --- | --- |
| `MODEL_PATH` | Path to your `.pict` file |
| `FACING_MODE` | `'user'` for the front (selfie) camera, `'environment'` for the back camera on phones |
| `MIRROR` | `true` flips the video like a mirror, `false` shows it unflipped |

**Important:** your model only works well on inputs that look like its training data. A model trained on line drawings will give poor results on raw camera frames. Train on camera-style images, or add a step that turns the frame into something like your training data (for example, edge detection) before sending it to the model.

## Editing the page (`index.html`)

`index.html` is the structure and text of the page. You can add content around the sketch without touching `main.js`:

- **Add text:** put headings and paragraphs anywhere inside `<body>`:
  ```html
  <h1>My Project Title</h1>
  <p>A short description of what this does and how it was made.</p>
  ```
- **Add an image:** put the file in `assets/` and reference it:
  ```html
  <img src="assets/my-image.jpg" alt="Describe the image">
  ```
- **Add a link:** `<a href="https://example.com">link text</a>`
- **Change the page title** (browser tab): edit the `<title>` in the `<head>`.

Don't delete or rename the elements listed under "Required elements" below, or the sketch will stop working. Add new content *around* them.


## Required elements in `index.html`

The sketch looks for these IDs, so keep them in your HTML:

`#input` (video canvas container), `#output` (an `<img>`), `#status`, `#transferBtn`, `#clearBtn`

It also needs the p5.js and ml5.js scripts loaded before `main.js`.

## Editing the style (`styles.css`)

`styles.css` controls how the page looks. Each rule picks an element and sets its properties:


## Troubleshooting

- **Black canvas / no video:** check that you allowed camera access (look for a camera icon in the address bar) and that no other app is using the camera. Camera access only works on `localhost` or `https`.
- **Wrong camera on a phone:** change `FACING_MODE` to `'user'` or `'environment'`.
- **Stuck on "Transferring..." or nothing happens:** open the browser console (right-click, Inspect, Console) and look for errors.
- **Model won't load / 404 error:** check that `MODEL_PATH` matches the real filename and that you are using a local server, not opening the file directly.
- **Results look wrong:** check that your camera frames (lighting, framing, subject) are similar to your training data.