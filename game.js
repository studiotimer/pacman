"use strict";

const TILE = 24;
const COLS = MAZE_ROWS[0].length;
const ROWS = MAZE_ROWS.length;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

const RIGHT = 0;
const DOWN = 1;
const LEFT = 2;
const UP = 3;
const VX = [1, 0, -1, 0];
const VY = [0, 1, 0, -1];
const OPP = [LEFT, UP, RIGHT, DOWN];
const ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

const PHASES = [
  ["scatter", 7],
  ["chase", 20],
  ["scatter", 7],
  ["chase", 20],
  ["scatter", 5],
  ["chase", 9999],
];

const KEY_DIR = {
  ArrowRight: RIGHT,
  KeyD: RIGHT,
  ArrowDown: DOWN,
  KeyS: DOWN,
  ArrowLeft: LEFT,
  KeyA: LEFT,
  ArrowUp: UP,
  KeyW: UP,
};

const BEST_KEY = "muncher-best";
const MUTE_KEY = "muncher-muted";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d", { alpha: false });
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const blurbEl = document.getElementById("blurb");
const playBtn = document.getElementById("play");
const muteBtn = document.getElementById("mute");
const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");

let grid = [];
let pelletsLeft = 0;
let pelletsEaten = 0;
let score = 0;
let best = 0;
let lives = 3;
let level = 1;
let extraAwarded = false;
let state = "menu";
let phase = "scatter";
let phaseIndex = 0;
let phaseLeft = PHASES[0][1];
let frightLeft = 0;
let frightChain = 0;
let readyLeft = 0;
let deathT = 0;
let winLeft = 0;
let anim = 0;
let fruit = null;
let fruitSpawned = false;
let floaters = [];
let levelMark = 0;
let dotFlip = 0;
let muted = false;
let bestDirty = false;
let lastBestFlush = 0;
const heldDirs = [];

const door = findCells("-")[0];
const homes = findCells("H");

const player = {
  kind: "player",
  x: 0,
  y: 0,
  dir: LEFT,
  nextDir: LEFT,
  acc: 0,
  moving: false,
};

const ghosts = [
  makeGhost(0, "#ff5d73", { c: 17, r: 1 }, homes[1]),
  makeGhost(1, "#ff8ec9", { c: 1, r: 1 }, homes[0]),
  makeGhost(2, "#5ee0ff", { c: 17, r: 22 }, homes[2]),
  makeGhost(3, "#ffb020", { c: 1, r: 22 }, homes[1]),
];

function makeGhost(id, color, scatter, home) {
  return {
    kind: "ghost",
    id,
    color,
    scatter,
    home,
    x: 0,
    y: 0,
    dir: LEFT,
    acc: 0,
    mode: "house",
    releaseDots: [0, 12, 30, 55][id],
    releaseTime: [0, 4, 9, 14][id],
    penTimer: 0,
  };
}

function findCells(ch) {
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE_ROWS[r][c] === ch) cells.push({ c, r });
    }
  }
  return cells;
}

