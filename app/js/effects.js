// Наградата при завършен урок: конфети и балони за 4 секунди.

function celebrate(color) {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.appendChild(canvas);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = window.devicePixelRatio || 1; // за по-остра картина на големи екрани
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // цветовете: цветът на урока + всички от палитрата
  const colors = [color].concat(PALETTE);
  function randomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // конфети: малки правоъгълници, изстреляни нагоре, които падат
  const pieces = [];
  for (let i = 0; i < 140; i++) {
    pieces.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 9,       // скорост наляво/надясно
      vy: -Math.random() * 11 - 4,         // скорост нагоре
      rot: Math.random() * 6.28,           // завъртане
      vr: (Math.random() - 0.5) * 0.3,     // скорост на въртене
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      c: randomColor(),
    });
  }

  // 6 балона, които се вдигат отдолу
  const balloons = [];
  for (let i = 0; i < 6; i++) {
    balloons.push({
      x: W * (0.1 + (0.8 * i) / 5) + (Math.random() - 0.5) * 40,
      y: H + 60 + Math.random() * 120,
      vy: 1.6 + Math.random() * 1.2,
      sway: Math.random() * 6.28,          // люлеене настрани
      r: 22 + Math.random() * 8,
      c: i === 0 ? color : PALETTE[(i * 3) % PALETTE.length],
    });
  }

  const start = performance.now();

  // всеки кадър: изчиства и рисува всичко на новите места
  function frame(now) {
    const seconds = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    // последните 0.8 секунди всичко избледнява
    ctx.globalAlpha = seconds > 3.2 ? Math.max(0, 1 - (seconds - 3.2) / 0.8) : 1;

    for (const p of pieces) {
      p.vy += 0.25; // гравитация
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    for (const b of balloons) {
      b.y -= b.vy;
      b.sway += 0.03;
      const bx = b.x + Math.sin(b.sway) * 12;
      const knot = b.y + b.r * 1.05; // мястото, където е вързан конецът

      // конецът
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, knot);
      ctx.quadraticCurveTo(bx + 6, knot + 25, bx, knot + 50);
      ctx.stroke();

      // тялото на балона
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.ellipse(bx, b.y, b.r * 0.85, b.r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // възелът (малък триъгълник)
      ctx.beginPath();
      ctx.moveTo(bx - 4, knot + 4);
      ctx.lineTo(bx + 4, knot + 4);
      ctx.lineTo(bx, knot - 2);
      ctx.fill();

      // светлият отблясък
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.beginPath();
      ctx.ellipse(bx - b.r * 0.3, b.y - b.r * 0.4, b.r * 0.16, b.r * 0.26, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (seconds < 4) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
