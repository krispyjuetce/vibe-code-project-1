const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const healthEl = document.getElementById("health");
const respawnEl = document.getElementById("respawn");
const statusLineEl = document.getElementById("statusLine");
const ruleLine1El = document.getElementById("ruleLine1");
const ruleLine2El = document.getElementById("ruleLine2");
const gameCards = Array.from(document.querySelectorAll(".game-card"));

const leaderboardToggleEl = document.getElementById("leaderboardToggle");
const leaderboardModalEl = document.getElementById("leaderboardModal");
const leaderboardCloseEl = document.getElementById("leaderboardClose");
const leaderboardTableWrapEl = document.getElementById("leaderboardTableWrap");
const boardTabs = Array.from(document.querySelectorAll(".board-tab"));
const gameOverlayUiEl = document.getElementById("gameOverlayUi");
const overlayMessageEl = document.getElementById("overlayMessage");
const overlayActionBtnEl = document.getElementById("overlayActionBtn");
const swapColorBtnEl = document.getElementById("swapColorBtn");

const GRID_COLS = 4;
const GRID_ROWS = 3;
const GRID_PADDING = 78;

const BLUE = "#2ffff5";
const BLUE_HIT = "#b7fffc";
const RED = "#ff4f90";
const RED_HIT = "#ffc8df";
const GRID = "#78ecff";
const RUNNER_COLORS = ["#38fff6", "#7e8bff", "#ff6aa8", "#ffe66f", "#56ff87"];

const START_HEALTH = 5;
const START_INTERVAL = 1000;
const MIN_INTERVAL = 600;
const MAX_DIFF_SCORE = 35;

const FLUX_ROWS = 9;
const FLUX_COLS = 5;
const FLUX_REVEAL_MS = 3000;
const FLUX_MAX_MS = 4 * 60 * 1000;
const COLOR_MAX_MS = 2 * 60 * 1000;
const COLOR_BLOCK_COLS = 9;
const COLOR_BLOCK_ROWS = 4;
const COLOR_BLOCK_SIZE = 54;
const COLOR_BLOCK_GAP = 8;
const COLOR_SHOT_SPEED = 730;
const COLOR_PALETTE = ["#2ffff5", "#7e8bff", "#ff6aa8", "#ffe66f", "#56ff87"];

const LEADERBOARD_SIZE = 5;
const SUPABASE_URL = "https://sofswyitwkkewfszlors.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZnN3eWl0d2trZXdmc3psb3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1ODIzMTcsImV4cCI6MjA4NzE1ODMxN30.vHsAH5pDaHinPQpvcbF5h8qVex82kiwlCVDSRlfgci0";
const SUPABASE_TABLE = "leaderboard_entries";

let activeGame = "runner";
let lastTime = performance.now();
let activeBoard = "runner";

let gridRects = [];
let whackState = null;
let runnerState = null;
let fluxState = null;
let colorState = null;
let mouseCanvasPos = { x: canvas.width / 2, y: canvas.height / 2 };
let colorTouchAiming = false;
let leaderboards = emptyLeaderboards();

function emptyLeaderboards() {
  return { runner: [], whack: [], flux: [], color: [] };
}

function isLowerBetter(game) {
  return game === "flux" || game === "color";
}

function scoreLabel(game) {
  return game === "flux" || game === "color" ? "Time (s)" : "High Score";
}

function formatBoardScore(game, score) {
  if (game === "flux" || game === "color") return Number(score).toFixed(2);
  return String(Math.floor(score));
}

function normalizeBoard(game, entries) {
  const clean = Array.isArray(entries)
    ? entries
        .filter(
          (entry) =>
            entry &&
            typeof entry.name === "string" &&
            Number.isFinite(entry.score) &&
            typeof entry.date === "string"
        )
        .map((entry) => ({
          name: entry.name.slice(0, 24) || "Player",
          score: game === "flux" ? Number(entry.score) : Math.floor(entry.score),
          date: entry.date,
        }))
    : [];

  clean.sort((a, b) => compareBoardEntries(game, a, b));
  return clean.slice(0, LEADERBOARD_SIZE);
}

function compareBoardEntries(game, a, b) {
  if (isLowerBetter(game)) {
    return a.score - b.score || new Date(a.date) - new Date(b.date);
  }
  return b.score - a.score || new Date(a.date) - new Date(b.date);
}

