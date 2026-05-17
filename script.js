class Agent {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
}
class Predator extends Agent {
  constructor(id, x, y, hunger = 0) {
    super(id, x, y);
    this.hunger = hunger;
  }
}
class Prey extends Agent {
  constructor(id, x, y, hunger = 0) {
    super(id, x, y);
    this.hunger = hunger;
  }
}
class Grid {
  constructor(size) { this.size = size; }
  inBounds(x, y) { return x >= 0 && x < this.size && y >= 0 && y < this.size; }
}

class Simulation {
  constructor() {
    this.GRID_SIZE = 100;
    this.INIT_PREDATORS = 20;
    this.INIT_PREY = 50;
    this.OBSTACLE_COUNT = 1000;
    this.MIN_STARS = 20;
    this.STARVATION_PREDATOR = 60;
    this.STARVATION_PREY = 200;

    this.grid = new Grid(this.GRID_SIZE);
    this.dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

    this.turn = 0;
    this.generation = 1;
    this.running = false;
    this.timer = null;
    this.intervalMs = 200;

    this.predators = [];
    this.preys = [];
    this.stars = new Set();
    this.obstacles = new Set();
    this.nextAgentId = 1;

    this.predatorMemory = { chaseWeight: 1 };
    this.preyMemory = { dangerWeight: 1.5 };

    this.obstacleCountdown = this.randomObstacleInterval();

    this.el = {
      grid: document.getElementById('grid'),
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
      status: document.getElementById('statusMessage')
    };

    this.buildGridUI();
    this.bindControls();
    this.reset(true);
  }

