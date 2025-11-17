// Hand Pose Painting with ml5.js – responsive, pinch spawns colored dot bursts

let video;
let handPose;
let hands = [];
let painting;
let detecting = false;

let isPinching = false;
let wasPinching = false;

// Array of "dot" particles
let dots = [];

// Color palette
let buttons = [];
let currentColor; // [r,g,b]

// UI buttons
let restartButton;
let saveButton;

// backend
ml5.setBackend("webgl");

function preload() {
  // Unflipped coords; we handle mirroring in draw()
  handPose = ml5.handPose({ flipped: false });
}

function setup() {
  // Full-window canvas
  createCanvas(windowWidth, windowHeight);

  // Logical drawing buffer & video (fixed resolution; we scale it)
  painting = createGraphics(320, 240);
  painting.clear();

  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  frameRate(60);

  // Color buttons (colors + labels; positions computed per frame)
  let labels = ["Red", "Green", "Yellow", "Blue"];
  let colors = [
    [228, 93, 51],   // red
    [140, 181, 55],  // green
    [245, 182, 64],  // yellow
    [71, 165, 231]   // blue
  ];

  for (let i = 0; i < labels.length; i++) {
    buttons.push({
      x: 0, y: 0,               // layout computed later
      outerR: 40,
      innerR: 32,
      color: colors[i],
      label: labels[i]
    });
  }

  currentColor = colors[0]; // default = red

  // Basic config for restart / save buttons (positions updated in layout)
  restartButton = { x: 0, y: 0, w: 110, h: 36, label: "Restart" };
  saveButton    = { x: 0, y: 0, w: 110, h: 36, label: "Save" };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  console.log(hands);
  handleColorClick(mouseX, mouseY);
  handleControlButtonsClick(mouseX, mouseY);
}

function gotHands(results) {
  hands = results;
  detecting = false;
}

function draw() {
  // Height reserved for UI (palette + preview) at bottom
  const uiBandHeight = 170;
  const drawH = height - uiBandHeight;

  // Beige background across whole canvas
  background(248, 243, 233);

  // --- HAND TRACKING ---
  if (!detecting && frameCount % 2 === 0) {
    detecting = true;
    handPose.detect(video, gotHands);
  }

  isPinching = false;

  let debugX, debugY, debugD;
  let pinchThreshold = 50;
  let minDist = 5;

  if (hands.length > 0) {
    let hand = hands[0];
    let thumb = hand.keypoints[4];
    let index = hand.keypoints[8];

    if (thumb && index) {
      let x = (index.x + thumb.x) * 0.5;
      let y = (index.y + thumb.y) * 0.5;

      let d = dist(index.x, index.y, thumb.x, thumb.y);
      debugX = x;
      debugY = y;
      debugD = d;

      if (d < pinchThreshold) {
        isPinching = true;

        // RANDOMIZED TIMING: only sometimes spawn a burst per frame
        let spawnChance = 0.15;
        if (random(1) < spawnChance) {
          spawnBurst(x, y, d, minDist, pinchThreshold);
        }
      }

      // --- DEBUG DOTS (mirrored to match what user sees) ---
      push();
      translate(width, 0);
      scale(-1, 1);

      noStroke();
      fill(20, 45, 81);
      circle(index.x, index.y, 8);

      fill(255, 0, 0);
      circle(thumb.x, thumb.y, 8);

      if (debugX !== undefined) {
        noFill();
        stroke(255, 0, 255);
        let swPreview = map(debugD, minDist, pinchThreshold, 20, 3, true);
        circle(debugX, debugY, swPreview * 1.5);
      }
      pop();
    }
  }

  wasPinching = isPinching;

  // --- UPDATE & DRAW DOTS ON OFFSCREEN BUFFER ---
  updateAndDrawDots();

  // --- MIRRORED PAINTING OVERLAY (fills drawing area) ---
  push();
  translate(width, 0);
  scale(-1, 1);
  image(painting, 0, 0, width, drawH);
  pop();

  // -----------------------------------------------------
  // SMALL MIRRORED VIDEO PREVIEW – sticky bottom-right
  // -----------------------------------------------------
  let margin = 20;
  let previewW = min(width * 0.22, 220);
  let previewH = previewW * (video.height / video.width);
  let previewX = width - previewW - margin;
  let previewY = height - previewH - margin - 40; // nudge up a bit for Save button

  push();
  translate(previewX + previewW, previewY);
  scale(-1, 1);
  image(video, 0, 0, previewW, previewH);
  pop();

  fill(50);
  textSize(14);
  textAlign(LEFT, TOP);
  text("Camera Preview", previewX, previewY - 18);

  // -----------------------------------------------------
  // COLOR PALETTE – sticky bottom-center
  // -----------------------------------------------------
  drawColorPalette(uiBandHeight);

  // -----------------------------------------------------
  // RESTART + SAVE BUTTONS – bottom-left & bottom-right
  // -----------------------------------------------------
  layoutControlButtons();
  drawControlButtons();
}

