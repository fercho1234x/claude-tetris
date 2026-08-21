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
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
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
const startOverlay = document.getElementById('start-overlay');
const playBtn = document.getElementById('play-btn');
const startHighscores = document.getElementById('start-highscores');
const statComboEl = document.getElementById('stat-combo');
const statLinesEl = document.getElementById('stat-lines');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const highscoreForm = document.getElementById('highscore-form');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayHighscores = document.getElementById('overlay-highscores');

let board, current, next, score, lines, level, paused, gameOver, started, lastTime, dropAccum, dropInterval, animId, combo, comboMax;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
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
    combo++;
    if (combo > comboMax) comboMax = combo;
    updateHUD();
  } else {
    combo = 0;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
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
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
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
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  updateStats();
  showHighscoreEntry();
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
  combo = 0;
  comboMax = 0;
  paused = false;
  gameOver = false;
  started = true;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  highscoreForm.classList.add('hidden');
  overlayHighscores.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
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

restartBtn.addEventListener('click', () => {
  // Evita perder un record pendiente de guardar si se reinicia desde el formulario de nombre
  if (gameOver && !highscoreForm.classList.contains('hidden')) {
    if (!confirm('Tu puntuación aún no se guardó en los records. ¿Reiniciar de todas formas?')) return;
  }
  init();
});

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

// ---- Tabla de records (localStorage) ----
const HIGHSCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';

// Helpers genéricos de lectura/escritura JSON en localStorage; nunca rompen el juego
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage no disponible (o cuota excedida): se ignora, el juego sigue funcionando
  }
}

function loadHighscores() {
  const list = loadJSON(HIGHSCORES_KEY, []);
  if (!Array.isArray(list)) return [];
  // descarta entradas con forma inválida (JSON corrupto o editado a mano)
  return list.filter(e => e && typeof e.score === 'number' && typeof e.name === 'string');
}

function saveHighscores(list) {
  saveJSON(HIGHSCORES_KEY, list);
}

function resetHighscores() {
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
  } catch (e) {
    // nada que hacer si localStorage no está disponible
  }
}

function loadStats() {
  const stats = loadJSON(STATS_KEY, null);
  if (stats && typeof stats.bestCombo === 'number' && typeof stats.maxLines === 'number') {
    return stats;
  }
  return { bestCombo: 0, maxLines: 0 };
}

function saveStats(stats) {
  saveJSON(STATS_KEY, stats);
}

// Actualiza los récords históricos (mejor combo / máx. líneas) con la partida recién terminada
function updateStats() {
  const stats = loadStats();
  let changed = false;
  if (comboMax > stats.bestCombo) { stats.bestCombo = comboMax; changed = true; }
  if (lines > stats.maxLines) { stats.maxLines = lines; changed = true; }
  if (changed) saveStats(stats);
  return stats;
}

function qualifiesForHighscore(list, candidateScore) {
  return list.length < 5 || candidateScore > list[list.length - 1].score;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Pinta una lista de records en un contenedor; resalta la fila highlightIndex (-1 = ninguna)
function renderHighscoreList(container, list, highlightIndex) {
  if (!list.length) {
    container.innerHTML = '<p class="highscore-empty">Sin records todavía</p>';
    return;
  }
  const rows = list.map((entry, i) => `
    <li class="highscore-row${i === highlightIndex ? ' new' : ''}">
      <span class="hs-rank">${i + 1}</span>
      <span class="hs-name">${escapeHtml(entry.name)}</span>
      <span class="hs-score">${entry.score.toLocaleString()}</span>
    </li>
  `).join('');
  container.innerHTML = `<ol class="highscore-table">${rows}</ol>`;
}

function renderStartScreen() {
  renderHighscoreList(startHighscores, loadHighscores(), -1);
  const stats = loadStats();
  statComboEl.textContent = stats.bestCombo;
  statLinesEl.textContent = stats.maxLines;
}

// Al terminar la partida: si la puntuación entra en el top 5, pide el nombre; si no, muestra la tabla
function showHighscoreEntry() {
  const list = loadHighscores();
  if (qualifiesForHighscore(list, score)) {
    highscoreForm.classList.remove('hidden');
    overlayHighscores.classList.add('hidden');
    nameInput.value = '';
    nameInput.focus();
  } else {
    highscoreForm.classList.add('hidden');
    overlayHighscores.classList.remove('hidden');
    renderHighscoreList(overlayHighscores, list, -1);
  }
}

function saveHighscoreEntry() {
  const name = (nameInput.value.trim() || 'JUGADOR').slice(0, 12);
  const list = loadHighscores();
  const entry = { name, score, lines, level, combo: comboMax, date: new Date().toISOString() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top5 = list.slice(0, 5);
  saveHighscores(top5);
  highscoreForm.classList.add('hidden');
  overlayHighscores.classList.remove('hidden');
  renderHighscoreList(overlayHighscores, top5, top5.indexOf(entry));
  renderStartScreen();
}

saveScoreBtn.addEventListener('click', saveHighscoreEntry);
nameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter') saveHighscoreEntry();
});

playBtn.addEventListener('click', () => {
  startOverlay.classList.add('hidden');
  init();
});

resetScoresBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  resetHighscores();
  renderStartScreen();
});

initTheme();
renderStartScreen();
