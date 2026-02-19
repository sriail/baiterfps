import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { HUDManager } from './HUDManager.js';
import { MapLoader } from './MapLoader.js';
import { PlayerController } from './PlayerController.js';
import { RemotePlayer } from './RemotePlayer.js';
import { WeaponSystem } from './WeaponSystem.js';
import { ParticleSystem } from './ParticleSystem.js';

export class Game {
  constructor(canvas, socket) {
    this.canvas = canvas;
    this.socket = socket;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.playerController = null;
    this.remotePlayers = new Map();
    this.lobbyData = null;
    this.inputManager = null;
    this.hudManager = null;
    this.mapLoader = null;
    this.weaponSystem = null;
    this.particleSystem = null;
    this.isRunning = false;
    this.clock = new THREE.Clock();
    this.myPlayerId = null;
    this.myPlayerName = null;
    this.myTeam = null;
    this.gameMode = null;
    this.lastShootingState = false;
  }

  init(lobbyData) {
    this.lobbyData = lobbyData;
    this.myPlayerId = lobbyData.playerId;
    this.myPlayerName = lobbyData.playerName;
    this.myTeam = lobbyData.team;
    this.gameMode = lobbyData.mode;

    // Set up renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas,
      antialias: true 
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Set up scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 50, 200);
    this.scene.background = new THREE.Color(0x87CEEB);

    // Set up camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.y = 1.7; // Eye height

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    // Initialize systems
    this.inputManager = new InputManager();
    this.hudManager = new HUDManager(this);
    this.mapLoader = new MapLoader(this.scene);
    this.playerController = new PlayerController(this.camera, this.scene);
    this.weaponSystem = new WeaponSystem(this.scene, this.camera);
    this.particleSystem = new ParticleSystem(this.scene);

    // Load map (async)
    this.mapLoader.loadMap(lobbyData.map).catch(err => {
      console.error('Failed to load map, game may not work correctly:', err);
    });

    // Set up socket listeners
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    this.socket.on('lobby:stateChange', (data) => {
      console.log('Lobby state changed:', data.state);
      if (data.state === 'live') {
        this.hudManager.hideDeathScreen();
      }
    });

    this.socket.on('game:tick', (gameState) => {
      this.updateGameState(gameState);
    });

    this.socket.on('game:timer', (data) => {
      this.hudManager.updateTimer(data.time);
    });

    this.socket.on('player:hit', (data) => {
      this.hudManager.showHitMarker();
      // Play hit sound
    });

    this.socket.on('player:killed', (data) => {
      this.hudManager.addKillFeed(data.killerName, data.victimName);
      
      if (data.victimId === this.myPlayerId) {
        this.hudManager.showDeathScreen(data.killerName);
      }
    });

    this.socket.on('game:ended', (scoreboard) => {
      this.hudManager.showEndScreen(scoreboard);
      this.isRunning = false;
      document.exitPointerLock();
    });

    this.socket.on('player:joined', (data) => {
      console.log('Player joined:', data.name);
    });

    this.socket.on('player:left', (data) => {
      this.removeRemotePlayer(data.id);
    });
  }

  updateGameState(gameState) {
    // Update remote players
    for (const playerData of gameState.players) {
      if (playerData.id === this.myPlayerId) {
        // Update local player data
        this.hudManager.updateHealth(playerData.health);
        this.hudManager.updateAmmo(playerData.ammo, playerData.reserveAmmo);
        
        if (playerData.isReloading) {
          this.hudManager.showReloadBar();
        } else {
          this.hudManager.hideReloadBar();
        }
      } else {
        // Update or create remote player
        if (!this.remotePlayers.has(playerData.id)) {
          const remotePlayer = new RemotePlayer(playerData, this.scene, this.gameMode);
          this.remotePlayers.set(playerData.id, remotePlayer);
        } else {
          this.remotePlayers.get(playerData.id).update(playerData);
        }
      }
    }

    // Remove disconnected players
    const currentPlayerIds = new Set(gameState.players.map(p => p.id));
    for (const [id, player] of this.remotePlayers) {
      if (!currentPlayerIds.has(id)) {
        player.dispose();
        this.remotePlayers.delete(id);
      }
    }

    // Update team scores if in teams mode
    if (this.gameMode === 'teams') {
      const alphaKills = gameState.players.filter(p => p.team === 'alpha').reduce((sum, p) => sum + p.kills, 0);
      const omegaKills = gameState.players.filter(p => p.team === 'omega').reduce((sum, p) => sum + p.kills, 0);
      this.hudManager.updateTeamScores(alphaKills, omegaKills);
    }
  }

  removeRemotePlayer(playerId) {
    const player = this.remotePlayers.get(playerId);
    if (player) {
      player.dispose();
      this.remotePlayers.delete(playerId);
    }
  }

  start() {
    this.isRunning = true;
    
    // Request pointer lock
    this.canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) {
        this.canvas.requestPointerLock();
      }
    });

    // Start game loop
    this.animate();
  }

  animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    // Update remote player animations
    for (const [id, player] of this.remotePlayers) {
      if (player.mixer) {
        player.mixer.update(deltaTime);
      }
    }

    // Update systems
    if (document.pointerLockElement === this.canvas) {
      this.playerController.update(deltaTime);
      this.weaponSystem.update(deltaTime);
      this.particleSystem.update(deltaTime);
      
      // Send input to server
      const input = this.inputManager.getInputState();
      const mouseDelta = this.inputManager.getMouseDelta();
      const shooting = this.inputManager.isShooting();
      
      // Trigger weapon visual effects when shooting starts
      if (shooting && !this.lastShootingState) {
        this.weaponSystem.shoot();
        // Create shell casing
        const casingPos = this.camera.position.clone();
        casingPos.add(new THREE.Vector3(0.3, -0.1, -0.3));
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.particleSystem.createShellCasing(casingPos, direction);
      }
      this.lastShootingState = shooting;
      
      this.socket.emit('player:input', {
        keys: input,
        mouseDelta: mouseDelta,
        shooting: shooting,
        reloading: this.inputManager.isReloading()
      });
      
      this.inputManager.resetMouseDelta();
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