// -----------------------------------------------------
// LAYOUT BUTTONS + DRAW PALETTE
// -----------------------------------------------------
function drawColorPalette(uiBandHeight) {
  layoutButtons(); // recompute positions based on current width/height

  // Title above buttons
  textAlign(CENTER, CENTER);
  fill(0);
  textSize(32);
  const titleY = height - uiBandHeight + 28;
  text("Change Color:", width / 2, titleY);

  // Buttons
  for (let b of buttons) {
    // Outer white circle + shadow
    noStroke();
    fill(255);
    drawingContext.shadowBlur = 8;
    drawingContext.shadowColor = "rgba(0,0,0,0.25)";
    circle(b.x, b.y, b.outerR * 2);
    drawingContext.shadowBlur = 0;

    // Inner colored circle
    fill(b.color[0], b.color[1], b.color[2]);
    circle(b.x, b.y, b.innerR * 2);

    // Label
    fill(0);
    textSize(20);
    textAlign(CENTER, TOP);
    text(b.label, b.x, b.y + b.outerR + 8);

    // Selection ring
    if (
      currentColor[0] === b.color[0] &&
      currentColor[1] === b.color[1] &&
      currentColor[2] === b.color[2]
    ) {
      noFill();
      stroke(0);
      strokeWeight(2);
      circle(b.x, b.y, b.outerR * 2 + 6);
    }
  }
}

// Compute color-button positions responsively
function layoutButtons() {
  const paletteY = height - 80; // center of buttons row
  const baseOuterR = 40;
  const scaleFactor = constrain(width / 800, 0.7, 1.1);
  const outerR = baseOuterR * scaleFactor;
  const innerR = outerR * 0.8;

  const spacing = min(160 * scaleFactor, width / 5);
  const startX = width / 2 - (1.5 * spacing); // 4 buttons

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].x = startX + i * spacing;
    buttons[i].y = paletteY;
    buttons[i].outerR = outerR;
    buttons[i].innerR = innerR;
  }
}

// -----------------------------------------------------
// CONTROL BUTTONS (Restart / Save)
// -----------------------------------------------------
function layoutControlButtons() {
  const y = height - 50; // vertical position near bottom

  restartButton.x = 20;
  restartButton.y = y;

  saveButton.x = width - saveButton.w - 20;
  saveButton.y = y;
}

function drawControlButtons() {
  textAlign(CENTER, CENTER);
  textSize(16);

  // Restart
  drawPillButton(restartButton.x, restartButton.y, restartButton.w, restartButton.h, "Restart");

  // Save
  drawPillButton(saveButton.x, saveButton.y, saveButton.w, saveButton.h, "Save");
}