function pad(n) {
  return String(n).padStart(4, "0");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function loadSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function hud() {
  scoreEl.textContent = pad(score);
  bestEl.textContent = pad(best);
  levelEl.textContent = String(level);
}

function renderLives() {
  livesEl.replaceChildren();
  for (let i = 0; i < lives; i++) {
    const pip = document.createElement("span");
    pip.className = "life";
    livesEl.appendChild(pip);
  }
}

function showOverlay(title, blurb, button) {
  titleEl.textContent = title;
  blurbEl.textContent = blurb;
  playBtn.textContent = button;
  overlay.hidden = false;
  stage.classList.add("dim");
}

function hideOverlay() {
  overlay.hidden = true;
  stage.classList.remove("dim");
}

const A2 = 110;
const C3 = 130.81;
const D3 = 146.83;
const E3 = 164.81;
const A3 = 220;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392;
const A4 = 440;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const C6 = 1046.5;
const E6 = 1318.51;
const E2 = 82.41;
const F2 = 87.31;
const G2 = 98;
const B2 = 123.47;
const F3 = 174.61;
const G3 = 196;
const B3 = 246.94;
const F4 = 349.23;
const B4 = 493.88;
const F5 = 698.46;
const A5 = 880;

const audio = {
  ctx: null,
  master: null,
  music: null,
  sfx: null,
  noise: null,
  mode: "off",
  nextNote: 0,
  step: 0,
  pad: [],
};

function arrange(bpm, parts) {
  const length = parts[0].seq.length;
  const steps = Array.from({ length }, () => []);
  for (const part of parts) {
    if (part.seq.length !== length) throw new Error(`Soundtrack part length ${part.seq.length}, expected ${length}`);
    part.seq.forEach((token, index) => {
      if (token == null) return;
      if (token === "k") {
        steps[index].push({ kick: true });
        return;
      }
      if (token === "h") {
        steps[index].push({ hat: true });
        return;
      }
      const notes = Array.isArray(token) ? token : [token];
      for (const freq of notes) {
        steps[index].push({
          f: freq,
          d: part.d,
          v: part.v,
          type: part.type,
          filter: part.filter,
          harm: part.harm || 0,
        });
      }
    });
  }
  return { bpm, steps };
}

function every(length, test, mark) {
  return Array.from({ length }, (_, index) => (test(index) ? mark : null));
}

const MUSIC = {
  menu: arrange(96, [
    { seq: [A2, null, E2, null, A2, null, C3, E3, F2, null, C3, null, E2, null, A2, E2], d: 0.32, v: 0.1, type: "sine" },
    { seq: [A4, C5, E5, D5, C5, E5, A5, G5, E5, C5, D5, E5, C5, B4, A4, E4], d: 0.28, v: 0.07, type: "triangle", filter: 2200, harm: 0.2 },
    { seq: [[A3, C4, E4], null, null, null, null, null, null, null, [F3, A3, C4], null, null, null, [E3, G3, B3], null, null, null], d: 0.22, v: 0.035, type: "sine" },
    { seq: every(16, (index) => index % 4 === 0, "k"), d: 0, v: 0, type: "sine" },
    { seq: every(16, (index) => index % 2 === 1, "h"), d: 0, v: 0, type: "sine" },
  ]),
  ready: arrange(108, [
    { seq: [A2, null, E2, null, A2, C3, E3, A2], d: 0.24, v: 0.11, type: "sine" },
    { seq: [A4, C5, E5, A5, G5, E5, D5, E5], d: 0.22, v: 0.075, type: "triangle", filter: 2400, harm: 0.18 },
    { seq: every(8, (index) => index % 4 === 0, "k"), d: 0, v: 0, type: "sine" },
    { seq: every(8, (index) => index % 2 === 1, "h"), d: 0, v: 0, type: "sine" },
  ]),
  cruise: arrange(108, [
    {
      seq: [A2, null, A2, C3, E2, null, A2, E2, G2, null, G2, B2, D3, null, G2, D3, F2, null, F2, A2, C3, null, F2, C3, E2, null, E2, G2, B2, null, E2, B2],
      d: 0.26, v: 0.11, type: "sine",
    },
    {
      seq: [E5, D5, C5, E5, D5, C5, A4, C5, B4, D5, G5, E5, D5, B4, G4, B4, C5, A4, F4, A4, C5, E5, D5, C5, B4, E5, D5, B4, C5, B4, A4, E4],
      d: 0.24, v: 0.072, type: "triangle", filter: 2400, harm: 0.16,
    },
    {
      seq: [[A3, C4, E4], null, null, null, null, null, null, null, [G3, B3, D4], null, null, null, null, null, null, null, [F3, A3, C4], null, null, null, null, null, null, null, [E3, G3, B3], null, null, null, null, null, null, null],
      d: 0.34, v: 0.032, type: "sine",
    },
    { seq: every(32, (index) => index % 4 === 0, "k"), d: 0, v: 0, type: "sine" },
    { seq: every(32, (index) => index % 2 === 1, "h"), d: 0, v: 0, type: "sine" },
  ]),
  hunt: arrange(132, [
    {
      seq: [A2, C3, E3, A2, C3, E3, A2, G2, G2, B2, D3, G2, B2, D3, G2, F2, F2, A2, C3, F2, A2, C3, F2, E2, E2, G2, B2, E2, G2, B2, E2, A2],
      d: 0.16, v: 0.12, type: "sine",
    },
    {
      seq: [E5, G5, E5, null, D5, E5, C5, D5, B4, D5, G5, D5, B4, null, G4, B4, A4, C5, F4, A4, C5, E5, C5, null, B4, E5, G5, E5, D5, B4, E5, null],
      d: 0.14, v: 0.078, type: "triangle", filter: 2600, harm: 0.14,
    },
    {
      seq: [[A3, E4], null, [C4, E4], null, [A3, E4], null, [C4, G4], null, [G3, D4], null, [B3, D4], null, [G3, D4], null, [B3, F4], null, [F3, C4], null, [A3, C4], null, [F3, C4], null, [A3, E4], null, [E3, B3], null, [G3, B3], null, [E3, B3], null, [G3, D4], null],
      d: 0.12, v: 0.03, type: "sine",
    },
    { seq: every(32, (index) => index % 2 === 0, "k"), d: 0, v: 0, type: "sine" },
    { seq: every(32, (index) => index % 2 === 1, "h"), d: 0, v: 0, type: "sine" },
  ]),
  power: arrange(112, [
    {
      seq: [C3, null, G2, null, C3, E3, G3, C3, F2, null, C3, null, F3, A3, C4, F3, G2, null, D3, null, G3, B3, D4, G2, C3, E3, G3, C4, E3, null, G2, C3],
      d: 0.2, v: 0.11, type: "sine",
    },
    {
      seq: [E5, G5, C6, G5, E5, D5, C5, D5, F5, A5, C6, A5, G5, F5, E5, C5, D5, G5, B5, G5, F5, E5, D5, B4, C5, E5, G5, E5, D5, C5, G4, C5],
      d: 0.18, v: 0.074, type: "triangle", filter: 2800, harm: 0.28,
    },
    {
      seq: [[C4, E4, G4], null, null, null, null, null, null, null, [F3, A3, C4], null, null, null, null, null, null, null, [G3, B3, D4], null, null, null, null, null, null, null, [C4, E4, G4], null, null, null, null, null, null, null],
      d: 0.28, v: 0.034, type: "sine", harm: 0.2,
    },
    { seq: every(32, (index) => index % 4 === 0 || index % 8 === 6, "k"), d: 0, v: 0, type: "sine" },
    { seq: every(32, (index) => index % 2 === 1, "h"), d: 0, v: 0, type: "sine" },
  ]),
};

function unlockAudio() {
  ensureAudio();
  if (audio.ctx.state === "suspended") audio.ctx.resume();
}

function makeReverb(ctx) {
  const seconds = 1.35;
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const taper = (1 - i / length) ** 2.4;
      data[i] = (Math.random() * 2 - 1) * taper;
    }
  }
  return impulse;
}

