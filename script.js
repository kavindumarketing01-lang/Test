class Agent { constructor(id, x, y) { this.id = id; this.x = x; this.y = y; } }
class Predator extends Agent { constructor(id, x, y, deathCounter = 0) { super(id, x, y); this.deathCounter = deathCounter; } }
class Prey extends Agent { constructor(id, x, y, deathCounter = 0) { super(id, x, y); this.deathCounter = deathCounter; } }
class Grid { constructor(size) { this.size = size; } inBounds(x, y) { return x >= 0 && x < this.size && y >= 0 && y < this.size; } }

class Simulation {
  constructor() {
    this.GRID_SIZE = 100;
    this.OBSTACLE_COUNT = 1000;

    this.grid = new Grid(this.GRID_SIZE);
    this.dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

    this.turn = 0;
    this.generation = 1;
    this.running = false;
    this.timer = null;
    this.intervalMs = 100;

    this.predators = []; this.preys = []; this.stars = new Set(); this.obstacles = new Set();
    this.nextAgentId = 1;

    this.predatorMemory = { chaseWeight: 1 };
    this.preyMemory = { dangerWeight: 1.5 };

    this.currentGenHistory = { turns: [], predatorCounts: [], preyCounts: [] };
    this.previousGenHistory = null;

    this.el = {
      grid: document.getElementById('grid'),
      predatorInput: document.getElementById('predatorInput'),
      preyInput: document.getElementById('preyInput'),
      resourceInput: document.getElementById('resourceInput'),
      redDeathInput: document.getElementById('redDeathInput'),
      blueDeathInput: document.getElementById('blueDeathInput'),
      startBtn: document.getElementById('startBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      resetBtn: document.getElementById('resetBtn'),
      autoGenToggle: document.getElementById('autoGenToggle'),
      speedSlider: document.getElementById('speedSlider'),
      speedValue: document.getElementById('speedValue'),
      generation: document.getElementById('generationCount'),
      turn: document.getElementById('turnCount'),
      predators: document.getElementById('predatorCount'),
      prey: document.getElementById('preyCount'),
      stars: document.getElementById('starCount'),
      obstacleCountdown: document.getElementById('obstacleCountdown'),
      status: document.getElementById('statusMessage'),
      chart: document.getElementById('statsChart')
    };

    this.chartCtx = this.el.chart.getContext('2d');

    this.buildGridUI();
    this.bindControls();
    this.applyConfigFromInputs();
    this.reset(true);
  }

  applyConfigFromInputs() {
    this.INIT_PREDATORS = Math.max(1, Number(this.el.predatorInput.value) || 20);
    this.INIT_PREY = Math.max(1, Number(this.el.preyInput.value) || 50);
    this.MIN_STARS = Math.max(1, Number(this.el.resourceInput.value) || 20);
    this.STARVATION_PREDATOR = Math.max(1, Number(this.el.redDeathInput.value) || 60);
    this.STARVATION_PREY = Math.max(1, Number(this.el.blueDeathInput.value) || 200);
  }

  bindControls() {
    this.el.startBtn.addEventListener('click', () => this.start());
    this.el.pauseBtn.addEventListener('click', () => this.pause());
    this.el.resetBtn.addEventListener('click', () => this.reset(true));
    [this.el.predatorInput, this.el.preyInput, this.el.resourceInput, this.el.redDeathInput, this.el.blueDeathInput].forEach((input) => {
      input.addEventListener('change', () => { this.applyConfigFromInputs(); if (!this.running) this.reset(true); });
    });
    this.el.speedSlider.addEventListener('input', (e) => {
      this.intervalMs = Number(e.target.value);
      this.el.speedValue.textContent = String(this.intervalMs);
      if (this.running) { this.pause(); this.start(); }
    });
  }

  buildGridUI() {
    this.cells = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.GRID_SIZE * this.GRID_SIZE; i += 1) {
      const c = document.createElement('div'); c.className = 'cell empty'; this.cells.push(c); frag.appendChild(c);
    }
    this.el.grid.innerHTML = ''; this.el.grid.appendChild(frag);
  }