async function fetchLeaderboardFromSupabase(game) {
  const direction = isLowerBetter(game) ? "asc" : "desc";
  const url =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?select=player_name,score,created_at` +
    `&game=eq.${encodeURIComponent(game)}` +
    `&order=score.${direction},created_at.asc` +
    `&limit=${LEADERBOARD_SIZE}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Leaderboard fetch failed (${response.status})`);
  }

  const rows = await response.json();
  return normalizeBoard(
    game,
    rows.map((row) => ({
      name: row.player_name,
      score: Number(row.score),
      date: row.created_at,
    }))
  );
}

async function refreshLeaderboard(game) {
  try {
    leaderboards[game] = await fetchLeaderboardFromSupabase(game);
    if (activeBoard === game && !leaderboardModalEl.classList.contains("hidden")) {
      renderLeaderboard(game);
    }
  } catch {
    // Keep last known in-memory leaderboard on network/API failures.
  }
}

async function refreshAllLeaderboards() {
  await Promise.all(["runner", "whack", "flux", "color"].map((game) => refreshLeaderboard(game)));
}

async function submitLeaderboardEntry(game, name, score) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      game,
      player_name: name,
      score,
    }),
  });

  if (!response.ok) {
    throw new Error(`Leaderboard submit failed (${response.status})`);
  }
}

function qualifiesForLeaderboard(game, score) {
  const board = leaderboards[game] || [];
  if (board.length < LEADERBOARD_SIZE) return true;
  const worstScore = board[board.length - 1].score;
  return isLowerBetter(game) ? score <= worstScore : score >= worstScore;
}

function recordLeaderboardScore(game, score) {
  const numericScore = game === "flux" ? Number(score.toFixed(2)) : Math.floor(score);
  if (!Number.isFinite(numericScore)) return false;
  if (!qualifiesForLeaderboard(game, numericScore)) return false;

  const promptText =
    game === "flux" || game === "color"
      ? "Top 5 finish time! Enter your name:"
      : "Top 5 score! Enter your name:";
  const entered = window.prompt(promptText, "Player");
  if (entered === null) return false;

  const name = entered.trim().slice(0, 24) || "Player";
  const board = leaderboards[game] || [];
  board.push({ name, score: numericScore, date: new Date().toISOString() });
  board.sort((a, b) => compareBoardEntries(game, a, b));
  leaderboards[game] = board.slice(0, LEADERBOARD_SIZE);

  renderLeaderboard(activeBoard);
  submitLeaderboardEntry(game, name, numericScore).then(() => refreshLeaderboard(game));
  return true;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function renderLeaderboard(game) {
  const board = leaderboards[game] || [];
  if (board.length === 0) {
    leaderboardTableWrapEl.innerHTML = '<p class="board-empty">No scores yet. Finish a game to enter the board.</p>';
    return;
  }

  const rows = board
    .map(
      (entry, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(entry.name)}</td><td>${formatBoardScore(game, entry.score)}</td><td>${formatDate(entry.date)}</td></tr>`
    )
    .join("");

  leaderboardTableWrapEl.innerHTML = `
    <table class="board-table">
      <thead>
        <tr><th>Rank</th><th>Name</th><th>${scoreLabel(game)}</th><th>Date</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openLeaderboardModal() {
  leaderboardModalEl.classList.remove("hidden");
  leaderboardModalEl.setAttribute("aria-hidden", "false");
  refreshLeaderboard(activeBoard);
  renderLeaderboard(activeBoard);
}

function closeLeaderboardModal() {
  leaderboardModalEl.classList.add("hidden");
  leaderboardModalEl.setAttribute("aria-hidden", "true");
}

function setActiveBoard(board) {
  activeBoard = board;
  boardTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.board === board));
  refreshLeaderboard(board);
  renderLeaderboard(board);
}

function finalizeGameOver(game, score, stateObj, allowRecord = true) {
  if (!stateObj.gameOver || stateObj.leaderboardHandled) return;
  stateObj.leaderboardHandled = true;
  if (!allowRecord) return;
  const didRecord = recordLeaderboardScore(game, score);
  if (didRecord) {
    statusLineEl.textContent = "Leaderboard updated. Press R to restart.";
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#08193f");
  g.addColorStop(1, "#063a56");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGlowRect(x, y, w, h, color, blur = 24) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function fillStrokeCellRect(x, y, w, h, radius = 5) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randBool() {
  return Math.random() < 0.5;
}

function buildGridRects() {
  const padding = getWhackPadding();
  const gridWidth = canvas.width - padding * 2;
  const gridHeight = canvas.height - padding * 2;
  const cellWidth = gridWidth / GRID_COLS;
  const cellHeight = gridHeight / GRID_ROWS;
  const size = Math.min(cellWidth, cellHeight) - 26;

  const rects = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const cellX = padding + c * cellWidth;
      const cellY = padding + r * cellHeight;
      rects.push({
        x: cellX + (cellWidth - size) / 2,
        y: cellY + (cellHeight - size) / 2,
        w: size,
        h: size,
      });
    }
  }
  return rects;
}

function pickNewRect(current) {
  const options = gridRects.filter((r) => r !== current);
  return options.length ? randomChoice(options) : current;
}

function getWhackInterval(score) {
  const progress = Math.min(1, score / MAX_DIFF_SCORE);
  return Math.floor(START_INTERVAL - (START_INTERVAL - MIN_INTERVAL) * progress);
}

function resetWhackGame() {
  whackState = {
    started: false,
    score: 0,
    health: START_HEALTH,
    gameOver: false,
    leaderboardHandled: false,
    moleRect: randomChoice(gridRects),
    moleIsBlue: randBool(),
    moleHit: false,
    lastMove: null,
  };
}

function resetRunnerGame() {
  const groundY = canvas.height - 86;
  runnerState = {
    started: false,
    score: 0,
    gameOver: false,
    leaderboardHandled: false,
    player: {
      x: 138,
      y: groundY - 40,
      w: 40,
      h: 40,
      vy: 0,
      grounded: true,
    },
    groundY,
    gravity: 1700,
    jumpVel: -640,
    speed: 350,
    minSpawnGap: 1.02,
    maxSpawnGap: 1.6,
    spawnIn: 1.1,
    obstacles: [],
    pulse: 0,
    jumpBuffer: 0,
    coyoteTime: 0,
  };
}

function buildFluxPath(rows, cols) {
  let col = Math.floor(Math.random() * cols);
  const path = [];

  for (let row = rows - 1; row >= 0; row -= 1) {
    path.push({ row, col });
    if (row > 0) {
      const options = [col];
      if (col > 0) options.push(col - 1);
      if (col < cols - 1) options.push(col + 1);
      col = randomChoice(options);
    }
  }

  return path;
}

function getFluxGeometry() {
  const gap = isMobileLikeDevice() ? 5 : 6;
  const maxWidth = isMobileLikeDevice() ? canvas.width - 18 : canvas.width - 180;
  const maxHeight = isMobileLikeDevice() ? canvas.height - 40 : canvas.height - 90;

  const cellW = (maxWidth - gap * (FLUX_COLS - 1)) / FLUX_COLS;
  const cellH = (maxHeight - gap * (FLUX_ROWS - 1)) / FLUX_ROWS;
  const size = Math.floor(Math.min(cellW, cellH));

  const gridWidth = FLUX_COLS * size + gap * (FLUX_COLS - 1);
  const gridHeight = FLUX_ROWS * size + gap * (FLUX_ROWS - 1);

  return {
    size,
    gap,
    left: Math.floor((canvas.width - gridWidth) / 2),
    top: Math.floor((canvas.height - gridHeight) / 2),
    gridWidth,
    gridHeight,
  };
}

function fluxCellKey(row, col) {
  return `${row},${col}`;
}

function fluxRectForCell(row, col) {
  const g = fluxState.geometry;
  return {
    x: g.left + col * (g.size + g.gap),
    y: g.top + row * (g.size + g.gap),
    w: g.size,
    h: g.size,
  };
}

function fluxCellFromPoint(x, y) {
  const g = fluxState.geometry;
  if (x < g.left || x > g.left + g.gridWidth || y < g.top || y > g.top + g.gridHeight) return null;

  const step = g.size + g.gap;
  const col = Math.floor((x - g.left) / step);
  const row = Math.floor((y - g.top) / step);
  if (col < 0 || col >= FLUX_COLS || row < 0 || row >= FLUX_ROWS) return null;

  const localX = (x - g.left) % step;
  const localY = (y - g.top) % step;
  if (localX > g.size || localY > g.size) return null;

  return { row, col };
}

function resetFluxGame() {
  fluxState = {
    started: false,
    path: buildFluxPath(FLUX_ROWS, FLUX_COLS),
    pathSet: new Set(),
    clicked: new Set(),
    wrongCell: null,
    nextIndex: 0,
    revealActive: false,
    revealEndsAt: null,
    startedAt: null,
    elapsedMs: 0,
    maxMs: FLUX_MAX_MS,
    gameOver: false,
    won: false,
    leaderboardHandled: false,
    geometry: getFluxGeometry(),
  };

  for (const step of fluxState.path) {
    fluxState.pathSet.add(fluxCellKey(step.row, step.col));
  }
}

function buildColorBoard() {
  const board = [];
  for (let row = 0; row < COLOR_BLOCK_ROWS; row += 1) {
    const line = [];
    for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
      line.push(randomChoice(COLOR_PALETTE));
    }
    board.push(line);
  }
  return board;
}

function colorBoardGeometry() {
  const portraitMobile = isMobileLikeDevice() && isPortraitGame("color");
  const gap = COLOR_BLOCK_GAP;
  const size = portraitMobile
    ? Math.floor(
        (canvas.width - Math.max(18, Math.floor(canvas.width * 0.04)) * 2 - (COLOR_BLOCK_COLS - 1) * gap) /
          COLOR_BLOCK_COLS
      )
    : COLOR_BLOCK_SIZE;
  const boardWidth = COLOR_BLOCK_COLS * size + (COLOR_BLOCK_COLS - 1) * gap;
  return {
    left: (canvas.width - boardWidth) / 2,
    top: portraitMobile ? 86 : 58,
    size,
    gap,
    boardWidth,
    boardHeight: COLOR_BLOCK_ROWS * size + (COLOR_BLOCK_ROWS - 1) * gap,
  };
}

function resetColorGame() {
  const origin = { x: canvas.width / 2, y: canvas.height - 52 };
  const board = buildColorBoard();
  colorState = {
    started: false,
    board,
    score: 0,
    elapsedMs: 0,
    startedAt: null,
    maxMs: COLOR_MAX_MS,
    gameOver: false,
    won: false,
    leaderboardHandled: false,
    shot: null,
    nextColor: null,
    shooterColors: [],
    shooterIndex: 0,
    origin,
    geometry: colorBoardGeometry(),
  };
  rollShooterChoices();
}

function colorCellRect(row, col) {
  return {
    x: colorState.geometry.left + col * (colorState.geometry.size + colorState.geometry.gap),
    y: colorState.geometry.top + row * (colorState.geometry.size + colorState.geometry.gap),
    w: colorState.geometry.size,
    h: colorState.geometry.size,
  };
}

function spawnColorLayer() {
  const newRow = [];
  for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
    newRow.push(randomChoice(COLOR_PALETTE));
  }
  colorState.board.unshift(newRow);
}

function remainingColorBlocks() {
  let count = 0;
  for (let row = 0; row < colorState.board.length; row += 1) {
    for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
      if (colorState.board[row][col]) count += 1;
    }
  }
  return count;
}

function availableBoardColors() {
  const set = new Set();
  for (let row = 0; row < colorState.board.length; row += 1) {
    for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
      const color = colorState.board[row][col];
      if (color) set.add(color);
    }
  }
  return Array.from(set);
}

function pickTwoShooterColors(available) {
  if (available.length === 0) return [];
  if (available.length === 1) return [available[0], available[0]];
  const first = randomChoice(available);
  const rest = available.filter((color) => color !== first);
  return [first, randomChoice(rest)];
}

function clearColorClusterFrom(startRow, startCol, targetColor) {
  if (colorState.board[startRow][startCol] !== targetColor) return 0;

  const queue = [{ row: startRow, col: startCol }];
  const seen = new Set([`${startRow},${startCol}`]);
  const cluster = [];

  while (queue.length > 0) {
    const cell = queue.shift();
    cluster.push(cell);

    const neighbors = [
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    ];

    for (const n of neighbors) {
      if (n.row < 0 || n.row >= colorState.board.length || n.col < 0 || n.col >= COLOR_BLOCK_COLS) continue;
      const key = `${n.row},${n.col}`;
      if (seen.has(key)) continue;
      if (colorState.board[n.row][n.col] !== targetColor) continue;
      seen.add(key);
      queue.push(n);
    }
  }

  for (const cell of cluster) {
    colorState.board[cell.row][cell.col] = null;
  }

  return cluster.length;
}

function colorBoardBottomY() {
  const rows = colorState.board.length;
  return (
    colorState.geometry.top +
    rows * colorState.geometry.size +
    (rows - 1) * colorState.geometry.gap
  );
}

function rollShooterChoices() {
  const available = availableBoardColors();
  if (available.length === 0) {
    colorState.shooterColors = [];
    colorState.nextColor = null;
    return;
  }

  colorState.shooterColors = pickTwoShooterColors(available);
  colorState.shooterIndex = 0;
  colorState.nextColor = colorState.shooterColors[colorState.shooterIndex];
}

function toggleShooterColor() {
  if (!colorState || colorState.shooterColors.length < 2) return;
  if (colorState.shooterColors[0] === colorState.shooterColors[1]) return;
  colorState.shooterIndex = colorState.shooterIndex === 0 ? 1 : 0;
  colorState.nextColor = colorState.shooterColors[colorState.shooterIndex];
}

function attachMisfiredBlock(hitRow, hitCol, shot) {
  const hitColor = colorState.board[hitRow][hitCol];
  const cluster = [];
  const q = [{ row: hitRow, col: hitCol }];
  const seen = new Set([`${hitRow},${hitCol}`]);

  while (q.length > 0) {
    const node = q.shift();
    cluster.push(node);

    const neighbors = [
      { row: node.row - 1, col: node.col },
      { row: node.row + 1, col: node.col },
      { row: node.row, col: node.col - 1 },
      { row: node.row, col: node.col + 1 },
    ];
    for (const n of neighbors) {
      if (n.row < 0 || n.row >= colorState.board.length || n.col < 0 || n.col >= COLOR_BLOCK_COLS) continue;
      const key = `${n.row},${n.col}`;
      if (seen.has(key)) continue;
      if (colorState.board[n.row][n.col] !== hitColor) continue;
      seen.add(key);
      q.push(n);
    }
  }

  const candidates = [];
  const marker = new Set();
  for (const node of cluster) {
    const around = [
      { row: node.row - 1, col: node.col },
      { row: node.row + 1, col: node.col },
      { row: node.row, col: node.col - 1 },
      { row: node.row, col: node.col + 1 },
    ];
    for (const n of around) {
      if (n.col < 0 || n.col >= COLOR_BLOCK_COLS) continue;
      if (n.row < 0) continue;
      if (n.row < colorState.board.length && colorState.board[n.row][n.col] !== null) continue;
      const key = `${n.row},${n.col}`;
      if (marker.has(key)) continue;
      marker.add(key);
      candidates.push(n);
    }
  }

  if (candidates.length === 0) return;

  let best = candidates[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const centerX =
      colorState.geometry.left +
      c.col * (colorState.geometry.size + colorState.geometry.gap) +
      colorState.geometry.size / 2;
    const centerY =
      colorState.geometry.top +
      c.row * (colorState.geometry.size + colorState.geometry.gap) +
      colorState.geometry.size / 2;
    const dist = (centerX - shot.x) ** 2 + (centerY - shot.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  while (best.row >= colorState.board.length) {
    colorState.board.push(new Array(COLOR_BLOCK_COLS).fill(null));
  }
  colorState.board[best.row][best.col] = shot.color;
}

function triggerRunnerJump() {
  runnerState.player.vy = runnerState.jumpVel;
  runnerState.player.grounded = false;
  runnerState.jumpBuffer = 0;
  runnerState.coyoteTime = 0;
}

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isMobileLikeDevice() {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 920;
}

function isPortraitGame(game) {
  return game === "whack" || game === "flux" || game === "color";
}

function requiredOrientation(game) {
  if (isPortraitGame(game)) return "portrait";
  return "landscape";
}

function updateCanvasForActiveGame() {
  const mobile = isMobileLikeDevice();
  const portraitMode = isPortraitGame(activeGame);
  let targetWidth = 820;
  let targetHeight = 560;

  if (mobile && portraitMode) {
    targetWidth = 560;
    targetHeight = 900;
  } else if (mobile && !portraitMode) {
    // Keep landscape games fully visible on short mobile viewports (HUD + top rows included).
    targetWidth = 820;
    targetHeight = Math.max(240, Math.min(380, Math.floor(window.innerHeight - 180)));
  }

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

function getWhackPadding() {
  if (!isMobileLikeDevice()) return GRID_PADDING;
  return Math.max(12, Math.floor(canvas.width * 0.03));
}

function isOrientationValid(game) {
  if (!isMobileLikeDevice()) return true;
  const portrait = window.innerHeight >= window.innerWidth;
  const required = requiredOrientation(game);
  return required === "portrait" ? portrait : !portrait;
}

function getGameState(game) {
  if (game === "whack") return whackState;
  if (game === "runner") return runnerState;
  if (game === "flux") return fluxState;
  return colorState;
}

function updateOverlayControls() {
  const state = getGameState(activeGame);
  if (!state) return;

  if (!isOrientationValid(activeGame)) {
    gameOverlayUiEl.classList.remove("hidden");
    gameOverlayUiEl.setAttribute("aria-hidden", "false");
    overlayMessageEl.textContent = `Rotate to ${requiredOrientation(activeGame)} to play`;
    overlayActionBtnEl.classList.add("hidden");
    swapColorBtnEl.classList.add("hidden");
    return;
  }

  const showStart = !state.started;
  const showRestart = state.gameOver;
  const showOverlay = showStart || showRestart;

  gameOverlayUiEl.classList.toggle("hidden", !showOverlay);
  gameOverlayUiEl.setAttribute("aria-hidden", showOverlay ? "false" : "true");
  if (showStart) {
    overlayMessageEl.textContent = "Ready to play?";
    overlayActionBtnEl.textContent = "Start Game";
    overlayActionBtnEl.classList.remove("hidden");
  } else if (showRestart) {
    overlayMessageEl.textContent = "Round complete";
    overlayActionBtnEl.textContent = "Restart Game";
    overlayActionBtnEl.classList.remove("hidden");
  }

  const showSwap = activeGame === "color" && state.started && !state.gameOver;
  swapColorBtnEl.classList.toggle("hidden", !showSwap);
}

function startCurrentGame() {
  if (!isOrientationValid(activeGame)) {
    statusLineEl.textContent = `Rotate to ${requiredOrientation(activeGame)} orientation.`;
    return;
  }

  const now = performance.now();

  if (activeGame === "whack" && !whackState.started) {
    whackState.started = true;
    whackState.lastMove = now;
    statusLineEl.textContent = "Game running.";
    return;
  }

  if (activeGame === "runner" && !runnerState.started) {
    runnerState.started = true;
    statusLineEl.textContent = "Game running.";
    return;
  }

  if (activeGame === "flux" && !fluxState.started) {
    fluxState.started = true;
    fluxState.revealActive = true;
    fluxState.revealEndsAt = now + FLUX_REVEAL_MS;
    fluxState.startedAt = null;
    fluxState.elapsedMs = 0;
    statusLineEl.textContent = "Memorize the path...";
    return;
  }

  if (activeGame === "color" && !colorState.started) {
    colorState.started = true;
    colorState.startedAt = now;
    colorState.elapsedMs = 0;
    statusLineEl.textContent = "Destroy all top blocks.";
  }
}

function activateGame(game) {
  activeGame = game;
  updateCanvasForActiveGame();
  gridRects = buildGridRects();
  gameCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.game === activeGame);
  });

  if (activeGame === "whack") {
    resetWhackGame();
    ruleLine1El.innerHTML = "<strong>Whack Mode:</strong> Click blue squares. Ignore red squares.";
    ruleLine2El.textContent = "Missing a blue square costs health. Speed reaches max by score 35.";
    statusLineEl.textContent = "Press S to start.";
    return;
  }

  if (activeGame === "runner") {
    resetRunnerGame();
    ruleLine1El.innerHTML = "<strong>Hyper Runner:</strong> Click to jump over neon obstacles.";
    ruleLine2El.textContent = "Avoid collisions and survive as speed increases.";
    statusLineEl.textContent = "Press S to start.";
    return;
  }

  if (activeGame === "flux") {
    resetFluxGame();
    ruleLine1El.innerHTML = "<strong>Memory Flux:</strong> Memorize the safe path, then click from bottom to top.";
    ruleLine2El.textContent = "You have 3s preview and 4 minutes max to finish. One wrong tile is a loss.";
    statusLineEl.textContent = "Press S to start.";
    return;
  }

  if (activeGame === "color") {
    resetColorGame();
    ruleLine1El.innerHTML = "<strong>Color Block:</strong> Aim with mouse and click to shoot.";
    ruleLine2El.textContent = "Space toggles 2 pre-decided colors. Wrong hit sticks shot + adds top layer. 2 minute limit.";
    statusLineEl.textContent = "Press S to start.";
    return;
  }

  resetFluxGame();
  activeGame = "flux";
  ruleLine1El.innerHTML = "<strong>Memory Flux:</strong> Memorize the safe path, then click from bottom to top.";
  ruleLine2El.textContent = "You have 3s preview and 4 minutes max to finish. One wrong tile is a loss.";
  statusLineEl.textContent = "Press S to start.";
}

function drawCenterOverlay(title, subtitle, titleColor = "#ff99bf") {
  ctx.fillStyle = "rgba(1, 6, 12, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = titleColor;
  ctx.font = "700 56px Orbitron";
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = "#ebfbff";
  ctx.font = "500 24px Space Grotesk";
  ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 30);
}

function drawWhackGrid() {
  const padding = getWhackPadding();
  const gridWidth = canvas.width - padding * 2;
  const gridHeight = canvas.height - padding * 2;
  const cellWidth = gridWidth / GRID_COLS;
  const cellHeight = gridHeight / GRID_ROWS;

  ctx.save();
  ctx.shadowColor = "rgba(120, 236, 255, 0.7)";
  ctx.shadowBlur = 16;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 2;

  for (let c = 0; c <= GRID_COLS; c += 1) {
    const x = padding + c * cellWidth;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, padding + gridHeight);
    ctx.stroke();
  }

  for (let r = 0; r <= GRID_ROWS; r += 1) {
    const y = padding + r * cellHeight;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(padding + gridWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

function updateWhack(now) {
  if (!isOrientationValid("whack")) {
    scoreEl.textContent = `Score: ${whackState.score}`;
    healthEl.textContent = `Health: ${whackState.health}`;
    respawnEl.textContent = "Respawn: 1.00s";
    return;
  }

  if (!whackState.started) {
    scoreEl.textContent = `Score: ${whackState.score}`;
    healthEl.textContent = `Health: ${whackState.health}`;
    respawnEl.textContent = "Respawn: 1.00s";
    return;
  }

  const interval = getWhackInterval(whackState.score);
  if (!whackState.gameOver && now - whackState.lastMove >= interval) {
    if (whackState.moleIsBlue && !whackState.moleHit) {
      whackState.health -= 1;
      if (whackState.health <= 0) {
        whackState.gameOver = true;
        statusLineEl.textContent = "Game over. Press R to restart.";
      }
    }
    if (!whackState.gameOver) {
      whackState.moleRect = pickNewRect(whackState.moleRect);
      whackState.moleIsBlue = randBool();
      whackState.moleHit = false;
      whackState.lastMove = now;
    }
  }

  finalizeGameOver("whack", whackState.score, whackState);
  scoreEl.textContent = `Score: ${whackState.score}`;
  healthEl.textContent = `Health: ${whackState.health}`;
  respawnEl.textContent = `Respawn: ${(interval / 1000).toFixed(2)}s`;
}

function renderWhack() {
  drawWhackGrid();
  const rect = whackState.moleRect;
  const base = whackState.moleIsBlue ? BLUE : RED;
  const hit = whackState.moleIsBlue ? BLUE_HIT : RED_HIT;
  const color = whackState.moleHit ? hit : base;
  drawGlowRect(rect.x, rect.y, rect.w, rect.h, color);

  if (whackState.gameOver) {
    drawCenterOverlay("Game Over", "Press R to restart");
  }
}

function createObstacle() {
  const type = randomChoice(["spike", "block", "diamond"]);
  const h = 40 + Math.random() * 34;
  const w = type === "spike" ? 44 : 34 + Math.random() * 20;
  return {
    x: canvas.width + 30,
    y: runnerState.groundY - h,
    w,
    h,
    color: randomChoice(RUNNER_COLORS),
    type,
  };
}

function drawObstacle(obstacle) {
  ctx.save();
  ctx.shadowColor = obstacle.color;
  ctx.shadowBlur = 20;
  ctx.fillStyle = obstacle.color;

  if (obstacle.type === "spike") {
    ctx.beginPath();
    ctx.moveTo(obstacle.x, obstacle.y + obstacle.h);
    ctx.lineTo(obstacle.x + obstacle.w / 2, obstacle.y);
    ctx.lineTo(obstacle.x + obstacle.w, obstacle.y + obstacle.h);
    ctx.closePath();
    ctx.fill();
  } else if (obstacle.type === "diamond") {
    const cx = obstacle.x + obstacle.w / 2;
    const cy = obstacle.y + obstacle.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, obstacle.y);
    ctx.lineTo(obstacle.x + obstacle.w, cy);
    ctx.lineTo(cx, obstacle.y + obstacle.h);
    ctx.lineTo(obstacle.x, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
  }
  ctx.restore();
}

function updateRunner(dt) {
  if (!isOrientationValid("runner")) {
    scoreEl.textContent = `Distance: ${Math.floor(runnerState.score)}`;
    healthEl.textContent = "State: Rotate device";
    respawnEl.textContent = `Speed: ${Math.floor(runnerState.speed)} px/s`;
    return;
  }

  if (!runnerState.started) {
    scoreEl.textContent = "Distance: 0";
    healthEl.textContent = "State: Ready";
    respawnEl.textContent = `Speed: ${Math.floor(runnerState.speed)} px/s`;
    return;
  }

  if (runnerState.gameOver) {
    finalizeGameOver("runner", runnerState.score, runnerState);
    scoreEl.textContent = `Distance: ${Math.floor(runnerState.score)}`;
    healthEl.textContent = "Status: Crashed";
    respawnEl.textContent = `Speed: ${Math.floor(runnerState.speed)} px/s`;
    return;
  }

  runnerState.pulse += dt * 2.4;
  runnerState.score += dt * 14;
  runnerState.speed = Math.min(1000, 350 + runnerState.score * 2.4);
  runnerState.jumpBuffer = Math.max(0, runnerState.jumpBuffer - dt);
  runnerState.coyoteTime = Math.max(0, runnerState.coyoteTime - dt);

  runnerState.player.vy += runnerState.gravity * dt;
  runnerState.player.y += runnerState.player.vy * dt;

  if (runnerState.player.y + runnerState.player.h >= runnerState.groundY) {
    runnerState.player.y = runnerState.groundY - runnerState.player.h;
    runnerState.player.vy = 0;
    runnerState.player.grounded = true;
    runnerState.coyoteTime = 0.12;
  } else {
    runnerState.player.grounded = false;
  }

  if (
    runnerState.jumpBuffer > 0 &&
    (runnerState.player.grounded || runnerState.coyoteTime > 0)
  ) {
    triggerRunnerJump();
  }

  runnerState.spawnIn -= dt;
  if (runnerState.spawnIn <= 0) {
    runnerState.obstacles.push(createObstacle());
    const tightness = Math.min(1, runnerState.score / 180);
    const minGap = runnerState.minSpawnGap - tightness * 0.32;
    const maxGap = runnerState.maxSpawnGap - tightness * 0.38;
    runnerState.spawnIn = minGap + Math.random() * Math.max(0.2, maxGap - minGap);
  }

  const playerRect = {
    x: runnerState.player.x + 4,
    y: runnerState.player.y + 4,
    w: runnerState.player.w - 8,
    h: runnerState.player.h - 8,
  };

  for (const obstacle of runnerState.obstacles) {
    obstacle.x -= runnerState.speed * dt;
    if (intersects(playerRect, obstacle)) {
      runnerState.gameOver = true;
      statusLineEl.textContent = "You crashed. Press R to restart.";
      break;
    }
  }

  runnerState.obstacles = runnerState.obstacles.filter((o) => o.x + o.w > -20);

  finalizeGameOver("runner", runnerState.score, runnerState);
  scoreEl.textContent = `Distance: ${Math.floor(runnerState.score)}`;
  healthEl.textContent = runnerState.player.grounded ? "State: Grounded" : "State: Airborne";
  respawnEl.textContent = `Speed: ${Math.floor(runnerState.speed)} px/s`;
}

function renderRunner() {
  const groundGlow = 8 + Math.sin(runnerState.pulse) * 2;

  ctx.save();
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 3;
  ctx.shadowColor = GRID;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(0, runnerState.groundY);
  ctx.lineTo(canvas.width, runnerState.groundY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(120, 236, 255, 0.24)";
  ctx.lineWidth = 1.2;
  for (let x = -40; x < canvas.width + 80; x += 52) {
    const scrollX = x - (runnerState.score * 10) % 52;
    ctx.beginPath();
    ctx.moveTo(scrollX, runnerState.groundY + 4);
    ctx.lineTo(scrollX + 24, runnerState.groundY + 4 + groundGlow);
    ctx.stroke();
  }
  ctx.restore();

  for (const obstacle of runnerState.obstacles) {
    drawObstacle(obstacle);
  }

  drawGlowRect(
    runnerState.player.x,
    runnerState.player.y,
    runnerState.player.w,
    runnerState.player.h,
    BLUE,
    28
  );

  if (runnerState.gameOver) {
    drawCenterOverlay("Game Over", "Press R to restart");
  }
}

function updateFlux(now) {
  if (!isOrientationValid("flux")) {
    scoreEl.textContent = `Progress: ${fluxState.nextIndex}/${fluxState.path.length}`;
    respawnEl.textContent = "Memorize: 3.0s";
    healthEl.textContent = "Status: Rotate device";
    return;
  }

  if (!fluxState.started) {
    scoreEl.textContent = `Progress: ${fluxState.nextIndex}/${fluxState.path.length}`;
    respawnEl.textContent = "Memorize: 3.0s";
    healthEl.textContent = "Status: Ready";
    return;
  }

  if (!fluxState.gameOver) {
    if (fluxState.revealActive && now >= fluxState.revealEndsAt) {
      fluxState.revealActive = false;
      fluxState.startedAt = now;
      statusLineEl.textContent = "Now click the path from bottom to top.";
    }

    if (!fluxState.revealActive) {
      fluxState.elapsedMs = now - fluxState.startedAt;
      if (fluxState.elapsedMs >= fluxState.maxMs) {
        fluxState.elapsedMs = fluxState.maxMs;
        fluxState.gameOver = true;
        fluxState.won = false;
        statusLineEl.textContent = "Time limit exceeded. Press R to restart.";
      }
    }
  }

  if (fluxState.gameOver) {
    finalizeGameOver("flux", fluxState.elapsedMs / 1000, fluxState, fluxState.won);
  }

  scoreEl.textContent = `Progress: ${fluxState.nextIndex}/${fluxState.path.length}`;
  if (fluxState.revealActive) {
    const revealLeft = Math.max(0, (fluxState.revealEndsAt - now) / 1000);
    respawnEl.textContent = `Memorize: ${revealLeft.toFixed(1)}s`;
    healthEl.textContent = "Status: Preview";
  } else {
    respawnEl.textContent = `Time: ${(fluxState.elapsedMs / 1000).toFixed(1)}s / 240.0s`;
    if (fluxState.gameOver && fluxState.won) {
      healthEl.textContent = "Status: Complete";
    } else if (fluxState.gameOver) {
      healthEl.textContent = "Status: Failed";
    } else {
      healthEl.textContent = "Status: Navigating";
    }
  }
}

function drawFluxGrid() {
  const g = fluxState.geometry;

  ctx.save();
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(120, 236, 255, 0.35)";
  ctx.shadowBlur = 8;

  for (let row = 0; row < FLUX_ROWS; row += 1) {
    for (let col = 0; col < FLUX_COLS; col += 1) {
      const key = fluxCellKey(row, col);
      const rect = fluxRectForCell(row, col);

      let color = "rgba(13, 30, 56, 0.9)";
      if (fluxState.revealActive) {
        color = fluxState.pathSet.has(key) ? "rgba(47, 255, 245, 0.88)" : "rgba(255, 79, 144, 0.85)";
      } else {
        if (fluxState.clicked.has(key)) color = "rgba(124, 255, 194, 0.92)";
        if (fluxState.wrongCell && fluxState.wrongCell.row === row && fluxState.wrongCell.col === col) {
          color = "rgba(255, 79, 144, 0.95)";
        }
      }

      ctx.fillStyle = color;
      fillStrokeCellRect(rect.x, rect.y, rect.w, rect.h, 5);
    }
  }

  ctx.restore();

  if (fluxState.revealActive) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(235, 251, 255, 0.92)";
    ctx.font = "700 24px Orbitron";
    ctx.fillText("MEMORIZE THE PATH", canvas.width / 2, g.top - 12);
  }
}

function renderFlux() {
  drawFluxGrid();

  if (fluxState.gameOver && fluxState.won) {
    drawCenterOverlay("Path Complete", "Press R to restart", "#8bffc6");
  } else if (fluxState.gameOver) {
    drawCenterOverlay("Lava Hit", "Press R to restart");
  }
}

function handleFluxClick(x, y) {
  if (!fluxState.started || fluxState.gameOver || fluxState.revealActive) return;

  const picked = fluxCellFromPoint(x, y);
  if (!picked) return;

  const expected = fluxState.path[fluxState.nextIndex];
  if (picked.row === expected.row && picked.col === expected.col) {
    fluxState.clicked.add(fluxCellKey(picked.row, picked.col));
    fluxState.nextIndex += 1;

    if (fluxState.nextIndex >= fluxState.path.length) {
      fluxState.elapsedMs = performance.now() - fluxState.startedAt;
      fluxState.gameOver = true;
      fluxState.won = true;
      statusLineEl.textContent = "Path complete. Great run.";
    }
    return;
  }

  fluxState.wrongCell = picked;
  fluxState.gameOver = true;
  fluxState.won = false;
  statusLineEl.textContent = "Wrong tile. You hit lava. Press R to restart.";
}

function fireColorShot(targetX, targetY) {
  if (!colorState.started || colorState.gameOver || colorState.shot || !colorState.nextColor) return;

  let dx = targetX - colorState.origin.x;
  let dy = targetY - colorState.origin.y;
  if (dy > -18) dy = -18;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag;
  dy /= mag;

  colorState.shot = {
    x: colorState.origin.x,
    y: colorState.origin.y,
    vx: dx * COLOR_SHOT_SPEED,
    vy: dy * COLOR_SHOT_SPEED,
    r: 10,
    color: colorState.nextColor,
  };
}

function updateColor(dt, now) {
  if (!isOrientationValid("color")) {
    scoreEl.textContent = `Score: ${colorState.score}`;
    respawnEl.textContent = `Time: ${(colorState.elapsedMs / 1000).toFixed(1)}s / 120.0s`;
    healthEl.textContent = "Blocks Left: paused";
    return;
  }

  if (!colorState.started) {
    scoreEl.textContent = `Score: ${colorState.score}`;
    respawnEl.textContent = "Time: 0.0s / 120.0s";
    healthEl.textContent = `Blocks Left: ${remainingColorBlocks()}`;
    return;
  }

  if (!colorState.gameOver) {
    colorState.elapsedMs = now - colorState.startedAt;
    if (colorState.elapsedMs >= colorState.maxMs) {
      colorState.elapsedMs = colorState.maxMs;
      colorState.gameOver = true;
      colorState.won = false;
      statusLineEl.textContent = "Time limit exceeded. Press R to restart.";
    }
    if (colorBoardBottomY() >= colorState.origin.y - 24) {
      colorState.gameOver = true;
      colorState.won = false;
      statusLineEl.textContent = "Blocks reached your launcher. Press R to restart.";
    }
  }

  if (!colorState.gameOver && colorState.shot) {
    const shot = colorState.shot;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;

    if (shot.x - shot.r <= 0 || shot.x + shot.r >= canvas.width) {
      shot.vx *= -1;
      shot.x = Math.max(shot.r, Math.min(canvas.width - shot.r, shot.x));
    }

    if (shot.y - shot.r <= 0) {
      colorState.shot = null;
      rollShooterChoices();
    }

    if (colorState.shot) {
      for (let row = 0; row < colorState.board.length; row += 1) {
        for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
          const blockColor = colorState.board[row][col];
          if (!blockColor) continue;
          const rect = colorCellRect(row, col);
          const hit =
            shot.x + shot.r > rect.x &&
            shot.x - shot.r < rect.x + rect.w &&
            shot.y + shot.r > rect.y &&
            shot.y - shot.r < rect.y + rect.h;

          if (!hit) continue;

          if (shot.color === blockColor) {
            const removed = clearColorClusterFrom(row, col, blockColor);
            colorState.score += removed * 5;
            statusLineEl.textContent = `Matched ${removed} block${removed === 1 ? "" : "s"}.`;
          } else {
            attachMisfiredBlock(row, col, shot);
            spawnColorLayer();
            statusLineEl.textContent = "Wrong color hit: lava layer added.";
            if (colorBoardBottomY() >= colorState.origin.y - 24) {
              colorState.gameOver = true;
              colorState.won = false;
              statusLineEl.textContent = "Blocks reached your launcher. Press R to restart.";
            }
          }

          colorState.shot = null;
          rollShooterChoices();
          row = colorState.board.length;
          break;
        }
      }
    }

    if (!colorState.gameOver && remainingColorBlocks() === 0) {
      colorState.gameOver = true;
      colorState.won = true;
      colorState.elapsedMs = now - colorState.startedAt;
      statusLineEl.textContent = "All blocks cleared.";
    }
  }

  if (colorState.gameOver) {
    finalizeGameOver("color", colorState.elapsedMs / 1000, colorState, colorState.won);
  }

  scoreEl.textContent = `Score: ${colorState.score}`;
  respawnEl.textContent = `Time: ${(colorState.elapsedMs / 1000).toFixed(1)}s / 120.0s`;
  healthEl.textContent = `Blocks Left: ${remainingColorBlocks()}`;
}

function renderColor() {
  ctx.save();
  for (let row = 0; row < colorState.board.length; row += 1) {
    for (let col = 0; col < COLOR_BLOCK_COLS; col += 1) {
      const blockColor = colorState.board[row][col];
      if (!blockColor) continue;
      const rect = colorCellRect(row, col);
      drawGlowRect(rect.x, rect.y, rect.w, rect.h, blockColor, 16);
    }
  }
  ctx.restore();

  const launcherColor = colorState.shot ? colorState.shot.color : colorState.nextColor;
  if (launcherColor) {
    drawGlowRect(
      colorState.origin.x - 16,
      colorState.origin.y - 16,
      32,
      32,
      launcherColor,
      18
    );
  }

  if (!colorState.shot && !colorState.gameOver) {
    let dx = mouseCanvasPos.x - colorState.origin.x;
    let dy = mouseCanvasPos.y - colorState.origin.y;
    if (dy > -18) dy = -18;
    const mag = Math.hypot(dx, dy) || 1;
    dx /= mag;
    dy /= mag;

    ctx.save();
    ctx.strokeStyle = "rgba(235, 251, 255, 0.78)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(colorState.origin.x, colorState.origin.y);
    ctx.lineTo(colorState.origin.x + dx * 420, colorState.origin.y + dy * 420);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (colorState.shot) {
    const shot = colorState.shot;
    ctx.save();
    ctx.shadowColor = shot.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = shot.color;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (colorState.gameOver && colorState.won) {
    drawCenterOverlay("Board Cleared", "Press R to restart", "#8bffc6");
  } else if (colorState.gameOver) {
    drawCenterOverlay("Game Over", "Press R to restart");
  }
}

function onPointerDown(event) {
  if (!isOrientationValid(activeGame)) return;

  if (activeGame === "runner") {
    if (!runnerState.started || runnerState.gameOver) return;
    if (runnerState.player.grounded || runnerState.coyoteTime > 0) {
      triggerRunnerJump();
    } else {
      runnerState.jumpBuffer = 0.18;
    }
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  if (activeGame === "whack") {
    if (!whackState.started || whackState.gameOver || whackState.moleHit) return;
    if (pointInRect(x, y, whackState.moleRect) && whackState.moleIsBlue) {
      whackState.score += 1;
      whackState.moleHit = true;
    }
    return;
  }

  if (activeGame === "color") {
    if (!colorState.started || colorState.gameOver || colorState.shot || !colorState.nextColor) return;

    if (isMobileLikeDevice()) {
      colorTouchAiming = true;
      mouseCanvasPos = { x, y };
      return;
    }

    fireColorShot(x, y);
    return;
  }

  handleFluxClick(x, y);
}

function onPointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseCanvasPos = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function onPointerUp(event) {
  if (activeGame !== "color" || !isMobileLikeDevice() || !colorTouchAiming) return;
  colorTouchAiming = false;
  if (!isOrientationValid("color")) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  mouseCanvasPos = { x, y };
  fireColorShot(x, y);
}

function onKeyDown(event) {
  if (event.key === "Escape" && !leaderboardModalEl.classList.contains("hidden")) {
    closeLeaderboardModal();
    return;
  }

  if (event.key === "s" || event.key === "S") {
    startCurrentGame();
    return;
  }

  if (event.code === "Space" && activeGame === "color" && colorState.started && !colorState.gameOver) {
    event.preventDefault();
    toggleShooterColor();
    return;
  }

  if (event.key !== "r" && event.key !== "R") return;

  if (activeGame === "whack" && whackState.gameOver) {
    resetWhackGame();
    startCurrentGame();
  }

  if (activeGame === "runner" && runnerState.gameOver) {
    resetRunnerGame();
    startCurrentGame();
  }

  if (activeGame === "flux" && fluxState.gameOver) {
    resetFluxGame();
    startCurrentGame();
  }

  if (activeGame === "color" && colorState.gameOver) {
    resetColorGame();
    startCurrentGame();
  }
}

function onOverlayAction() {
  const state = getGameState(activeGame);
  if (!state) return;
  if (state.gameOver) {
    if (activeGame === "whack") resetWhackGame();
    else if (activeGame === "runner") resetRunnerGame();
    else if (activeGame === "flux") resetFluxGame();
    else resetColorGame();
  }
  startCurrentGame();
}

function gameLoop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  drawBackground();

  if (activeGame === "whack") {
    updateWhack(now);
    renderWhack();
  } else if (activeGame === "runner") {
    updateRunner(dt);
    renderRunner();
  } else if (activeGame === "flux") {
    updateFlux(now);
    renderFlux();
  } else {
    updateColor(dt, now);
    renderColor();
  }

  updateOverlayControls();
  requestAnimationFrame(gameLoop);
}

for (const card of gameCards) {
  card.addEventListener("click", () => activateGame(card.dataset.game));
}

for (const tab of boardTabs) {
  tab.addEventListener("click", () => setActiveBoard(tab.dataset.board));
}

leaderboardToggleEl.addEventListener("click", openLeaderboardModal);
leaderboardCloseEl.addEventListener("click", closeLeaderboardModal);
leaderboardModalEl.addEventListener("click", (event) => {
  if (event.target === leaderboardModalEl) closeLeaderboardModal();
});
overlayActionBtnEl.addEventListener("click", onOverlayAction);
swapColorBtnEl.addEventListener("click", () => {
  if (activeGame !== "color") return;
  if (!colorState.started || colorState.gameOver) return;
  toggleShooterColor();
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", () => {
  colorTouchAiming = false;
});
window.addEventListener("resize", () => {
  updateCanvasForActiveGame();
  gridRects = buildGridRects();
  if (activeGame === "runner") resetRunnerGame();
  if (activeGame === "flux") resetFluxGame();
  if (activeGame === "color") resetColorGame();
  updateOverlayControls();
});
window.addEventListener("keydown", onKeyDown);

updateCanvasForActiveGame();
gridRects = buildGridRects();
resetWhackGame();
resetRunnerGame();
resetFluxGame();
resetColorGame();
refreshAllLeaderboards();
setActiveBoard("runner");
activateGame("runner");
updateOverlayControls();
requestAnimationFrame(gameLoop);