function ensureAudio() {
  if (audio.ctx) return;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.95;
  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverb(ctx);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 18;
  comp.ratio.value = 2.8;
  comp.attack.value = 0.008;
  comp.release.value = 0.22;
  master.connect(dry);
  master.connect(reverb);
  reverb.connect(wet);
  dry.connect(comp);
  wet.connect(comp);
  comp.connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = 0.0001;
  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  music.connect(master);
  sfx.connect(master);

  const noiseLen = Math.floor(ctx.sampleRate * 0.08);
  const noise = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

  audio.ctx = ctx;
  audio.master = master;
  audio.music = music;
  audio.sfx = sfx;
  audio.noise = noise;
}

function voice({ freq, dur = 0.2, type = "sine", vol = 0.05, dest, slide, delay = 0, attack = 0.014, filter, harm = 0, when }) {
  if (!audio.ctx || muted) return;
  const ctx = audio.ctx;
  const start = when ?? ctx.currentTime + delay;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), start + dur);

  if (filter) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(filter, start);
    lowpass.Q.value = 0.55;
    osc.connect(lowpass);
    lowpass.connect(gain);
  } else {
    osc.connect(gain);
  }

  if (harm > 0) {
    const overtone = ctx.createOscillator();
    const overGain = ctx.createGain();
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(freq * 2, start);
    overGain.gain.value = harm;
    overtone.connect(overGain);
    overGain.connect(gain);
    overtone.start(start);
    overtone.stop(start + dur + 0.03);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  gain.connect(dest || audio.sfx);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

function drumKick(when) {
  voice({ freq: 164, dur: 0.13, slide: 48, type: "sine", vol: 0.16, dest: audio.music, when, attack: 0.002 });
}

function noiseTick(when, vol) {
  if (!audio.ctx || muted) return;
  const src = audio.ctx.createBufferSource();
  src.buffer = audio.noise;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.music);
  src.start(when);
  src.stop(when + 0.05);
}

function stopPad() {
  if (!audio.ctx) {
    audio.pad = [];
    return;
  }
  const now = audio.ctx.currentTime;
  for (const node of audio.pad) {
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), now);
    node.gain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
    node.osc.stop(now + 0.22);
  }
  audio.pad = [];
}

function desiredMusic() {
  if (muted || !audio.ctx) return "off";
  if (state === "menu" || state === "over") return "menu";
  if (state === "pause-play" || state === "pause-ready") return "hold";
  if (state === "die") return "dead";
  if (state === "win") return "clear";
  if (state === "ready") return "ready";
  if (frightLeft > 0) return "power";
  if (phase === "chase") return "hunt";
  return "cruise";
}

function setMusicMode(mode) {
  if (audio.mode === mode) return;
  audio.mode = mode;
  audio.step = 0;
  audio.nextNote = audio.ctx.currentTime + 0.03;
  const now = audio.ctx.currentTime;
  const gain = audio.music.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.max(0.0001, gain.value), now);
  const quiet = mode === "off" || mode === "hold" || mode === "dead";
  gain.linearRampToValueAtTime(quiet ? 0.0001 : 0.95, now + 0.2);
  stopPad();
}

function tickMusic() {
  if (!audio.ctx) return;
  const mode = desiredMusic();
  if (mode !== audio.mode) setMusicMode(mode);
  const pattern = MUSIC[mode];
  if (!pattern) return;
  if (audio.nextNote < audio.ctx.currentTime - 0.05) audio.nextNote = audio.ctx.currentTime + 0.03;
  const tempo = pattern.bpm * (mode === "hunt" ? Math.min(1.12, 1 + (level - 1) * 0.025) : 1);
  const stepDur = 60 / tempo / 2;
  const horizon = audio.ctx.currentTime + 0.5;
  while (audio.nextNote < horizon) {
    const events = pattern.steps[audio.step % pattern.steps.length];
    if (events) {
      for (const event of events) {
        if (event.kick) drumKick(audio.nextNote);
        else if (event.hat) noiseTick(audio.nextNote, 0.02);
        else {
          voice({
            freq: event.f,
            dur: event.d,
            type: event.type,
            vol: event.v,
            filter: event.filter,
            harm: event.harm || 0,
            dest: audio.music,
            when: audio.nextNote,
            attack: 0.012,
          });
        }
      }
    }
    audio.step += 1;
    audio.nextNote += stepDur;
  }
}

function munch() {
  dotFlip ^= 1;
  voice({
    freq: dotFlip ? D5 : G4,
    dur: 0.09,
    type: "triangle",
    vol: 0.055,
    filter: 1500,
    attack: 0.004,
  });
}

function powerSting() {
  [C5, E5, G5, C6].forEach((freq, index) => {
    voice({ freq, dur: 0.42, type: "sine", vol: 0.06, harm: 0.3, delay: index * 0.045 });
  });
}

function deathSting() {
  [E5, C5, G4, E4, C4].forEach((freq, index) => {
    voice({ freq, dur: 0.34, slide: freq * 0.82, type: "sine", vol: 0.07, delay: index * 0.15, attack: 0.02 });
  });
}

function clearSting() {
  [C5, E5, G5, C6, E6].forEach((freq, index) => {
    voice({ freq, dur: 0.48, type: "sine", vol: 0.065, harm: 0.38, delay: index * 0.09 });
  });
}