  randomObstacleInterval() { return 3 + Math.floor(Math.random() * 8); }
  key(x, y) { return `${x},${y}`; }
  parseKey(k) { return k.split(',').map(Number); }
  index(x, y) { return y * this.GRID_SIZE + x; }
  predatorAt(x, y) { return this.predators.find((p) => p.x === x && p.y === y) || null; }
  preyAt(x, y) { return this.preys.find((p) => p.x === x && p.y === y) || null; }

  isOccupied(x, y) {
    const k = this.key(x, y);
    return this.obstacles.has(k) || this.stars.has(k) || this.predatorAt(x, y) || this.preyAt(x, y);
  }

  randomEmptyCell() {
    for (let i = 0; i < 35000; i += 1) {
      const x = Math.floor(Math.random() * this.GRID_SIZE); const y = Math.floor(Math.random() * this.GRID_SIZE);
      if (!this.isOccupied(x, y)) return { x, y };
    }
    return null;
  }

  placeInitial() {
    while (this.obstacles.size < this.OBSTACLE_COUNT) {
      const pos = this.randomEmptyCell(); if (!pos) break; this.obstacles.add(this.key(pos.x, pos.y));
    }
    for (let i = 0; i < this.INIT_PREDATORS; i += 1) {
      const pos = this.randomEmptyCell(); if (pos) this.predators.push(new Predator(this.nextAgentId++, pos.x, pos.y, 0));
    }
    for (let i = 0; i < this.INIT_PREY; i += 1) {
      const pos = this.randomEmptyCell(); if (pos) this.preys.push(new Prey(this.nextAgentId++, pos.x, pos.y, 0));
    }
    this.ensureMinStars();
    this.obstacleCountdown = this.randomObstacleInterval();
  }

  reset(fullReset = false) {
    this.pause(); this.applyConfigFromInputs(); this.turn = 0;
    if (fullReset) {
      this.generation = 1;
      this.predatorMemory = { chaseWeight: 1 };
      this.preyMemory = { dangerWeight: 1.5 };
      this.previousGenHistory = null;
    }
    this.currentGenHistory = { turns: [], predatorCounts: [], preyCounts: [] };
    this.predators = []; this.preys = []; this.stars = new Set(); this.obstacles = new Set(); this.nextAgentId = 1;
    this.placeInitial(); this.el.status.textContent = ''; this.recordHistory(); this.render();
  }

  start() { if (this.running) return; this.running = true; this.timer = setInterval(() => this.step(), this.intervalMs); }
  pause() { this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null; }

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  nearestTarget(from, targets) {
    let best = null; let bestD = Infinity;
    for (const t of targets) { const d = this.dist(from, t); if (d < bestD) { bestD = d; best = t; } }
    return best;
  }

  availableMoves(agent, type) {
    const moves = [];
    for (const [dx, dy] of this.dirs) {
      const nx = agent.x + dx; const ny = agent.y + dy;
      if (!this.grid.inBounds(nx, ny)) continue;
      const k = this.key(nx, ny);
      if (this.obstacles.has(k)) continue;
      if (type === 'predator' && this.predatorAt(nx, ny)) continue;
      if (type === 'prey' && this.preyAt(nx, ny)) continue;
      moves.push({ x: nx, y: ny });
    }
    return moves;
  }

  choosePredatorMove(predator) {
    const moves = this.availableMoves(predator, 'predator');
    if (!moves.length) return { x: predator.x, y: predator.y };
    const target = this.nearestTarget(predator, this.preys);
    if (!target) return moves[Math.floor(Math.random() * moves.length)];
    moves.sort((a, b) => this.dist(a, target) - this.dist(b, target));
    return moves[0];
  }

  predatorThreat(pos) {
    let min = Infinity;
    for (const p of this.predators) min = Math.min(min, this.dist(pos, p));
    return min;
  }

