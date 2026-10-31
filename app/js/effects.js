// Наградата при завършен урок: конфети и балони за 4 секунди.

const CONFETTI_COUNT = 140;
const BALLOON_COUNT = 6;
const DURATION_SECONDS = 4;
const FADE_SECONDS = 0.8;
const GRAVITY = 0.25;
const AIR_DRAG = 0.99;
const FULL_TURN = 6.28;
const BALLOON_SWAY_SPEED = 0.03;
const BALLOON_SWAY_WIDTH = 12;
const BALLOON_HEIGHT_RATIO = 1.05;
const BALLOON_WIDTH_RATIO = 0.85;
const STRING_COLOR = "rgba(0, 0, 0, 0.25)";
const SHINE_COLOR = "rgba(255, 255, 255, 0.35)";

function celebrate(color) {
  const canvas = createCanvas();
  const size = { width: window.innerWidth, height: window.innerHeight };
  const context = prepareContext(canvas, size);

  const colors = [color].concat(PALETTE);
  const confetti = createConfetti(size, colors);
  const balloons = createBalloons(size, color);
  const startTime = performance.now();

  function frame(now) {
    const seconds = (now - startTime) / 1000;
    context.clearRect(0, 0, size.width, size.height);
    context.globalAlpha = fadeAlpha(seconds);
    for (const piece of confetti) moveAndDrawConfetti(context, piece);
    for (const balloon of balloons) moveAndDrawBalloon(context, balloon);

    if (seconds < DURATION_SECONDS) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.appendChild(canvas);
  return canvas;
}

function prepareContext(canvas, size) {
  const pixelRatio = window.devicePixelRatio || 1; // за по-остра картина на големи екрани
  canvas.width = size.width * pixelRatio;
  canvas.height = size.height * pixelRatio;
  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  return context;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// последните секунди всичко избледнява
function fadeAlpha(seconds) {
  const fadeStart = DURATION_SECONDS - FADE_SECONDS;
  if (seconds <= fadeStart) return 1;
  return Math.max(0, 1 - (seconds - fadeStart) / FADE_SECONDS);
}

// конфети: малки правоъгълници, изстреляни нагоре, които падат
function createConfetti(size, colors) {
  const confetti = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    confetti.push(createConfettiPiece(size, colors));
  }
  return confetti;
}

function createConfettiPiece(size, colors) {
  return {
    x: size.width / 2 + (Math.random() - 0.5) * size.width * 0.3,
    y: size.height * 0.35,
    speedX: (Math.random() - 0.5) * 9,
    speedY: -Math.random() * 11 - 4,
    rotation: Math.random() * FULL_TURN,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    width: 6 + Math.random() * 6,
    height: 4 + Math.random() * 4,
    color: randomFrom(colors),
  };
}

function moveAndDrawConfetti(context, piece) {
  piece.speedY += GRAVITY;
  piece.speedX *= AIR_DRAG;
  piece.x += piece.speedX;
  piece.y += piece.speedY;
  piece.rotation += piece.rotationSpeed;
  drawConfetti(context, piece);
}

function drawConfetti(context, piece) {
  context.save();
  context.translate(piece.x, piece.y);
  context.rotate(piece.rotation);
  context.fillStyle = piece.color;
  context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
  context.restore();
}

// балони, които се вдигат отдолу
function createBalloons(size, lessonColor) {
  const balloons = [];
  for (let i = 0; i < BALLOON_COUNT; i++) {
    balloons.push(createBalloon(size, i, lessonColor));
  }
  return balloons;
}

function createBalloon(size, index, lessonColor) {
  return {
    x: size.width * (0.1 + (0.8 * index) / (BALLOON_COUNT - 1)) + (Math.random() - 0.5) * 40,
    y: size.height + 60 + Math.random() * 120,
    speedY: 1.6 + Math.random() * 1.2,
    sway: Math.random() * FULL_TURN, // люлеене настрани
    radius: 22 + Math.random() * 8,
    color: index === 0 ? lessonColor : PALETTE[(index * 3) % PALETTE.length],
  };
}

function moveAndDrawBalloon(context, balloon) {
  balloon.y -= balloon.speedY;
  balloon.sway += BALLOON_SWAY_SPEED;
  const x = balloon.x + Math.sin(balloon.sway) * BALLOON_SWAY_WIDTH;
  const knotY = balloon.y + balloon.radius * BALLOON_HEIGHT_RATIO; // мястото, където е вързан конецът

  drawBalloonString(context, x, knotY);
  drawBalloonBody(context, balloon, x);
  drawBalloonKnot(context, x, knotY);
  drawBalloonShine(context, balloon, x);
}

function drawBalloonString(context, x, knotY) {
  context.strokeStyle = STRING_COLOR;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, knotY);
  context.quadraticCurveTo(x + 6, knotY + 25, x, knotY + 50);
  context.stroke();
}

function drawBalloonBody(context, balloon, x) {
  context.fillStyle = balloon.color;
  context.beginPath();
  context.ellipse(x, balloon.y, balloon.radius * BALLOON_WIDTH_RATIO, balloon.radius * BALLOON_HEIGHT_RATIO, 0, 0, Math.PI * 2);
  context.fill();
}

// малък триъгълник, пълни се с цвета на балона
function drawBalloonKnot(context, x, knotY) {
  context.beginPath();
  context.moveTo(x - 4, knotY + 4);
  context.lineTo(x + 4, knotY + 4);
  context.lineTo(x, knotY - 2);
  context.fill();
}

function drawBalloonShine(context, balloon, x) {
  context.fillStyle = SHINE_COLOR;
  context.beginPath();
  context.ellipse(x - balloon.radius * 0.3, balloon.y - balloon.radius * 0.4, balloon.radius * 0.16, balloon.radius * 0.26, -0.5, 0, Math.PI * 2);
  context.fill();
}