function chompSting(chain) {
  const root = [C5, E5, G5, C6][Math.min(chain, 3)];
  voice({ freq: root, dur: 0.22, type: "sine", vol: 0.07, harm: 0.45, attack: 0.005 });
  voice({ freq: root * 1.5, dur: 0.28, type: "triangle", vol: 0.04, delay: 0.04 });
}

function fruitSting() {
  [349.23, A4, C5, E5, G5].forEach((freq, index) => {
    voice({ freq, dur: 0.5, type: "triangle", vol: 0.05, harm: 0.16, delay: index * 0.042 });
  });
}

function extraLifeSting() {
  [C5, E5, G5, C6].forEach((freq, index) => {
    voice({ freq, dur: 0.36, type: "sine", vol: 0.07, harm: 0.4, delay: index * 0.08 });
  });
}

function startSting() {
  [A4, C5, E5, A4 * 2].forEach((freq, index) => {
    voice({ freq, dur: 0.34, type: "sine", vol: 0.06, harm: 0.25, delay: index * 0.1 });
  });
}

function flushBest() {
  if (!bestDirty) return;
  bestDirty = false;
  saveSetting(BEST_KEY, String(best));
}

function setMuted(next) {
  muted = next;
  muteBtn.textContent = muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  saveSetting(MUTE_KEY, muted ? "1" : "0");
  if (!muted && audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
  tickMusic();
}

function resetGrid() {
  grid = MAZE_ROWS.map((row) => row.split(""));
  pelletsLeft = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === "." || grid[r][c] === "o") pelletsLeft++;
    }
  }
  pelletsEaten = 0;
  fruit = null;
  fruitSpawned = false;
}

function cellCenter(c, r) {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}

function placeActors() {
  const start = cellCenter(9, 22);
  player.x = start.x;
  player.y = start.y;
  player.dir = LEFT;
  player.nextDir = LEFT;
  player.acc = 0;
  player.moving = false;
  const outside = cellCenter(door.c, door.r - 1);
  ghosts.forEach((ghost, index) => {
    const spot = index === 0 ? outside : cellCenter(ghost.home.c, ghost.home.r);
    ghost.x = spot.x;
    ghost.y = spot.y;
    ghost.acc = 0;
    ghost.penTimer = 0;
    if (index === 0) {
      ghost.mode = phase;
      ghost.dir = LEFT;
    } else {
      ghost.mode = "house";
      ghost.dir = index % 2 === 0 ? RIGHT : LEFT;
    }
  });
}

function addScore(points) {
  score += points;
  if (!extraAwarded && score >= 10000) {
    extraAwarded = true;
    lives += 1;
    renderLives();
    extraLifeSting();
    setStatus("Extra life");
  }
  if (score > best) {
    best = score;
    bestDirty = true;
  }
  hud();
}

function atCenter(actor) {
  return mod(actor.x, TILE) === TILE / 2 && mod(actor.y, TILE) === TILE / 2;
}