  choosePreyMove(prey) {
    const moves = this.availableMoves(prey, 'prey');
    if (!moves.length) return { x: prey.x, y: prey.y };
    const stars = [...this.stars].map((k) => { const [x, y] = this.parseKey(k); return { x, y }; });
    const target = this.nearestTarget(prey, stars);
    const scored = moves.map((m) => {
      const foodScore = target ? -this.dist(m, target) * this.predatorMemory.chaseWeight : 0;
      const threatScore = this.predatorThreat(m) * this.preyMemory.dangerWeight;
      return { move: m, score: foodScore + threatScore };
    }).sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  movePredators() {
    const order = this.shuffled(this.predators);
    const reserved = new Set(order.map((p) => this.key(p.x, p.y)));
    for (const predator of order) {
      reserved.delete(this.key(predator.x, predator.y));
      const next = this.choosePredatorMove(predator);
      const nk = this.key(next.x, next.y);
      if (!reserved.has(nk)) { predator.x = next.x; predator.y = next.y; }
      reserved.add(this.key(predator.x, predator.y));

      const victim = this.preyAt(predator.x, predator.y);
      if (victim) {
        this.preys = this.preys.filter((p) => p.id !== victim.id);
        predator.deathCounter = 0;
        if (predator.deathCounter <= Math.floor(this.STARVATION_PREDATOR / 2)) {
          this.predators.push(new Predator(this.nextAgentId++, predator.x, predator.y, predator.deathCounter));
        }
      }
    }
  }

  movePreys() {
    const order = this.shuffled(this.preys);
    const reserved = new Set(order.map((p) => this.key(p.x, p.y)));
    for (const prey of order) {
      reserved.delete(this.key(prey.x, prey.y));
      const next = this.choosePreyMove(prey);
      const nk = this.key(next.x, next.y);
      if (!reserved.has(nk)) { prey.x = next.x; prey.y = next.y; }
      reserved.add(this.key(prey.x, prey.y));

      const k = this.key(prey.x, prey.y);
      if (this.stars.has(k)) {
        this.stars.delete(k);
        prey.deathCounter = 0;
        if (prey.deathCounter <= Math.floor(this.STARVATION_PREY / 2)) {
          const pos = this.randomEmptyCell();
          if (pos) this.preys.push(new Prey(this.nextAgentId++, pos.x, pos.y, prey.deathCounter));
        }
        const foodPos = this.randomEmptyCell();
        if (foodPos) this.stars.add(this.key(foodPos.x, foodPos.y));
      }
    }
  }

  ensureMinStars() {
    while (this.stars.size < this.MIN_STARS) {
      const p = this.randomEmptyCell(); if (!p) break; this.stars.add(this.key(p.x, p.y));
    }
  }

  respawnOneObstacle() {
    if (!this.obstacles.size) return;
    const all = [...this.obstacles]; const removeKey = all[Math.floor(Math.random() * all.length)];
    this.obstacles.delete(removeKey);
    const p = this.randomEmptyCell(); if (p) this.obstacles.add(this.key(p.x, p.y)); else this.obstacles.add(removeKey);
  }

  learnFromGeneration(winner) {
    if (winner === 'Predators') this.predatorMemory.chaseWeight = Math.min(2.5, this.predatorMemory.chaseWeight + 0.05);
    else this.preyMemory.dangerWeight = Math.min(3, this.preyMemory.dangerWeight + 0.05);
  }

  beginNextGeneration() {
    this.previousGenHistory = { ...this.currentGenHistory };
    this.currentGenHistory = { turns: [], predatorCounts: [], preyCounts: [] };
    this.generation += 1;
    this.turn = 0;
    this.predators = []; this.preys = []; this.stars = new Set(); this.obstacles = new Set(); this.nextAgentId = 1;
    this.placeInitial();
    this.recordHistory();
  }

  endGeneration(winner) {
    this.el.status.textContent = `${winner} win generation ${this.generation} (turn ${this.turn}).`;
    this.learnFromGeneration(winner);
    if (this.el.autoGenToggle.checked) {
      this.beginNextGeneration();
      return;
    }
    this.pause();
  }

  recordHistory() {
    this.currentGenHistory.turns.push(this.turn);
    this.currentGenHistory.predatorCounts.push(this.predators.length);
    this.currentGenHistory.preyCounts.push(this.preys.length);
  }

  drawChart() {
    const ctx = this.chartCtx;
    const w = this.el.chart.width; const h = this.el.chart.height;
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 45, r: 15, t: 15, b: 30 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    const allY = [...this.currentGenHistory.predatorCounts, ...this.currentGenHistory.preyCounts];
    if (this.previousGenHistory) allY.push(...this.previousGenHistory.predatorCounts, ...this.previousGenHistory.preyCounts);
    const maxY = Math.max(1, ...allY);
    const maxX = Math.max(1, this.currentGenHistory.turns[this.currentGenHistory.turns.length - 1] || 1,
      this.previousGenHistory?.turns[this.previousGenHistory.turns.length - 1] || 1);

    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = '12px Arial'; ctx.fillText('Turn', w / 2 - 12, h - 8); ctx.fillText('Count', 5, 12);

    const drawSeries = (turns, counts, color) => {
      if (!turns || turns.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < turns.length; i += 1) {
        const x = pad.l + (turns[i] / maxX) * plotW;
        const y = (h - pad.b) - (counts[i] / maxY) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawSeries(this.currentGenHistory.turns, this.currentGenHistory.predatorCounts, 'rgba(210,20,20,0.95)');
    drawSeries(this.currentGenHistory.turns, this.currentGenHistory.preyCounts, 'rgba(20,80,230,0.95)');

    if (this.generation !== 1 && this.previousGenHistory) {
      drawSeries(this.previousGenHistory.turns, this.previousGenHistory.predatorCounts, 'rgba(210,20,20,0.35)');
      drawSeries(this.previousGenHistory.turns, this.previousGenHistory.preyCounts, 'rgba(20,80,230,0.35)');
    }
  }

  step() {
    if (!this.running) return;
    this.turn += 1;

    this.movePredators();
    this.movePreys();

    for (const predator of this.predators) predator.deathCounter += 1;
    for (const prey of this.preys) prey.deathCounter += 1;

    this.predators = this.predators.filter((p) => p.deathCounter < this.STARVATION_PREDATOR);
    this.preys = this.preys.filter((p) => p.deathCounter < this.STARVATION_PREY);

    this.ensureMinStars();

    this.obstacleCountdown -= 1;
    if (this.obstacleCountdown <= 0) { this.respawnOneObstacle(); this.obstacleCountdown = this.randomObstacleInterval(); }

    if (this.preys.length === 0) this.endGeneration('Predators');
    else if (this.predators.length === 0) this.endGeneration('Prey');

    this.recordHistory();
    this.render();
  }

  render() {
    for (const c of this.cells) { c.className = 'cell empty'; c.textContent = ''; }
    for (const k of this.obstacles) { const [x, y] = this.parseKey(k); this.cells[this.index(x, y)].className = 'cell obstacle'; }
    for (const k of this.stars) { const [x, y] = this.parseKey(k); const c = this.cells[this.index(x, y)]; c.className = 'cell food'; c.textContent = '★'; }
    for (const p of this.preys) { const c = this.cells[this.index(p.x, p.y)]; c.className = 'cell prey'; c.textContent = '●'; }
    for (const p of this.predators) { const c = this.cells[this.index(p.x, p.y)]; c.className = 'cell predator'; c.textContent = '●'; }

    this.el.generation.textContent = String(this.generation);
    this.el.turn.textContent = String(this.turn);
    this.el.predators.textContent = String(this.predators.length);
    this.el.prey.textContent = String(this.preys.length);
    this.el.stars.textContent = String(this.stars.size);
    this.el.obstacleCountdown.textContent = String(this.obstacleCountdown);
    this.drawChart();
  }
}

new Simulation();