  bindControls() {
    this.el.startBtn.addEventListener('click', () => this.start());
    this.el.pauseBtn.addEventListener('click', () => this.pause());
    this.el.resetBtn.addEventListener('click', () => this.reset(true));
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
      const c = document.createElement('div');
      c.className = 'cell empty';
      this.cells.push(c);
      frag.appendChild(c);
    }
    this.el.grid.innerHTML = '';
    this.el.grid.appendChild(frag);
  }

  randomObstacleInterval() { return 3 + Math.floor(Math.random() * 8); }
  key(x, y) { return `${x},${y}`; }
  parseKey(key) { return key.split(',').map(Number); }
  index(x, y) { return y * this.GRID_SIZE + x; }

  predatorAt(x, y) { return this.predators.find((p) => p.x === x && p.y === y) || null; }
  preyAt(x, y) { return this.preys.find((p) => p.x === x && p.y === y) || null; }

  isOccupied(x, y) {
    const k = this.key(x, y);
    return this.obstacles.has(k) || this.stars.has(k) || this.predatorAt(x, y) || this.preyAt(x, y);
  }

  randomEmptyCell() {
    for (let i = 0; i < 30000; i += 1) {
      const x = Math.floor(Math.random() * this.GRID_SIZE);
      const y = Math.floor(Math.random() * this.GRID_SIZE);
      if (!this.isOccupied(x, y)) return { x, y };
    }
    return null;
  }

  placeInitial() {
    while (this.obstacles.size < this.OBSTACLE_COUNT) {
      const pos = this.randomEmptyCell();
      if (!pos) break;
      this.obstacles.add(this.key(pos.x, pos.y));
    }
    for (let i = 0; i < this.INIT_PREDATORS; i += 1) {
      const pos = this.randomEmptyCell();
      if (pos) this.predators.push(new Predator(this.nextAgentId++, pos.x, pos.y));
    }
    for (let i = 0; i < this.INIT_PREY; i += 1) {
      const pos = this.randomEmptyCell();
      if (pos) this.preys.push(new Prey(this.nextAgentId++, pos.x, pos.y));
    }
    this.ensureMinStars();
  }

  reset(fullReset = false) {
    this.pause();
    this.turn = 0;
    if (fullReset) {
      this.generation = 1;
      this.predatorMemory = { chaseWeight: 1 };
      this.preyMemory = { dangerWeight: 1.5 };
    }
    this.predators = [];
    this.preys = [];
    this.stars = new Set();
    this.obstacles = new Set();
    this.nextAgentId = 1;
    this.obstacleCountdown = this.randomObstacleInterval();
    this.placeInitial();
    this.el.status.textContent = '';
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.step(), this.intervalMs);
  }
  pause() { this.running = false; if (this.timer) clearInterval(this.timer); this.timer = null; }

  dist(a,b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  nearestTarget(from, targets) {
    let best = null; let bestD = Infinity;
    for (const t of targets) {
      const d = this.dist(from, t);
      if (d < bestD) { bestD = d; best = t; }
    }
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
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  movePredators(ateIds) {
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
        this.predators.push(new Predator(this.nextAgentId++, victim.x, victim.y));
        predator.hunger = 0;
        ateIds.add(predator.id);
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
        prey.hunger = 0;
        const pos = this.randomEmptyCell();
        if (pos) this.preys.push(new Prey(this.nextAgentId++, pos.x, pos.y));
        const foodPos = this.randomEmptyCell();
        if (foodPos) this.stars.add(this.key(foodPos.x, foodPos.y));
      }
    }
  }

  ensureMinStars() {
    while (this.stars.size < this.MIN_STARS) {
      const p = this.randomEmptyCell();
      if (!p) break;
      this.stars.add(this.key(p.x, p.y));
    }
  }

  respawnOneObstacle() {
    if (this.obstacles.size === 0) return;
    const all = [...this.obstacles];
    const removeKey = all[Math.floor(Math.random() * all.length)];
    this.obstacles.delete(removeKey);
    const p = this.randomEmptyCell();
    if (p) this.obstacles.add(this.key(p.x, p.y));
    else this.obstacles.add(removeKey);
  }

  endGeneration(winner) {
    this.el.status.textContent = `${winner} win generation ${this.generation} (turn ${this.turn}).`;
    this.learnFromGeneration(winner);
    if (this.el.autoGenToggle.checked) {
      this.generation += 1;
      this.turn = 0;
      this.predators = [];
      this.preys = [];
      this.stars = new Set();
      this.obstacles = new Set();
      this.nextAgentId = 1;
      this.obstacleCountdown = this.randomObstacleInterval();
      this.placeInitial();
      this.render();
      return;
    }
    this.pause();
  }

  learnFromGeneration(winner) {
    if (winner === 'Predators') this.predatorMemory.chaseWeight = Math.min(2.5, this.predatorMemory.chaseWeight + 0.05);
    else this.preyMemory.dangerWeight = Math.min(3, this.preyMemory.dangerWeight + 0.05);
  }

  step() {
    if (!this.running) return;
    this.turn += 1;

    const ateIds = new Set();
    this.movePredators(ateIds);
    this.movePreys();

    for (const predator of this.predators) if (!ateIds.has(predator.id)) predator.hunger += 1;
    for (const prey of this.preys) prey.hunger += 1;

    this.predators = this.predators.filter((p) => p.hunger < this.STARVATION_PREDATOR);
    this.preys = this.preys.filter((p) => p.hunger < this.STARVATION_PREY);

    this.ensureMinStars();

    this.obstacleCountdown -= 1;
    if (this.obstacleCountdown <= 0) {
      this.respawnOneObstacle();
      this.obstacleCountdown = this.randomObstacleInterval();
    }

    if (this.preys.length === 0) this.endGeneration('Predators');
    else if (this.predators.length === 0) this.endGeneration('Prey');

    this.render();
  }

  render() {
    for (const c of this.cells) { c.className = 'cell empty'; c.textContent = ''; }
    for (const k of this.obstacles) { const [x, y] = this.parseKey(k); this.cells[this.index(x, y)].className = 'cell obstacle'; }
    for (const k of this.stars) {
      const [x, y] = this.parseKey(k);
      const c = this.cells[this.index(x, y)];
      c.className = 'cell food'; c.textContent = '★';
    }
    for (const p of this.preys) {
      const c = this.cells[this.index(p.x, p.y)];
      c.className = 'cell prey'; c.textContent = '●';
    }
    for (const p of this.predators) {
      const c = this.cells[this.index(p.x, p.y)];
      c.className = 'cell predator'; c.textContent = '●';
    }

    this.el.generation.textContent = String(this.generation);
    this.el.turn.textContent = String(this.turn);
    this.el.predators.textContent = String(this.predators.length);
    this.el.prey.textContent = String(this.preys.length);
    this.el.stars.textContent = String(this.stars.size);
    this.el.obstacleCountdown.textContent = String(this.obstacleCountdown);
  }
}

new Simulation();