function tileOf(actor) {
  return {
    c: mod(Math.round((actor.x - TILE / 2) / TILE), COLS),
    r: Math.round((actor.y - TILE / 2) / TILE),
  };
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function passable(c, r, actor) {
  if (r < 0 || r >= ROWS) return false;
  c = mod(c, COLS);
  const tile = grid[r][c];
  if (tile === "#" || tile === " " || tile == null) return false;
  if (tile === "-" || tile === "H") {
    if (!actor || actor.kind !== "ghost") return false;
    return actor.mode === "house" || actor.mode === "leave" || actor.mode === "eyes";
  }
  if (actor && actor.kind === "ghost" && actor.mode === "house") return false;
  return true;
}

function canStep(actor, dir) {
  const { c, r } = tileOf(actor);
  return passable(c + VX[dir], r + VY[dir], actor);
}

function levelTime() {
  return (performance.now() - levelMark) / 1000;
}

function canLeave(ghost) {
  return ghost.penTimer <= 0 && (pelletsEaten >= ghost.releaseDots || levelTime() >= ghost.releaseTime);
}

function speedOf(actor) {
  const mul = Math.min(1.35, 1 + (level - 1) * 0.05);
  if (actor.kind === "player") return 2.65 * mul;
  if (actor.mode === "eyes") return 3.7;
  if (actor.mode === "frightened") return 1.45;
  if (actor.mode === "house") return 1.25;
  return 2.25 * mul;
}

function pixelsUntilCenter(actor) {
  const half = TILE / 2;
  if (actor.dir === RIGHT || actor.dir === LEFT) {
    const mark = mod(Math.round(actor.x), TILE);
    if (actor.dir === RIGHT) return mark <= half ? half - mark || TILE : TILE - mark + half;
    return mark >= half ? mark - half || TILE : mark + half;
  }
  const mark = mod(Math.round(actor.y), TILE);
  if (actor.dir === DOWN) return mark <= half ? half - mark || TILE : TILE - mark + half;
  return mark >= half ? mark - half || TILE : mark + half;
}

function cornerNow(actor) {
  const dir = actor.nextDir;
  if (dir == null || dir === actor.dir) return;
  if (dir === OPP[actor.dir]) {
    actor.dir = dir;
    return;
  }
  const ahead = pixelsUntilCenter(actor);
  if (ahead === TILE || ahead > 10) return;
  const previousX = actor.x;
  const previousY = actor.y;
  actor.x += VX[actor.dir] * ahead;
  actor.y += VY[actor.dir] * ahead;
  if (actor.x < 0) actor.x += WIDTH;
  if (actor.x >= WIDTH) actor.x -= WIDTH;
  if (canStep(actor, dir)) actor.dir = dir;
  else {
    actor.x = previousX;
    actor.y = previousY;
  }
}

function nudge(actor) {
  if (actor.kind === "player") cornerNow(actor);
  if (atCenter(actor)) {
    onCenter(actor);
    if (!canStep(actor, actor.dir)) return false;
  }
  actor.x += VX[actor.dir];
  actor.y += VY[actor.dir];
  if (actor.x < 0) actor.x += WIDTH;
  if (actor.x >= WIDTH) actor.x -= WIDTH;
  return true;
}

function stepActor(actor, dt) {
  actor.acc += speedOf(actor) * Math.min(dt, 0.05) * 60;
  let moved = false;
  let guard = 0;
  while (actor.acc >= 1 && guard++ < 8) {
    if (!nudge(actor)) {
      actor.acc = 0;
      break;
    }
    actor.acc -= 1;
    moved = true;
  }
  return moved;
}

function onCenter(actor) {
  if (actor.kind === "player") {
    if (canStep(actor, actor.nextDir)) actor.dir = actor.nextDir;
    return;
  }
  steerGhost(actor);
}

function steerGhost(ghost) {
  const { c, r } = tileOf(ghost);
  if (ghost.mode === "house") {
    if (canLeave(ghost)) {
      if (c !== door.c) ghost.dir = c < door.c ? RIGHT : LEFT;
      else {
        ghost.mode = "leave";
        ghost.dir = UP;
      }
      return;
    }
    if (!canStep(ghost, ghost.dir)) ghost.dir = OPP[ghost.dir];
    return;
  }

  if (ghost.mode === "leave") {
    const tile = grid[r][c];
    if (tile !== "H" && tile !== "-" && r < door.r) ghost.mode = phase;
    else {
      if (c < door.c) ghost.dir = RIGHT;
      else if (c > door.c) ghost.dir = LEFT;
      else ghost.dir = UP;
      if (!canStep(ghost, ghost.dir)) ghost.dir = OPP[ghost.dir];
      return;
    }
  }

  if (ghost.mode === "eyes") {
    if (grid[r][c] === "H") {
      ghost.mode = "house";
      ghost.penTimer = 0.9;
      ghost.dir = LEFT;
      return;
    }
    if (c === door.c && (r === door.r || r === door.r - 1)) {
      ghost.dir = DOWN;
      return;
    }
  }

  const options = [];
  for (let dir = 0; dir < 4; dir++) {
    if (dir === OPP[ghost.dir]) continue;
    if (canStep(ghost, dir)) options.push(dir);
  }
  if (!options.length) {
    if (canStep(ghost, OPP[ghost.dir])) ghost.dir = OPP[ghost.dir];
    return;
  }
  if (ghost.mode === "frightened") {
    ghost.dir = options[Math.floor(Math.random() * options.length)];
    return;
  }

  const target = ghostTarget(ghost);
  let best = options[0];
  let bestDist = Infinity;
  for (const dir of options) {
    const nc = mod(c + VX[dir], COLS);
    const nr = r + VY[dir];
    const dist = (nc - target.c) ** 2 + (nr - target.r) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  ghost.dir = best;
}

function ghostTarget(ghost) {
  if (ghost.mode === "eyes") return { c: door.c, r: door.r - 1 };
  if (phase === "scatter" && ghost.mode !== "chase") return ghost.scatter;
  const here = tileOf(player);
  if (ghost.id === 0) return here;
  if (ghost.id === 1) {
    return { c: here.c + VX[player.dir] * 4, r: here.r + VY[player.dir] * 4 };
  }
  if (ghost.id === 2) {
    const ahead = { c: here.c + VX[player.dir] * 2, r: here.r + VY[player.dir] * 2 };
    const lead = tileOf(ghosts[0]);
    return { c: ahead.c * 2 - lead.c, r: ahead.r * 2 - lead.r };
  }
  const me = tileOf(ghost);
  const away = Math.hypot(here.c - me.c, here.r - me.r) > 8;
  return away ? here : ghost.scatter;
}

function queueDir(dir) {
  player.nextDir = dir;
  if (state !== "play") return;
  if (player.dir === OPP[dir]) {
    player.dir = dir;
    return;
  }
  cornerNow(player);
  if (atCenter(player) && canStep(player, dir)) player.dir = dir;
}

function pressDir(dir) {
  const index = heldDirs.indexOf(dir);
  if (index >= 0) heldDirs.splice(index, 1);
  heldDirs.push(dir);
  queueDir(dir);
}

function releaseDir(dir) {
  const index = heldDirs.indexOf(dir);
  if (index >= 0) heldDirs.splice(index, 1);
  if (heldDirs.length) queueDir(heldDirs[heldDirs.length - 1]);
}

function eatAt(actor) {
  const base = tileOf(actor);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = base.r + dr;
      const c = mod(base.c + dc, COLS);
      if (r < 0 || r >= ROWS) continue;
      const tile = grid[r][c];
      if (tile !== "." && tile !== "o") continue;
      const center = cellCenter(c, r);
      if (dist(actor.x, actor.y, center.x, center.y) > 10) continue;
      grid[r][c] = "+";
      pelletsLeft--;
      pelletsEaten++;
      if (tile === "o") {
        addScore(50);
        frighten();
        powerSting();
      } else {
        addScore(10);
        munch();
      }
      if (pelletsLeft <= 0) {
        state = "win";
        winLeft = 1.7;
        setStatus(`Level ${level} cleared`);
        clearSting();
        flushBest();
        return;
      }
    }
  }
}

