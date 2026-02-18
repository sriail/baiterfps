export class InputManager {
  constructor() {
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false
    };
    
    this.mouseDelta = { x: 0, y: 0 };
    this.shooting = false;
    this.reloading = false;
    this.showScoreboard = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Keyboard events
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      
      if (key === 'w') this.keys.w = true;
      if (key === 'a') this.keys.a = true;
      if (key === 's') this.keys.s = true;
      if (key === 'd') this.keys.d = true;
      if (key === ' ') this.keys.space = true;
      if (key === 'r') this.reloading = true;
      if (key === 'tab') {
        e.preventDefault();
        this.showScoreboard = true;
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) scoreboard.classList.add('show');
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      
      if (key === 'w') this.keys.w = false;
      if (key === 'a') this.keys.a = false;
      if (key === 's') this.keys.s = false;
      if (key === 'd') this.keys.d = false;
      if (key === ' ') this.keys.space = false;
      if (key === 'r') this.reloading = false;
      if (key === 'tab') {
        this.showScoreboard = false;
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) scoreboard.classList.remove('show');
      }
    });

    // Mouse events
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        this.shooting = true;
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.shooting = false;
      }
    });
  }

  getInputState() {
    return { ...this.keys };
  }

  getMouseDelta() {
    return { ...this.mouseDelta };
  }

  resetMouseDelta() {
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  isShooting() {
    return this.shooting;
  }

  isReloading() {
    const result = this.reloading;
    this.reloading = false; // Only send reload once
    return result;
  }

  isShowingScoreboard() {
    return this.showScoreboard;
  }
}
