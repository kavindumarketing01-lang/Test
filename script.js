class Agent {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
  }

  key() {
    return `${this.x},${this.y}`;
  }
}

class Predator extends Agent {
  constructor(id, x, y) {
    super(id, x, y);
    this.hunger = 0;
  }
}

class Prey extends Agent {}

class Grid {
  constructor(size) {
    this.size = size;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }
}

class Simulation {
  constructor() {
    this.GRID_SIZE = 50;
    this.INIT_PREDATORS = 3;
    this.INIT_PREY = 10;
    this.OBSTACLE_COUNT = 100;
    this.MIN_STARS = 5;
    this.STARVATION_TURNS = 20;

    this.grid = new Grid(this.GRID_SIZE);
    this.turn = 0;
    this.running = false;
    this.intervalMs = 300;
    this.timer = null;

    this.predators = [];
    this.preys = [];
    this.stars = new Set();
    this.obstacles = new Set();

    this.nextAgentId = 1;
    this.obstacleCountdown = this.randomObstacleInterval();

    this.dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    this.el = {
      grid: document.getElementById('grid'),
      startBtn: document.getElementById('startBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      resetBtn: document.getElementById('resetBtn'),
      speedSlider: document.getElementById('speedSlider'),
      speedValue: document.getElementById('speedValue'),
      turn: document.getElementById('turnCount'),
      predators: document.getElementById('predatorCount'),
      prey: document.getElementById('preyCount'),
      stars: document.getElementById('starCount'),
      obstacleCountdown: document.getElementById('obstacleCountdown'),
      status: document.getElementById('statusMessage')
    };

    this.buildGridUI();
    this.bindControls();
    this.reset();
  }

  bindControls() {
    this.el.startBtn.addEventListener('click', () => this.start());
    this.el.pauseBtn.addEventListener('click', () => this.pause());
    this.el.resetBtn.addEventListener('click', () => this.reset());
    this.el.speedSlider.addEventListener('input', (e) => {
      this.intervalMs = Number(e.target.value);
      this.el.speedValue.textContent = String(this.intervalMs);
      if (this.running) {
        this.pause();
        this.start();
      }
    });
  }

  buildGridUI() {
    this.cells = [];
    const frag = document.createDocumentFragment();
    for (let y = 0; y < this.GRID_SIZE; y += 1) {
      for (let x = 0; x < this.GRID_SIZE; x += 1) {
        const c = document.createElement('div');
        c.className = 'cell empty';
        this.cells.push(c);
        frag.appendChild(c);
      }
    }
    this.el.grid.innerHTML = '';
    this.el.grid.appendChild(frag);
  }

  index(x, y) {
    return y * this.GRID_SIZE + x;
  }

  randomObstacleInterval() {
    return 3 + Math.floor(Math.random() * 8);
  }

  key(x, y) {
    return `${x},${y}`;
  }

  parseKey(key) {
    return key.split(',').map(Number);
  }

  isOccupied(x, y) {
    const k = this.key(x, y);
    return this.obstacles.has(k) || this.stars.has(k) || this.predatorAt(x, y) || this.preyAt(x, y);
  }

  predatorAt(x, y) {
    return this.predators.find((p) => p.x === x && p.y === y) || null;
  }

  preyAt(x, y) {
    return this.preys.find((p) => p.x === x && p.y === y) || null;
  }

  randomEmptyCell() {
    for (let i = 0; i < 10000; i += 1) {
      const x = Math.floor(Math.random() * this.GRID_SIZE);
      const y = Math.floor(Math.random() * this.GRID_SIZE);
      if (!this.isOccupied(x, y)) return { x, y };
    }
    return null;
  }

  placeInitial() {
    for (let i = 0; i < this.OBSTACLE_COUNT; i += 1) {
      const pos = this.randomEmptyCell();
      if (pos) this.obstacles.add(this.key(pos.x, pos.y));
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

  start() {
    if (this.running) return;
    this.running = true;
    this.el.status.textContent = '';
    this.timer = setInterval(() => this.step(), this.intervalMs);
  }

  pause() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset() {
    this.pause();
    this.turn = 0;
    this.predators = [];
    this.preys = [];
    this.stars = new Set();
    this.obstacles = new Set();
    this.nextAgentId = 1;
    this.obstacleCountdown = this.randomObstacleInterval();
    this.placeInitial();
    this.render();
  }

  step() {
    if (!this.running) return;

    this.turn += 1;

    const ateIds = new Set();
    this.movePredators(ateIds);
    this.movePreys();

    for (const predator of this.predators) {
      if (!ateIds.has(predator.id)) predator.hunger += 1;
    }

    this.predators = this.predators.filter((p) => p.hunger < this.STARVATION_TURNS);

    this.ensureMinStars();

    this.obstacleCountdown -= 1;
    if (this.obstacleCountdown <= 0) {
      this.regenerateObstacles();
      this.obstacleCountdown = this.randomObstacleInterval();
    }

    const ended = this.checkEnd();
    this.render();

    if (ended) this.pause();
  }

  checkEnd() {
    if (this.preys.length === 0) {
      this.el.status.textContent = `Predators win on turn ${this.turn}!`;
      return true;
    }
    if (this.predators.length === 0) {
      this.el.status.textContent = `Prey win on turn ${this.turn}!`;
      return true;
    }
    return false;
  }

  availableMoves(agent, type) {
    const moves = [];
    for (const [dx, dy] of this.dirs) {
      const nx = agent.x + dx;
      const ny = agent.y + dy;
      if (!this.grid.inBounds(nx, ny)) continue;
      const k = this.key(nx, ny);
      if (this.obstacles.has(k)) continue;
      if (type === 'predator' && this.predatorAt(nx, ny)) continue;
      if (type === 'prey' && this.preyAt(nx, ny)) continue;
      moves.push({ x: nx, y: ny });
    }
    return moves;
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  nearestTarget(from, targets) {
    if (targets.length === 0) return null;
    let best = targets[0];
    let bestD = this.dist(from, best);
    for (let i = 1; i < targets.length; i += 1) {
      const d = this.dist(from, targets[i]);
      if (d < bestD) {
        bestD = d;
        best = targets[i];
      }
    }
    return best;
  }

  choosePredatorMove(predator) {
    const moves = this.availableMoves(predator, 'predator');
    if (moves.length === 0) return { x: predator.x, y: predator.y };
    const target = this.nearestTarget(predator, this.preys);
    if (!target) return moves[Math.floor(Math.random() * moves.length)];

    moves.sort((a, b) => this.dist(a, target) - this.dist(b, target));
    return moves[0];
  }

  predatorThreat(pos) {
    let min = Infinity;
    for (const p of this.predators) {
      const d = this.dist(pos, p);
      if (d < min) min = d;
    }
    return min;
  }

  choosePreyMove(prey) {
    const moves = this.availableMoves(prey, 'prey');
    if (moves.length === 0) return { x: prey.x, y: prey.y };
    const stars = [...this.stars].map((k) => {
      const [x, y] = this.parseKey(k);
      return { x, y };
    });
    const target = this.nearestTarget(prey, stars);

    const scored = moves.map((m) => {
      const towardFood = target ? -this.dist(m, target) : 0;
      const threat = this.predatorThreat(m);
      return { move: m, score: towardFood + threat * 1.5 };
    });

    scored.sort((a, b) => b.score - a.score);
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
    for (const predator of order) {
      const next = this.choosePredatorMove(predator);
      predator.x = next.x;
      predator.y = next.y;

      const victim = this.preyAt(predator.x, predator.y);
      if (victim) {
        this.preys = this.preys.filter((p) => p.id !== victim.id);
        const newborn = new Predator(this.nextAgentId++, victim.x, victim.y);
        this.predators.push(newborn);
        predator.hunger = 0;
        ateIds.add(predator.id);
      }
    }
  }

  movePreys() {
    const order = this.shuffled(this.preys);
    for (const prey of order) {
      const next = this.choosePreyMove(prey);
      prey.x = next.x;
      prey.y = next.y;

      const k = this.key(prey.x, prey.y);
      if (this.stars.has(k)) {
        this.stars.delete(k);
        const pos = this.randomEmptyCell();
        if (pos) this.preys.push(new Prey(this.nextAgentId++, pos.x, pos.y));
        const foodPos = this.randomEmptyCell();
        if (foodPos) this.stars.add(this.key(foodPos.x, foodPos.y));
      }
    }
  }

  ensureMinStars() {
    while (this.stars.size < this.MIN_STARS) {
      const pos = this.randomEmptyCell();
      if (!pos) break;
      this.stars.add(this.key(pos.x, pos.y));
    }
  }

  regenerateObstacles() {
    this.obstacles.clear();
    while (this.obstacles.size < this.OBSTACLE_COUNT) {
      const pos = this.randomEmptyCell();
      if (!pos) break;
      this.obstacles.add(this.key(pos.x, pos.y));
    }
  }

  render() {
    for (const cell of this.cells) {
      cell.className = 'cell empty';
      cell.textContent = '';
    }

    for (const key of this.obstacles) {
      const [x, y] = this.parseKey(key);
      const c = this.cells[this.index(x, y)];
      c.className = 'cell obstacle';
    }

    for (const key of this.stars) {
      const [x, y] = this.parseKey(key);
      const c = this.cells[this.index(x, y)];
      c.className = 'cell food';
      c.textContent = '★';
    }

    for (const prey of this.preys) {
      const c = this.cells[this.index(prey.x, prey.y)];
      c.className = 'cell prey';
      c.textContent = '●';
    }

    for (const predator of this.predators) {
      const c = this.cells[this.index(predator.x, predator.y)];
      c.className = 'cell predator';
      c.textContent = '●';
    }

    this.el.turn.textContent = String(this.turn);
    this.el.predators.textContent = String(this.predators.length);
    this.el.prey.textContent = String(this.preys.length);
    this.el.stars.textContent = String(this.stars.size);
    this.el.obstacleCountdown.textContent = String(this.obstacleCountdown);
  }
}

new Simulation();