function drawPillButton(x, y, w, h, label) {
  const r = h / 2;
  noStroke();
  fill(255);
  drawingContext.shadowBlur = 6;
  drawingContext.shadowColor = "rgba(0,0,0,0.25)";
  rect(x, y, w, h, r);
  drawingContext.shadowBlur = 0;

  fill(40);
  text(label, x + w / 2, y + h / 2 + 1);
}

function handleControlButtonsClick(mx, my) {
  // Restart
  if (
    mx >= restartButton.x &&
    mx <= restartButton.x + restartButton.w &&
    my >= restartButton.y &&
    my <= restartButton.y + restartButton.h
  ) {
    // Clear all dots & canvas
    dots = [];
    painting.clear();
    return;
  }

  // Save (mock – just log for now)
  if (
    mx >= saveButton.x &&
    mx <= saveButton.x + saveButton.w &&
    my >= saveButton.y &&
    my <= saveButton.y + saveButton.h
  ) {
    console.log("Save button clicked (mock)");
  }
}

// -----------------------------------------------------
// HANDLE CLICK ON COLOR BUTTONS
// -----------------------------------------------------
function handleColorClick(mx, my) {
  layoutButtons(); // make sure positions match current layout
  for (let b of buttons) {
    let d = dist(mx, my, b.x, b.y);
    if (d < b.outerR) {
      currentColor = b.color;
      break;
    }
  }
}

// -----------------------------------------------------
// SPAWN A BURST OF DOTS NEAR A PINCH POSITION
// -----------------------------------------------------
function spawnBurst(x, y, d, minDist, pinchThreshold) {
  let numDots = int(random(6, 16));

  for (let i = 0; i < numDots; i++) {
    let angle = random(TWO_PI);
    let maxSpread = map(d, minDist, pinchThreshold, 8, 30, true);
    let spread = random(0, maxSpread);

    let cx = x + cos(angle) * spread;
    let cy = y + sin(angle) * spread;

    let r = random(4, 18);
    let persistent = random(1) < 0.7;

    dots.push({
      x: cx,
      y: cy,
      r: r,
      alpha: 0,
      maxAlpha: random(140, 230),
      age: 0,
      life: persistent ? null : random(40, 80),
      persistent: persistent,
      color: {
        r: currentColor[0],
        g: currentColor[1],
        b: currentColor[2]
      }
    });
  }
}

// -----------------------------------------------------
// UPDATE & DRAW ALL DOTS WITH FADE IN / FADE OUT
// NEW: newer dots are drawn on top of older ones
// -----------------------------------------------------
function updateAndDrawDots() {
  painting.clear();

  // First pass: update + keep survivors in order
  let newDots = [];
  for (let i = 0; i < dots.length; i++) {
    let dot = dots[i];
    dot.age++;

    if (dot.persistent) {
      if (dot.alpha < dot.maxAlpha) {
        dot.alpha = min(dot.maxAlpha, dot.alpha + 10);
      }
      // persistent never removed
      newDots.push(dot);
    } else {
      let life = dot.life;
      let fadeInFrames = life * 0.3;
      let fadeOutStart = life * 0.7;

      if (dot.age <= fadeInFrames) {
        let t = dot.age / fadeInFrames;
        dot.alpha = lerp(0, dot.maxAlpha, t);
      } else if (dot.age > fadeOutStart) {
        let t = (dot.age - fadeOutStart) / (life - fadeOutStart);
        dot.alpha = lerp(dot.maxAlpha, 0, t);
      } else {
        dot.alpha = dot.maxAlpha;
      }

      if (!(dot.age > life || dot.alpha <= 0)) {
        newDots.push(dot);
      }
    }
  }

  // Replace with survivors
  dots = newDots;

  // Second pass: draw in order so newer ones (later in array) end up on top
  for (let dot of dots) {
    painting.noStroke();
    painting.fill(dot.color.r, dot.color.g, dot.color.b, dot.alpha);
    painting.circle(dot.x, dot.y, dot.r);
  }
}
