// Hand Pose Painting with ml5.js – pinch spawns colored dot bursts with palette

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

// backend
ml5.setBackend("webgl");

function preload() {
  // Use UNFLIPPED coords; we handle mirroring in draw()
  handPose = ml5.handPose({ flipped: false });
}

function setup() {
  // Taller canvas to make room for the small video preview + palette
  createCanvas(640, 560);

  // Off-screen drawing buffer (logical space: 320x240 like the video)
  painting = createGraphics(320, 240);
  painting.clear();

  // Capture video
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide();

  frameRate(60);

  // Set up color buttons (positions, colors, labels)
  let labels = ["Red", "Green", "Yellow", "Blue"];
  let colors = [
    [228, 93, 51],   // red
    [140, 181, 55],  // green
    [245, 182, 64],  // yellow
    [71, 165, 231]   // blue
  ];

  let startX = 140;
  let spacing = 120;
  let y = 505;
  let outerR = 40;
  let innerR = 32;

  for (let i = 0; i < labels.length; i++) {
    buttons.push({
      x: startX + i * spacing,
      y: y,
      outerR: outerR,
      innerR: innerR,
      color: colors[i],
      label: labels[i]
    });
  }

  // Default drawing color = red
  currentColor = colors[0];
}

function mousePressed() {
  console.log(hands);
  handleColorClick(mouseX, mouseY);
}

function gotHands(results) {
  hands = results;
  detecting = false;
}

function draw() {
  // Plain background for the drawing area
  background(248, 243, 233); // beige

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
      // Midpoint between thumb and index
      let x = (index.x + thumb.x) * 0.5;
      let y = (index.y + thumb.y) * 0.5;

      // Distance between thumb & index
      let d = dist(index.x, index.y, thumb.x, thumb.y);
      debugX = x;
      debugY = y;
      debugD = d;

      if (d < pinchThreshold) {
        isPinching = true;

        // RANDOMIZED TIMING: only sometimes spawn a burst per frame
        let spawnChance = 0.15; // 0–1, higher = more frequent
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

  // --- UPDATE & DRAW DOTS (with fade in/out and persistent traces) ---
  updateAndDrawDots();

  // --- MIRRORED PAINTING OVERLAY (top of drawing space) ---
  push();
  translate(width, 0);
  scale(-1, 1);
  image(painting, 0, 0, 640, 480); // scale 320x240 buffer to canvas
  pop();

  // -----------------------------------------------------
  // SMALL MIRRORED VIDEO PREVIEW BELOW THE DRAWING CANVAS
  // -----------------------------------------------------
  let previewW = 130;
  let previewH = 100;
  let previewX = width - previewW - 20;
  let previewY = 490;

  push();
  translate(previewX + previewW, previewY);
  scale(-1, 1);                  // flip horizontally (selfie-style)
  image(video, 0, 0, previewW, previewH);
  pop();

  fill(50);
  textSize(14);
  textAlign(LEFT, TOP);
  text("Camera Preview", previewX, previewY + previewH + 8);

  // -----------------------------------------------------
  // COLOR PALETTE UI
  // -----------------------------------------------------
  drawColorPalette();
}

// -----------------------------------------------------
// COLOR PALETTE: draw title + buttons
// -----------------------------------------------------
function drawColorPalette() {
  // Title
  textAlign(CENTER, CENTER);
  fill(0);
  textSize(32);
  text("Change Color:", width / 2, 475);

  // Buttons
  for (let b of buttons) {
    // Outer white circle + soft shadow
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
    textSize(24);
    textAlign(CENTER, TOP);
    text(b.label, b.x, b.y + b.outerR + 10);

    // Optional selection ring
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

// -----------------------------------------------------
// HANDLE CLICK ON COLOR BUTTONS
// -----------------------------------------------------
function handleColorClick(mx, my) {
  for (let b of buttons) {
    let d = dist(mx, my, b.x, b.y);
    if (d < b.outerR) {
      currentColor = b.color; // New dots will use this color
      break;
    }
  }
}

// -----------------------------------------------------
// SPAWN A BURST OF DOTS NEAR A PINCH POSITION
// -----------------------------------------------------
function spawnBurst(x, y, d, minDist, pinchThreshold) {
  let numDots = int(random(6, 16)); // random number of dots in this burst

  for (let i = 0; i < numDots; i++) {
    let angle = random(TWO_PI);

    // Spread radius depends slightly on pinch distance
    let maxSpread = map(d, minDist, pinchThreshold, 8, 30, true);
    let spread = random(0, maxSpread);

    let cx = x + cos(angle) * spread;
    let cy = y + sin(angle) * spread;

    let r = random(4, 18);

    // 70% chance this dot is persistent
    let persistent = random(1) < 0.7;

    dots.push({
      x: cx,
      y: cy,
      r: r,
      alpha: 0,
      maxAlpha: random(140, 230),
      age: 0,
      life: persistent ? null : random(40, 80), // only used for non-persistent
      persistent: persistent,
      color: {            // store the color this dot was born with
        r: currentColor[0],
        g: currentColor[1],
        b: currentColor[2]
      }
    });
  }
}

// -----------------------------------------------------
// UPDATE & DRAW ALL DOTS WITH FADE IN / FADE OUT
// -----------------------------------------------------
function updateAndDrawDots() {
  painting.clear();

  for (let i = dots.length - 1; i >= 0; i--) {
    let dot = dots[i];

    dot.age++;

    if (dot.persistent) {
      // Persistent dots fade IN then stay
      if (dot.alpha < dot.maxAlpha) {
        dot.alpha = min(dot.maxAlpha, dot.alpha + 10);
      }
      // Never removed; they keep being drawn
    } else {
      // Non-persistent dots: fade in, hold, then fade out
      let life = dot.life;
      let fadeInFrames = life * 0.3;
      let fadeOutStart = life * 0.7;

      if (dot.age <= fadeInFrames) {
        // Fade in
        let t = dot.age / fadeInFrames;
        dot.alpha = lerp(0, dot.maxAlpha, t);
      } else if (dot.age > fadeOutStart) {
        // Fade out
        let t = (dot.age - fadeOutStart) / (life - fadeOutStart);
        dot.alpha = lerp(dot.maxAlpha, 0, t);
      } else {
        // Fully visible in the middle
        dot.alpha = dot.maxAlpha;
      }

      if (dot.age > life || dot.alpha <= 0) {
        dots.splice(i, 1);
        continue;
      }
    }

    // Draw to the off-screen buffer in the dot's own color
    painting.noStroke();
    painting.fill(dot.color.r, dot.color.g, dot.color.b, dot.alpha);
    painting.circle(dot.x, dot.y, dot.r);
  }
}
