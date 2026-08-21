'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7e57c2', // J - purple
  '#ffb74d', // L - orange
  '#b0bec5', // NUT - gris metálico
];

const NUT = 8;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca - hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, skin;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

// Dibuja un rectángulo redondeado; usa ctx.roundRect si el runtime lo soporta,
// si no cae a un path manual con arcTo (mismo resultado visual).
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  context.moveTo(x + rr, y);
  context.arcTo(x + w, y, x + w, y + h, rr);
  context.arcTo(x + w, y + h, x, y + h, rr);
  context.arcTo(x, y + h, x, y, rr);
  context.arcTo(x, y, x + w, y, rr);
  context.closePath();
}

// Agujero de la Tuerca como anillo circular simple: usado por retro/neon/pastel,
// que solo difieren en el color/grosor/glow del trazo (ver `ring` en cada skin).
function drawRingHole(context, cx, cy, size, ghost, ring) {
  const px = (cx + 0.5) * size;
  const py = (cy + 0.5) * size;
  const r = size * ring.radiusRatio;
  context.save();
  context.globalAlpha = ghost ? 0.2 : 1;
  if (!ghost) {
    context.fillStyle = cssVar('--board-bg'); // tapa el grid dentro del agujero
    context.beginPath();
    context.arc(px, py, r, 0, Math.PI * 2);
    context.fill();
  }
  if (ring.glow) {
    context.shadowColor = ring.glow;
    context.shadowBlur = ghost ? 4 : 10;
  }
  context.strokeStyle = ring.stroke;
  context.lineWidth = ring.lineWidth;
  context.beginPath();
  context.arc(px, py, r, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

// Cada skin define su paleta de colores y cómo dibuja un bloque / el agujero de la Tuerca.
const SKINS = {
  retro: {
    palette: COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = this.palette[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)'; // highlight superior
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.restore();
    },
    drawNutHole(context, cx, cy, size, ghost) {
      drawRingHole(context, cx, cy, size, ghost, {
        radiusRatio: 0.42, stroke: 'rgba(0,0,0,0.35)', lineWidth: 2,
      });
    },
  },
  neon: {
    palette: [
      null,
      '#00e5ff', '#ffea00', '#e040fb', '#00e676',
      '#ff1744', '#7c4dff', '#ff9100', '#cfd8dc',
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = this.palette[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = (alpha && alpha < 1) ? 4 : 9; // glow moderado: shadowBlur es costoso y se aplica a todo el tablero cada frame
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 1;
      context.strokeRect(x * size + 2.5, y * size + 2.5, size - 5, size - 5);
      context.restore();
    },
    drawNutHole(context, cx, cy, size, ghost) {
      drawRingHole(context, cx, cy, size, ghost, {
        radiusRatio: 0.42, stroke: 'rgba(255,255,255,0.8)', lineWidth: 2, glow: '#ffffff',
      });
    },
  },
  pastel: {
    palette: [
      null,
      '#a8dadc', '#fff3b0', '#d8bfd8', '#b5e8b5',
      '#f7b2ad', '#c3b1e1', '#ffd8a8', '#d6d6e0',
    ],
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = this.palette[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      roundRectPath(context, x * size + 2, y * size + 2, size - 4, size - 4, 6);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.35)'; // highlight suave
      roundRectPath(context, x * size + 2, y * size + 2, size - 4, (size - 4) * 0.4, 6);
      context.fill();
      context.restore();
    },
    drawNutHole(context, cx, cy, size, ghost) {
      drawRingHole(context, cx, cy, size, ghost, {
        radiusRatio: 0.4, stroke: 'rgba(120,110,140,0.4)', lineWidth: 3,
      });
    },
  },
  pixel: {
    palette: COLORS,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = this.palette[colorIndex];
      const bx = x * size + 1, by = y * size + 1, bw = size - 2, bh = size - 2;
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(bx, by, bw, bh);
      context.beginPath();
      context.rect(bx, by, bw, bh);
      context.clip();
      // rejilla de píxeles pequeños en tablero de ajedrez (dithering)
      const px = Math.max(2, Math.floor(size / 6));
      context.fillStyle = 'rgba(0,0,0,0.15)';
      for (let iy = 0; iy < bh; iy += px * 2)
        for (let ix = 0; ix < bw; ix += px * 2) {
          context.fillRect(bx + ix, by + iy, px, px);
          context.fillRect(bx + ix + px, by + iy + px, px, px);
        }
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(bx, by, bw, px);
      context.restore();
    },
    drawNutHole(context, cx, cy, size, ghost) {
      const bx = cx * size, by = cy * size;
      const r = size * 0.36;
      context.save();
      context.globalAlpha = ghost ? 0.2 : 1;
      if (!ghost) {
        context.fillStyle = cssVar('--board-bg');
        context.beginPath();
        context.arc(bx + size / 2, by + size / 2, r, 0, Math.PI * 2);
        context.fill();
      }
      // anillo pixelado: puntos cuadrados en vez de trazo continuo
      const px = Math.max(2, Math.floor(size / 6));
      context.fillStyle = 'rgba(0,0,0,0.5)';
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const dx = bx + size / 2 + Math.cos(angle) * r - px / 2;
        const dy = by + size / 2 + Math.sin(angle) * r - px / 2;
        context.fillRect(dx, dy, px, px);
      }
      context.restore();
    },
  },
};

function currentSkin() {
  return SKINS[skin] || SKINS.retro;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  currentSkin().drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawNutHole(context, cx, cy, size, ghost) {
  currentSkin().drawNutHole(context, cx, cy, size, ghost);
}

function isNutHole(r, c) {
  if (board[r][c]) return false;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== NUT) return false;
    }
  return true;
}

function drawGrid() {
  ctx.strokeStyle = cssVar('--grid-color');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      if (isNutHole(r, c)) drawNutHole(ctx, c, r, BLOCK, false);
    }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, true);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === NUT) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK, false);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === NUT) drawNutHole(nextCtx, offX + 1, offY + 1, NB, false);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver || paused) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const THEME_KEY = 'tetris-theme';

function applyTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  themeToggle.checked = isLight;
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) === 'light');
}

themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));

const SKIN_KEY = 'tetris-skin';
const SKIN_CLASSES = Object.keys(SKINS).map(name => `skin-${name}`);

function applySkin(name) {
  skin = SKINS[name] ? name : 'retro';
  document.body.classList.remove(...SKIN_CLASSES);
  document.body.classList.add(`skin-${skin}`);
  skinSelect.value = skin;
  try { localStorage.setItem(SKIN_KEY, skin); } catch { /* storage no disponible: la skin sigue aplicándose en memoria */ }
  // repinta ya con la nueva skin si el juego está en marcha (board/next existen)
  if (board) draw();
  if (next) drawNext();
}

function initSkin() {
  let saved = null;
  try { saved = localStorage.getItem(SKIN_KEY); } catch { /* storage no disponible: usa retro por defecto */ }
  applySkin(saved || 'retro');
}

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

initTheme();
initSkin();
init();
