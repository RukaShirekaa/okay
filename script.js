/**
 * ============================================================================
 * GAME ARCADE 2D: AWAS BATU (PENGHINDAR METEOR)
 * Menerapkan Materi Inti Grafika Komputer Jalur 2D:
 * 1. ImageData Pixel Manipulation (Latar bintang per piksel & efek hit)
 * 2. Algoritma Garis Bresenham buatan sendiri (tanpa ctx.lineTo)
 * 3. Midpoint Circle, Scanline Polygon Fill & Flood Fill
 * 4. Matriks Transformasi Homogen 3x3 (Translasi, Rotasi, Skala)
 * 5. Cohen-Sutherland Line Clipping pada Jendela Layar Permainan
 * ============================================================================
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Buffer ImageData untuk manipulasi piksel langsung (Pertemuan 1)
const imgData = ctx.createImageData(WIDTH, HEIGHT);
const pixelBuffer = imgData.data;

// Jendela Clipping Layar Permainan (Margin luar menunjukkan area di luar clipping)
const VIEWPORT = {
  xmin: 45,
  ymin: 45,
  xmax: WIDTH - 45,
  ymax: HEIGHT - 45
};

// Gambar meteor kustom (null = pakai poligon Scanline Fill bawaan)
let customMeteorImg = null;

const meteorInput = document.getElementById('meteorImageInput');
if (meteorInput) {
  meteorInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        customMeteorImg = img;
        gameState.meteorCustomNotice = 80;
        gameState.meteorResetNotice = 0;
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// 1. UTILITAS PIKSEL DASAR (ImageData) - PERTEMUAN 1
// ============================================================================
function setPixel(x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = (y * WIDTH + x) * 4;
  pixelBuffer[idx] = r;
  pixelBuffer[idx + 1] = g;
  pixelBuffer[idx + 2] = b;
  pixelBuffer[idx + 3] = a;
}

function getPixel(x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return [0, 0, 0, 0];
  const idx = (y * WIDTH + x) * 4;
  return [
    pixelBuffer[idx],
    pixelBuffer[idx + 1],
    pixelBuffer[idx + 2],
    pixelBuffer[idx + 3]
  ];
}

// Bintang latar belakang untuk efek paralaks per piksel
const bgStars = Array.from({ length: 140 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  speed: 2.2 + Math.random() * 2.2,
  brightness: 250 + Math.floor(Math.random() * 135)
}));

function renderSpaceBackground(hitFlashTimer, frameTick) {
  const flashR = hitFlashTimer > 0 ? Math.min(90, hitFlashTimer * 150) : 0;

  for (let y = 0; y < HEIGHT; y++) {
    const inArenaY = y >= VIEWPORT.ymin && y <= VIEWPORT.ymax;
    const grad = inArenaY ? Math.floor((y / HEIGHT) * 20) : 0;

    for (let x = 0; x < WIDTH; x++) {
      const inArena = inArenaY && x >= VIEWPORT.xmin && x <= VIEWPORT.xmax;
      const idx = (y * WIDTH + x) * 4;

      if (inArena) {
        pixelBuffer[idx]     = Math.min(255, 8 + flashR);
        pixelBuffer[idx + 1] = Math.min(255, 13 + grad);
        pixelBuffer[idx + 2] = Math.min(255, 28 + grad * 2);
        pixelBuffer[idx + 3] = 255;
      } else {
        pixelBuffer[idx]     = 4;
        pixelBuffer[idx + 1] = 6;
        pixelBuffer[idx + 2] = 12;
        pixelBuffer[idx + 3] = 255;
      }
    }
  }

  for (const s of bgStars) {
    s.y += s.speed;
    if (s.y > VIEWPORT.ymax) {
      s.y = VIEWPORT.ymin;
      s.x = VIEWPORT.xmin + Math.random() * (VIEWPORT.xmax - VIEWPORT.xmin);
    }
    if (s.x >= VIEWPORT.xmin && s.x <= VIEWPORT.xmax && s.y >= VIEWPORT.ymin && s.y <= VIEWPORT.ymax) {
      const twinkle = ((frameTick + Math.floor(s.x)) % 20 < 10) ? 0 : -35;
      const b = Math.max(50, Math.min(255, s.brightness + twinkle));
      setPixel(s.x, s.y, b, b, Math.min(255, b + 25));
      if (s.speed > 2.0) {
        setPixel(s.x, s.y - 1, b * 0.6, b * 0.6, b * 0.8);
      }
    }
  }
}

// ============================================================================
// 2. ALGORITMA MATRIKS HOMOGEN 3x3 - PERTEMUAN 4
// ============================================================================
const Mat3 = {
  identity() {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  },
  translation(tx, ty) {
    return [[1, 0, tx], [0, 1, ty], [0, 0, 1]];
  },
  scaling(sx, sy) {
    return [[sx, 0, 0], [0, sy, 0], [0, 0, 1]];
  },
  rotation(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  },
  multiply(A, B) {
    const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        out[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return out;
  },
  transformPoint(M, p) {
    return {
      x: M[0][0] * p.x + M[0][1] * p.y + M[0][2],
      y: M[1][0] * p.x + M[1][1] * p.y + M[1][2]
    };
  }
};

// ============================================================================
// 3. ALGORITMA COHEN-SUTHERLAND LINE CLIPPING - PERTEMUAN 5
// ============================================================================
const INSIDE = 0; // 0000
const LEFT   = 1; // 0001
const RIGHT  = 2; // 0010
const BOTTOM = 4; // 0100
const TOP    = 8; // 1000

function computeOutCode(x, y, rect) {
  let code = INSIDE;
  if (x < rect.xmin) code |= LEFT;
  else if (x > rect.xmax) code |= RIGHT;
  if (y < rect.ymin) code |= TOP;
  else if (y > rect.ymax) code |= BOTTOM;
  return code;
}

function cohenSutherlandClip(x0, y0, x1, y1, rect) {
  let outcode0 = computeOutCode(x0, y0, rect);
  let outcode1 = computeOutCode(x1, y1, rect);
  let accept = false;

  while (true) {
    if (!(outcode0 | outcode1)) {
      accept = true;
      break;
    } else if (outcode0 & outcode1) {
      break;
    } else {
      let x = 0, y = 0;
      const outcodeOut = outcode0 ? outcode0 : outcode1;

      if (outcodeOut & TOP) {
        x = x0 + (x1 - x0) * (rect.ymin - y0) / (y1 - y0);
        y = rect.ymin;
      } else if (outcodeOut & BOTTOM) {
        x = x0 + (x1 - x0) * (rect.ymax - y0) / (y1 - y0);
        y = rect.ymax;
      } else if (outcodeOut & RIGHT) {
        y = y0 + (y1 - y0) * (rect.xmax - x0) / (x1 - x0);
        x = rect.xmax;
      } else if (outcodeOut & LEFT) {
        y = y0 + (y1 - y0) * (rect.xmin - x0) / (x1 - x0);
        x = rect.xmin;
      }

      if (outcodeOut === outcode0) {
        x0 = x; y0 = y;
        outcode0 = computeOutCode(x0, y0, rect);
      } else {
        x1 = x; y1 = y;
        outcode1 = computeOutCode(x1, y1, rect);
      }
    }
  }
  return accept ? { x0, y0, x1, y1 } : null;
}

// ============================================================================
// 4. ALGORITMA GARIS BRESENHAM (TANPA ctx.lineTo) - PERTEMUAN 2
// ============================================================================
function drawLineBresenham(x0, y0, x1, y1, color, clipRect = null, thickness = 1) {
  if (clipRect) {
    const clipped = cohenSutherlandClip(x0, y0, x1, y1, clipRect);
    if (!clipped) return;
    x0 = clipped.x0; y0 = clipped.y0;
    x1 = clipped.x1; y1 = clipped.y1;
  }

  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const half = Math.floor(thickness / 2);

  while (true) {
    if (thickness <= 1) {
      setPixel(x0, y0, color[0], color[1], color[2]);
    } else {
      for (let ty = -half; ty <= half; ty++) {
        for (let tx = -half; tx <= half; tx++) {
          setPixel(x0 + tx, y0 + ty, color[0], color[1], color[2]);
        }
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

// ============================================================================
// 5. MIDPOINT CIRCLE, SCANLINE FILL & FLOOD FILL - PERTEMUAN 3
// ============================================================================
function drawMidpointCircle(xc, yc, r, color, clipRect = null, fill = false) {
  xc = Math.round(xc);
  yc = Math.round(yc);
  r = Math.round(r);
  if (r <= 0) return;

  const plotOctants = (cx, cy, x, y) => {
    if (fill) {
      drawLineBresenham(cx - x, cy + y, cx + x, cy + y, color, clipRect);
      drawLineBresenham(cx - x, cy - y, cx + x, cy - y, color, clipRect);
      drawLineBresenham(cx - y, cy + x, cx + y, cy + x, color, clipRect);
      drawLineBresenham(cx - y, cy - x, cx + y, cy - x, color, clipRect);
    } else {
      const pts = [
        [cx + x, cy + y], [cx - x, cy + y],
        [cx + x, cy - y], [cx - x, cy - y],
        [cx + y, cy + x], [cx - y, cy + x],
        [cx + y, cy - x], [cx - y, cy - x]
      ];
      for (const [px, py] of pts) {
        if (!clipRect || (px >= clipRect.xmin && px <= clipRect.xmax && py >= clipRect.ymin && py <= clipRect.ymax)) {
          setPixel(px, py, color[0], color[1], color[2]);
        }
      }
    }
  };

  let x = 0;
  let y = r;
  let d = 1 - r;
  plotOctants(xc, yc, x, y);

  while (x < y) {
    x++;
    if (d < 0) {
      d += 2 * x + 1;
    } else {
      y--;
      d += 2 * (x - y) + 1;
    }
    plotOctants(xc, yc, x, y);
  }
}

function scanlineFillPolygon(vertices, fillColor, borderColor, clipRect) {
  if (vertices.length < 3) return;

  let minY = Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  minY = Math.max(Math.floor(minY), clipRect.ymin);
  maxY = Math.min(Math.ceil(maxY), clipRect.ymax);

  for (let y = minY; y <= maxY; y++) {
    const nodes = [];
    let j = vertices.length - 1;
    for (let i = 0; i < vertices.length; i++) {
      const vi = vertices[i];
      const vj = vertices[j];
      if ((vi.y < y && vj.y >= y) || (vj.y < y && vi.y >= y)) {
        nodes.push(vi.x + (y - vi.y) / (vj.y - vi.y) * (vj.x - vi.x));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);

    for (let i = 0; i < nodes.length; i += 2) {
      if (i + 1 >= nodes.length) break;
      const startX = Math.max(Math.round(nodes[i]), clipRect.xmin);
      const endX = Math.min(Math.round(nodes[i + 1]), clipRect.xmax);
      for (let x = startX; x <= endX; x++) {
        setPixel(x, y, fillColor[0], fillColor[1], fillColor[2]);
      }
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    drawLineBresenham(p1.x, p1.y, p2.x, p2.y, borderColor, clipRect, 2);
  }
}

function floodFill(startX, startY, fillColor, clipRect) {
  startX = Math.round(startX);
  startY = Math.round(startY);
  if (startX < clipRect.xmin || startX > clipRect.xmax || startY < clipRect.ymin || startY > clipRect.ymax) return;

  const target = getPixel(startX, startY);
  if (target[0] === fillColor[0] && target[1] === fillColor[1] && target[2] === fillColor[2]) return;

  const stack = [[startX, startY]];
  const visited = new Set();

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = (y << 12) | x;
    if (visited.has(key)) continue;
    if (x < clipRect.xmin || x > clipRect.xmax || y < clipRect.ymin || y > clipRect.ymax) continue;

    const curr = getPixel(x, y);
    if (curr[0] === target[0] && curr[1] === target[1] && curr[2] === target[2]) {
      visited.add(key);
      setPixel(x, y, fillColor[0], fillColor[1], fillColor[2]);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
}

// ============================================================================
// 6. LOGIKA ENTITAS GAME (PESAWAT, METEOR, PARTIKEL)
// ============================================================================
let gameState = {
  score: 0,
  wave: 1,
  hp: 100,
  gameOver: false,
  frameTick: 0,
  hitFlash: 0,
  shieldPulse: 0,
  meteorResetNotice: 0,
  meteorCustomNotice: 0
};

const player = {
  x: WIDTH / 2,
  y: HEIGHT - 115,
  speed: 5.2,
  tilt: 0,
  radius: 22,
  localVertices: [
    { x: 0, y: -26 },
    { x: 22, y: 18 },
    { x: 8, y: 12 },
    { x: 0, y: 20 },
    { x: -8, y: 12 },
    { x: -22, y: 18 }
  ]
};

let meteors = [];
let particles = [];
const keys = {};

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Space' && !gameState.gameOver && gameState.shieldPulse <= 0) {
    gameState.shieldPulse = 35;
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function createMeteor() {
  const radius = 20 + Math.random() * 26;
  const sides = 7 + Math.floor(Math.random() * 4);
  const localVertices = [];

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const jitter = 0.72 + Math.random() * 0.35;
    localVertices.push({
      x: Math.cos(angle) * radius * jitter,
      y: Math.sin(angle) * radius * jitter
    });
  }

  const isMagma = Math.random() < 0.3;
  return {
    x: VIEWPORT.xmin + radius + Math.random() * (VIEWPORT.xmax - VIEWPORT.xmin - radius * 2),
    y: VIEWPORT.ymin - radius - 10,
    vx: (Math.random() - 0.5) * (1.2 + gameState.wave * 0.25),
    vy: 2.2 + Math.random() * (2.0 + gameState.wave * 0.45),
    angle: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.08,
    radius,
    localVertices,
    fillColor: isMagma ? [153, 27, 27] : [75, 85, 99],
    borderColor: isMagma ? [251, 146, 60] : [156, 163, 175],
    craterOffset: { x: radius * 0.25, y: -radius * 0.2 }
  };
}

function spawnExplosion(x, y, color) {
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 20 + Math.floor(Math.random() * 15),
      color
    });
  }
}

let isTouchControlling = false;
let lastTouchCanvasX = null;

function resetGame() {
  gameState = {
    score: 0,
    wave: 1,
    hp: 100,
    gameOver: false,
    frameTick: 0,
    hitFlash: 0,
    shieldPulse: 0
  };
  player.x = WIDTH / 2;
  player.y = HEIGHT - 115;
  player.tilt = 0;
  isTouchControlling = false;
  lastTouchCanvasX = null;
  meteors = [];
  particles = [];
  for (let i = 0; i < 5; i++) {
    const m = createMeteor();
    m.y = VIEWPORT.ymin - 30 - i * 95;
    meteors.push(m);
  }
  updateHUD();
}

document.getElementById('btnRestart').addEventListener('click', resetGame);

function resetMeteors() {
  customMeteorImg = null;
  const input = document.getElementById('meteorImageInput');
  if (input) input.value = '';

  // Bersihkan meteor lama dengan efek ledakan partikel
  for (const m of meteors) {
    spawnExplosion(m.x, m.y, [251, 146, 60]);
  }

  // Spawn ulang 5 meteor awal dari atas arena
  meteors = [];
  for (let i = 0; i < 5; i++) {
    const m = createMeteor();
    m.y = VIEWPORT.ymin - 30 - i * 95;
    meteors.push(m);
  }

  // Tampilkan notifikasi visual di layar permainan
  gameState.meteorResetNotice = 80;
  gameState.meteorCustomNotice = 0;

  // Efek visual pada tombol
  const btn = document.getElementById('btnResetMeteorImg');
  if (btn) {
    btn.classList.add('btn-success-glow');
    btn.textContent = '✨ Berhasil Direset!';
    setTimeout(() => {
      btn.classList.remove('btn-success-glow');
      btn.textContent = 'Reset Meteor Bro';
    }, 1200);
  }
}

const btnResetMeteor = document.getElementById('btnResetMeteorImg');
if (btnResetMeteor) {
  btnResetMeteor.addEventListener('click', resetMeteors);
}

function updateHUD() {
  document.getElementById('uiScore').textContent = `SKOR: ${Math.floor(gameState.score)}`;
  document.getElementById('uiLevel').textContent = `WAVE: ${gameState.wave}`;
  document.getElementById('uiHp').textContent = `PERISAI: ${Math.max(0, gameState.hp)}%`;
}

// ============================================================================
// 7. LOOP UPDATE & RENDER UTAMA
// ============================================================================
function update() {
  if (gameState.gameOver) return;

  gameState.frameTick++;
  gameState.score += 0.15;
  gameState.wave = 1 + Math.floor(gameState.score / 150);

  if (gameState.hitFlash > 0) gameState.hitFlash--;
  if (gameState.shieldPulse > 0) gameState.shieldPulse--;

  if (isTouchControlling) {
    // Saat sedang dikendalikan sentuhan jari, kemiringan roket perlahan stabil
    player.tilt *= 0.85;
  } else {
    // Kontrol Keyboard (PC/Laptop)
    let moveX = 0, moveY = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) moveX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) moveX += 1;
    if (keys['ArrowUp'] || keys['KeyW']) moveY -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) moveY += 1;

    player.x += moveX * player.speed;
    player.y += moveY * player.speed;
    player.tilt = moveX * 0.25;

    player.x = Math.max(VIEWPORT.xmin + 26, Math.min(VIEWPORT.xmax - 26, player.x));
    player.y = Math.max(VIEWPORT.ymin + 30, Math.min(VIEWPORT.ymax - 26, player.y));
  }

  const targetMeteors = 5 + gameState.wave * 2;
  if (meteors.length < targetMeteors && Math.random() < 0.08) {
    meteors.push(createMeteor());
  }

  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx;
    m.y += m.vy;
    m.angle += m.rotSpeed;

    if (m.x - m.radius < VIEWPORT.xmin || m.x + m.radius > VIEWPORT.xmax) {
      m.vx *= -1;
    }

    const dx = m.x - player.x;
    const dy = m.y - player.y;
    const dist = Math.hypot(dx, dy);
    const hitDist = m.radius * 0.82 + (gameState.shieldPulse > 0 ? 34 : player.radius * 0.8);

    if (dist < hitDist) {
      if (gameState.shieldPulse > 0) {
        gameState.score += 25;
        spawnExplosion(m.x, m.y, [56, 189, 248]);
        meteors.splice(i, 1);
        continue;
      } else {
        gameState.hp -= 25;
        gameState.hitFlash = 10;
        spawnExplosion(m.x, m.y, [248, 113, 113]);
        meteors.splice(i, 1);
        if (gameState.hp <= 0) {
          gameState.hp = 0;
          gameState.gameOver = true;
        }
        continue;
      }
    }

    if (m.y - m.radius > VIEWPORT.ymax + 20) {
      gameState.score += 5;
      meteors.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
    if (pt.life <= 0) particles.splice(i, 1);
  }

  updateHUD();
}

function render() {
  renderSpaceBackground(gameState.hitFlash, gameState.frameTick);

  // Render Meteor: jika belum ada gambar kustom, pakai Scanline Fill + Midpoint Circle
  for (const m of meteors) {
    const M = Mat3.multiply(
      Mat3.translation(m.x, m.y),
      Mat3.rotation(m.angle)
    );

    if (!customMeteorImg) {
      const worldVerts = m.localVertices.map(v => Mat3.transformPoint(M, v));
      scanlineFillPolygon(worldVerts, m.fillColor, m.borderColor, VIEWPORT);

      const craterPt = Mat3.transformPoint(M, m.craterOffset);
      drawMidpointCircle(craterPt.x, craterPt.y, m.radius * 0.28, m.borderColor, VIEWPORT, false);
    }
  }

  // Render Pesawat Pemain via Matriks Homogen 3x3
  if (!gameState.gameOver) {
    const playerMat = Mat3.multiply(
      Mat3.translation(player.x, player.y),
      Mat3.rotation(player.tilt)
    );

    const shipVerts = player.localVertices.map(v => Mat3.transformPoint(playerMat, v));
    scanlineFillPolygon(shipVerts, [2, 132, 199], [186, 230, 253], VIEWPORT);

    const cockpitPt = Mat3.transformPoint(playerMat, { x: 0, y: -3 });
    drawMidpointCircle(cockpitPt.x, cockpitPt.y, 6, [250, 204, 21], VIEWPORT, false);
    floodFill(cockpitPt.x, cockpitPt.y, [234, 179, 8], VIEWPORT);

    const thrustScale = 2 + Math.sin(gameState.frameTick * 0.6) * 0.90;
    const flameMat = Mat3.multiply(
      playerMat,
      Mat3.multiply(Mat3.translation(0, 22), Mat3.scaling(1, thrustScale))
    );
    const flameVerts = [
      { x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 14 }
    ].map(v => Mat3.transformPoint(flameMat, v));
    scanlineFillPolygon(flameVerts, [249, 115, 22], [254, 240, 138], VIEWPORT);

    if (gameState.shieldPulse > 0) {
      const shieldRadius = 50 + Math.sin(gameState.shieldPulse * 0.3) * 6;
      drawMidpointCircle(player.x, player.y, shieldRadius, [56, 189, 248], VIEWPORT, false);
      drawMidpointCircle(player.x, player.y, shieldRadius - 3, [125, 211, 252], VIEWPORT, false);
    }
  }

  for (const pt of particles) {
    drawMidpointCircle(pt.x, pt.y, 2, pt.color, VIEWPORT, true);
  }

  const frameColor = gameState.hitFlash > 0 ? [239, 68, 68] : [56, 189, 248];
  drawLineBresenham(VIEWPORT.xmin, VIEWPORT.ymin, VIEWPORT.xmax, VIEWPORT.ymin, frameColor, null, 3);
  drawLineBresenham(VIEWPORT.xmax, VIEWPORT.ymin, VIEWPORT.xmax, VIEWPORT.ymax, frameColor, null, 3);
  drawLineBresenham(VIEWPORT.xmax, VIEWPORT.ymax, VIEWPORT.xmin, VIEWPORT.ymax, frameColor, null, 3);
  drawLineBresenham(VIEWPORT.xmin, VIEWPORT.ymax, VIEWPORT.xmin, VIEWPORT.ymin, frameColor, null, 3);

  ctx.putImageData(imgData, 0, 0);

  // Jika gambar meteor kustom dipilih, gambar di atas buffer ImageData dengan clipping VIEWPORT
  if (customMeteorImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEWPORT.xmin, VIEWPORT.ymin, VIEWPORT.xmax - VIEWPORT.xmin, VIEWPORT.ymax - VIEWPORT.ymin);
    ctx.clip();

    for (const m of meteors) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      const size = m.radius * 2.1;
      ctx.drawImage(customMeteorImg, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.fillStyle = "#ff54ac";
  ctx.font = "bold 10px Segoe UI";
  ctx.textAlign = "left";
  ctx.fillText("JENDELA CLIPPING COHEN-SUTHERLAND [45, 45 - 855, 555]", VIEWPORT.xmin, VIEWPORT.ymin - 12);

  if (gameState.meteorResetNotice > 0) {
    gameState.meteorResetNotice--;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 18px Segoe UI";
    ctx.fillText("✨ METEOR BERHASIL DIRESET KE DEFAULT ✨", WIDTH / 2, VIEWPORT.ymin + 38);
    ctx.restore();
  } else if (gameState.meteorCustomNotice > 0) {
    gameState.meteorCustomNotice--;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 18px Segoe UI";
    ctx.fillText("🖼️ GAMBAR METEOR KUSTOM AKTIF!", WIDTH / 2, VIEWPORT.ymin + 38);
    ctx.restore();
  }

  if (gameState.gameOver) {
    ctx.fillStyle = "rgba(9, 13, 22, 0.82)";
    ctx.fillRect(VIEWPORT.xmin, VIEWPORT.ymin, VIEWPORT.xmax - VIEWPORT.xmin, VIEWPORT.ymax - VIEWPORT.ymin);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff2b95";
    ctx.font = "bold 45px Segoe UI";
    ctx.fillText("YAHAHA - KALAH LU", WIDTH / 2, HEIGHT / 2 - 25);

    ctx.fillStyle = "#facc15";
    ctx.font = "bold 20px Segoe UI";
    ctx.fillText(`Skor Lu: ${Math.floor(gameState.score)} (Wave ${gameState.wave})`, WIDTH / 2, HEIGHT / 2 + 15);

    ctx.fillStyle = "#ff2b95";
    ctx.font = "14px Segoe UI";
    ctx.fillText("Klik tombol 'Main Lagi Bro' di kanan bawah untuk bermain lagi", WIDTH / 2, HEIGHT / 2 + 50);
  }
}

// ============================================================================
// 8. KONTROL TOUCH LANGSUNG (HP / SMARTPHONE) - ROKET MENGIKUTI JARI
// ============================================================================
let lastTapTime = 0;

function moveRocketToFinger(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;

  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;

  // Efek kemiringan (tilt) dinamis mengikuti gerakan geser jari
  if (lastTouchCanvasX !== null) {
    const deltaX = canvasX - lastTouchCanvasX;
    player.tilt = Math.max(-0.45, Math.min(0.45, deltaX * 0.08));
  }
  lastTouchCanvasX = canvasX;

  // Roket langsung digeser mengikuti posisi jari (diberi offset -25px agar tidak tertutup jempol)
  player.x = Math.max(VIEWPORT.xmin + 26, Math.min(VIEWPORT.xmax - 26, canvasX));
  player.y = Math.max(VIEWPORT.ymin + 30, Math.min(VIEWPORT.ymax - 26, canvasY - 25));
}

function handlePointerStart(clientX, clientY) {
  if (gameState.gameOver) {
    resetGame();
    return;
  }

  // Ketukan ganda (double-tap) untuk mengaktifkan Boost Perisai
  const now = Date.now();
  if (now - lastTapTime < 320) {
    if (gameState.shieldPulse <= 0) {
      gameState.shieldPulse = 35;
    }
  }
  lastTapTime = now;

  isTouchControlling = true;
  lastTouchCanvasX = null;
  moveRocketToFinger(clientX, clientY);
}

function handlePointerMove(clientX, clientY) {
  if (!isTouchControlling || gameState.gameOver) return;
  moveRocketToFinger(clientX, clientY);
}

function handlePointerEnd() {
  if (isTouchControlling) {
    isTouchControlling = false;
    lastTouchCanvasX = null;
    player.tilt = 0;
  }
}

// 1. Pointer Events (Standar Modern W3C: Menangani layar sentuh, mouse, dan stylus secara seragam)
canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
  handlePointerStart(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
  handlePointerMove(e.clientX, e.clientY);
});

const onPointerUp = (e) => {
  try {
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  } catch (err) {}
  handlePointerEnd();
};

canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

// 2. Touch Events (Dukungan penuh untuk seluruh browser HP: iOS Safari, Chrome Android, dll.)
canvas.addEventListener('touchstart', (e) => {
  if (gameState.gameOver) {
    e.preventDefault();
    resetGame();
    return;
  }

  // Sentuhan 2 jari otomatis mengaktifkan Boost Perisai
  if (e.touches.length >= 2) {
    e.preventDefault();
    if (gameState.shieldPulse <= 0) {
      gameState.shieldPulse = 35;
    }
    return;
  }

  // Double tap
  const now = Date.now();
  if (now - lastTapTime < 320) {
    if (gameState.shieldPulse <= 0) {
      gameState.shieldPulse = 35;
    }
  }
  lastTapTime = now;

  if (e.touches.length > 0) {
    e.preventDefault();
    isTouchControlling = true;
    lastTouchCanvasX = null;
    moveRocketToFinger(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (!isTouchControlling || gameState.gameOver) return;
  if (e.touches.length > 0) {
    e.preventDefault();
    moveRocketToFinger(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

window.addEventListener('touchend', handlePointerEnd);
window.addEventListener('touchcancel', handlePointerEnd);

// Klik pada canvas untuk mulai ulang saat Game Over
canvas.addEventListener('click', () => {
  if (gameState.gameOver) {
    resetGame();
  }
});

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

resetGame();
requestAnimationFrame(gameLoop);