function frighten() {
  frightLeft = Math.max(2.4, 6 - (level - 1) * 0.35);
  frightChain = 0;
  for (const ghost of ghosts) {
    if (ghost.mode === "chase" || ghost.mode === "scatter" || ghost.mode === "frightened") {
      ghost.mode = "frightened";
      ghost.dir = OPP[ghost.dir];
    } else if (ghost.mode === "leave") {
      const { c, r } = tileOf(ghost);
      const tile = grid[r][c];
      if (tile !== "H" && tile !== "-") {
        ghost.mode = "frightened";
        ghost.dir = OPP[ghost.dir];
      }
    }
  }
}

function isDangerous(ghost) {
  if (ghost.mode === "chase" || ghost.mode === "scatter") return true;
  if (ghost.mode !== "leave") return false;
  const { c, r } = tileOf(ghost);
  const tile = grid[r][c];
  return tile !== "H" && tile !== "-";
}

function catchGhosts() {
  const touching = ghosts.filter((ghost) => dist(player.x, player.y, ghost.x, ghost.y) <= TILE * 0.62);
  if (touching.some(isDangerous)) {
    state = "die";
    deathT = 0;
    deathSting();
    return;
  }
  for (const ghost of touching) {
    if (ghost.mode !== "frightened") continue;
    const points = 200 * 2 ** frightChain;
    frightChain++;
    addScore(points);
    ghost.mode = "eyes";
    floaters.push({ x: ghost.x, y: ghost.y, text: String(points), life: 1 });
    chompSting(frightChain - 1);
  }
}

function eatFruit() {
  if (!fruit) return;
  const center = cellCenter(fruit.c, fruit.r);
  if (dist(player.x, player.y, center.x, center.y) > 12) return;
  const points = [100, 300, 500, 700, 1000][Math.min(level - 1, 4)];
  addScore(points);
  floaters.push({ x: center.x, y: center.y, text: String(points), life: 1 });
  fruit = null;
  fruitSting();
}

function dist(ax, ay, bx, by) {
  let dx = ax - bx;
  if (dx > WIDTH / 2) dx -= WIDTH;
  if (dx < -WIDTH / 2) dx += WIDTH;
  return Math.hypot(dx, ay - by);
}

function advancePhase() {
  phaseIndex = Math.min(phaseIndex + 1, PHASES.length - 1);
  phase = PHASES[phaseIndex][0];
  phaseLeft = PHASES[phaseIndex][1];
  for (const ghost of ghosts) {
    if (ghost.mode === "chase" || ghost.mode === "scatter") {
      ghost.mode = phase;
      ghost.dir = OPP[ghost.dir];
    }
  }
}

function updatePlay(dt) {
  if (frightLeft > 0) {
    frightLeft -= dt;
    if (frightLeft <= 0) {
      frightLeft = 0;
      frightChain = 0;
      for (const ghost of ghosts) {
        if (ghost.mode === "frightened") ghost.mode = phase;
      }
    }
  } else {
    phaseLeft -= dt;
    if (phaseLeft <= 0) advancePhase();
  }

  for (const ghost of ghosts) {
    if (ghost.penTimer > 0) ghost.penTimer -= dt;
  }

  player.moving = stepActor(player, dt);
  if (state !== "play") return;
  eatAt(player);
  if (state !== "play") return;

  if (!fruitSpawned && pelletsEaten >= 70) {
    fruitSpawned = true;
    fruit = { c: 9, r: 20, t: 9 };
  }
  if (fruit) {
    fruit.t -= dt;
    if (fruit.t <= 0) fruit = null;
    else eatFruit();
  }

  for (const ghost of ghosts) stepActor(ghost, dt);
  if (state !== "play") return;
  catchGhosts();

  for (const floater of floaters) {
    floater.life -= dt;
    floater.y -= 18 * dt;
  }
  floaters = floaters.filter((floater) => floater.life > 0);
}

function finishDeath() {
  lives -= 1;
  renderLives();
  flushBest();
  if (lives <= 0) {
    state = "over";
    showOverlay("Game over", `You scored ${pad(score)}.`, "Play again");
    setStatus(`Game over. Score ${score}.`);
    return;
  }
  placeActors();
  frightLeft = 0;
  frightChain = 0;
  state = "ready";
  readyLeft = 1.6;
  setStatus("Ready");
}

function nextLevel() {
  level += 1;
  phase = "scatter";
  phaseIndex = 0;
  phaseLeft = PHASES[0][1];
  frightLeft = 0;
  frightChain = 0;
  resetGrid();
  placeActors();
  levelMark = performance.now();
  state = "ready";
  readyLeft = 1.7;
  hud();
  flushBest();
  setStatus(`Level ${level}`);
}

function update(dt) {
  if (state === "ready") {
    readyLeft -= dt;
    if (readyLeft <= 0) {
      state = "play";
      setStatus(`Level ${level}`);
    }
    return;
  }
  if (state === "die") {
    deathT += dt / 1.05;
    if (deathT >= 1) finishDeath();
    return;
  }
  if (state === "win") {
    winLeft -= dt;
    if (winLeft <= 0) nextLevel();
    return;
  }
  if (state === "play") updatePlay(dt);
  if (state === "menu") player.moving = true;
}

function isFloor(c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const tile = grid[r][c];
  return tile === "." || tile === "o" || tile === "+" || tile === "H" || tile === "-";
}

function neighborFloor(c, r) {
  if (r < 0 || r >= ROWS) return false;
  if (c < 0 || c >= COLS) return isFloor(mod(c, COLS), r);
  return isFloor(c, r);
}

function drawMaze() {
  const flash = state === "win" && !reduceMotion && Math.floor(anim * 8) % 2 === 0;
  ctx.fillStyle = flash ? "#7dd3fc" : "#1d4ed8";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const pad = 5;
  ctx.fillStyle = "#080d1a";
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isFloor(c, r)) continue;
      let x0 = c * TILE + pad;
      let y0 = r * TILE + pad;
      let x1 = (c + 1) * TILE - pad;
      let y1 = (r + 1) * TILE - pad;
      if (neighborFloor(c - 1, r)) x0 = c * TILE;
      if (neighborFloor(c + 1, r)) x1 = (c + 1) * TILE;
      if (neighborFloor(c, r - 1)) y0 = r * TILE;
      if (neighborFloor(c, r + 1)) y1 = (r + 1) * TILE;
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.fill();

  ctx.fillStyle = "#140e22";
  for (const home of homes) {
    ctx.fillRect(home.c * TILE + 2, home.r * TILE + 2, TILE - 4, TILE - 4);
  }

  ctx.fillStyle = "#fb7185";
  ctx.beginPath();
  addRoundRect(door.c * TILE + 3, door.r * TILE + TILE / 2 - 3, TILE - 6, 6, 3);
  ctx.fill();
}

function addRoundRect(x, y, w, h, radius) {
  const rad = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawPellets() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = grid[r][c];
      const center = cellCenter(c, r);
      if (tile === ".") {
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(center.x, center.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (tile === "o") {
        const pulse = reduceMotion ? 6 : 5.2 + Math.sin(anim * 6) * 1.3;
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(center.x, center.y, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawFruit() {
  if (!fruit) return;
  if (!reduceMotion && fruit.t < 2 && Math.floor(anim * 8) % 2 === 0) return;
  const { x, y } = cellCenter(fruit.c, fruit.r);
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.quadraticCurveTo(x + 7, y - 12, x + 2, y - 3);
  ctx.stroke();
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(x - 3.5, y + 1, 4.5, 0, Math.PI * 2);
  ctx.arc(x + 3.2, y + 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const mouth = playerMouth();
  const drawAt = (x, y) => {
    const radius = deathRadius();
    ctx.fillStyle = "#ffe14a";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, ANGLE[player.dir] + mouth, ANGLE[player.dir] + Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    if (state === "die") return;
    ctx.fillStyle = "#1c1910";
    ctx.beginPath();
    ctx.arc(x - VX[player.dir] * 2, y - radius * 0.42, 2.1, 0, Math.PI * 2);
    ctx.fill();
  };
  drawWrapped(player.x, player.y, drawAt);
}

function playerMouth() {
  if (state === "die") return 0.15 + Math.min(1, deathT) * 1.15;
  if (!player.moving || (state !== "play" && state !== "menu") || reduceMotion) return 0.22;
  return 0.08 + Math.abs(Math.sin(anim * 11)) * 0.4;
}

function deathRadius() {
  if (state !== "die") return TILE * 0.46;
  const shrink = Math.max(0, deathT - 0.62) / 0.38;
  return TILE * 0.46 * (1 - shrink);
}

function drawGhost(ghost) {
  if (state === "die") return;
  const drawAt = (x, y) => paintGhost(ghost, x, y);
  drawWrapped(ghost.x, ghost.y, drawAt);
}

function paintGhost(ghost, x, y) {
  const radius = TILE * 0.44;
  const bob = reduceMotion ? 0 : Math.sin(anim * 8 + ghost.id) * 1.2;
  const top = y - 1 + bob;
  if (ghost.mode === "eyes") {
    drawEyes(x, top, ghost.dir, "#111827");
    return;
  }
  let color = ghost.color;
  if (ghost.mode === "frightened") {
    const blink = frightLeft < 1.8 && !reduceMotion && Math.floor(frightLeft * 8) % 2 === 0;
    color = blink ? "#e2e8f0" : "#3b5bfd";
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, top, radius, Math.PI, 0);
  ctx.lineTo(x + radius, top + radius);
  const waves = 3;
  const span = (radius * 2) / waves;
  for (let i = 0; i < waves; i++) {
    const mid = x + radius - (i + 0.5) * span;
    const end = x + radius - (i + 1) * span;
    ctx.lineTo(mid, top + radius + (i % 2 === 0 ? 4 : 0));
    ctx.lineTo(end, top + radius);
  }
  ctx.closePath();
  ctx.fill();
  if (ghost.mode === "frightened") {
    const blink = frightLeft < 1.8 && !reduceMotion && Math.floor(frightLeft * 8) % 2 === 0;
    drawFrightFace(x, top, blink);
  } else {
    drawEyes(x, top, ghost.dir, "#111827");
  }
}

function drawEyes(x, y, dir, pupil) {
  const ox = VX[dir] * 2.4;
  const oy = VY[dir] * 2.4;
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.ellipse(x + side * 5, y - 2, 3.6, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(x + side * 5 + ox, y - 2 + oy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFrightFace(x, y, blink) {
  ctx.strokeStyle = blink ? "#1e3a8a" : "#e2e8f0";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x - 5, y - 1, 1.6, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 1, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 6);
  ctx.lineTo(x - 3, y + 3);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x + 3, y + 3);
  ctx.lineTo(x + 6, y + 6);
  ctx.stroke();
}

function drawWrapped(x, y, paint) {
  paint(x, y);
  if (x < TILE) paint(x + WIDTH, y);
  if (x > WIDTH - TILE) paint(x - WIDTH, y);
}

function drawFloaters() {
  ctx.textAlign = "center";
  ctx.font = "700 12px Avenir Next, Segoe UI, sans-serif";
  for (const floater of floaters) {
    ctx.globalAlpha = Math.max(0, floater.life);
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.globalAlpha = 1;
}

function banner(text) {
  ctx.save();
  ctx.font = "800 26px Avenir Next, Segoe UI, sans-serif";
  const width = Math.max(150, ctx.measureText(text).width + 42);
  const x = WIDTH / 2 - width / 2;
  const y = HEIGHT / 2 - 26;
  ctx.fillStyle = "rgba(6, 8, 20, 0.82)";
  ctx.beginPath();
  addRoundRect(x, y, width, 52, 12);
  ctx.fill();
  ctx.fillStyle = "#ffe566";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
  ctx.restore();
}

function draw() {
  drawMaze();
  drawPellets();
  drawFruit();
  for (const ghost of ghosts) drawGhost(ghost);
  if (deathRadius() > 0.5) drawPlayer();
  drawFloaters();
  if (state === "ready") banner("READY!");
  if (state === "win") banner("CLEARED");
}

function fit() {
  const maxW = Math.max(480, window.innerWidth - 28);
  const maxH = Math.max(560, window.innerHeight - 108);
  const scale = Math.min(maxW / WIDTH, maxH / HEIGHT);
  const cssW = Math.round(WIDTH * scale);
  const cssH = Math.round(HEIGHT * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
}

function startGame() {
  score = 0;
  lives = 3;
  level = 1;
  extraAwarded = false;
  phase = "scatter";
  phaseIndex = 0;
  phaseLeft = PHASES[0][1];
  frightLeft = 0;
  frightChain = 0;
  floaters = [];
  resetGrid();
  placeActors();
  levelMark = performance.now();
  state = "ready";
  readyLeft = 1.7;
  deathT = 0;
  hideOverlay();
  hud();
  renderLives();
  startSting();
  setStatus("Ready");
}

function togglePause() {
  if (state === "play" || state === "ready") {
    state = state === "play" ? "pause-play" : "pause-ready";
    showOverlay("Paused", "The maze is holding still.", "Resume");
    setStatus("Paused");
    flushBest();
    return;
  }
  if (state === "pause-play" || state === "pause-ready") resume();
}

function resume() {
  state = state === "pause-ready" ? "ready" : "play";
  hideOverlay();
  setStatus(state === "ready" ? "Ready" : `Level ${level}`);
}

function onKeyDown(event) {
  if (event.repeat && KEY_DIR[event.code] == null) return;
  if (KEY_DIR[event.code] != null) {
    event.preventDefault();
    unlockAudio();
    if (state === "menu" || state === "over") startGame();
    if (state === "pause-play" || state === "pause-ready") return;
    pressDir(KEY_DIR[event.code]);
    return;
  }
  if (event.code === "Enter" || event.code === "Space") {
    event.preventDefault();
    unlockAudio();
    if (state === "menu" || state === "over") startGame();
    else if (state === "pause-play" || state === "pause-ready") resume();
    else if (state === "ready") readyLeft = 0;
    return;
  }
  if (event.code === "KeyP" || event.code === "Escape") {
    event.preventDefault();
    if (state !== "menu" && state !== "over" && state !== "die" && state !== "win") togglePause();
    return;
  }
  if (event.code === "KeyM") setMuted(!muted);
}

function onKeyUp(event) {
  if (KEY_DIR[event.code] != null) releaseDir(KEY_DIR[event.code]);
}

function bindDpad() {
  for (const button of document.querySelectorAll("#dpad button")) {
    const dir = Number(button.dataset.dir);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      unlockAudio();
      if (state === "menu" || state === "over") startGame();
      pressDir(dir);
    });
    const release = () => releaseDir(dir);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }
}

let swipe = null;
canvas.addEventListener("pointerdown", (event) => {
  swipe = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (Math.hypot(dx, dy) < 24) return;
  unlockAudio();
  if (state === "menu" || state === "over") startGame();
  queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
});

playBtn.addEventListener("click", () => {
  unlockAudio();
  if (state === "pause-play" || state === "pause-ready") resume();
  else startGame();
});
muteBtn.addEventListener("click", () => {
  unlockAudio();
  setMuted(!muted);
});
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("resize", fit);
bindDpad();

best = Number(loadSetting(BEST_KEY, "0")) || 0;
setMuted(loadSetting(MUTE_KEY, "0") === "1");
resetGrid();
placeActors();
fit();
hud();
renderLives();
showOverlay("Muncher", "Eat every pellet. Energizers turn the ghosts around.", "Play");
setStatus("Muncher. Press Play.");

let last = performance.now();
let simLag = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (!state.startsWith("pause")) anim += dt;
  simLag += dt;
  let steps = 0;
  while (simLag >= 1 / 60 && steps < 3) {
    update(1 / 60);
    simLag -= 1 / 60;
    steps += 1;
  }
  if (steps === 3) simLag = 0;
  tickMusic();
  if (bestDirty && now - lastBestFlush > 2500) {
    lastBestFlush = now;
    flushBest();
  }
  draw();
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flushBest();
});
requestAnimationFrame(frame);
