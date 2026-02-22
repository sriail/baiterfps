import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const PLAYER_MOVE_SPEED     = 5;
const PLAYER_RUN_SPEED      = 9;
const PLAYER_HEIGHT         = 1.7;   // eye height
const CAPSULE_HEIGHT        = 1.8;   // full capsule
const GRAVITY               = -20;
const JUMP_FORCE            = 8;
const BROADCAST_RATE        = 50;    // ms
const FOOTSTEP_WALK_INTERVAL = 0.5;  // seconds between walk steps
const FOOTSTEP_RUN_INTERVAL  = 0.25; // seconds between run steps
const FOOTSTEP_AUDIO_RANGE   = 20;   // max distance (m) to hear remote footsteps
const WALL_CHECK_HEIGHT_FOOT  = 0.3;  // ray height for foot-level wall detection
const WALL_CHECK_HEIGHT_CHEST = 1.0;  // ray height for chest-level wall detection
const WALL_CHECK_HEIGHT_HEAD  = 1.5;  // ray height for head-level wall detection

export class Game {
  constructor(lobbyData, playerName) {
    this.lobbyData   = lobbyData;
    this.playerName  = playerName;

    this.clock        = new THREE.Clock();
    this.keys         = {};
    this.yaw          = 0;
    this.pitch        = 0;
    this.velocity     = new THREE.Vector3();
    this.onGround     = false;
    this.collisionMeshes = [];

    this.animations   = {};   // local AnimationActions
    this.currentAnim  = null;
    this.localMixer   = null;

    this.remotePlayers = new Map(); // id → { model, mixer, animations, currentAnim, nameTag }
    this.lastUpdate    = 0;
    this.isPointerLocked = false;
    this.chatOpen      = false;

    this.playerObject  = null;
    this.cameraMount   = null;
    this.camera        = null;
    this.gunGroup      = null;
    this.scene         = null;
    this.renderer      = null;

    this.sharedCharacterModel = null;
    this.sharedAnimClips      = {};

    this._raycaster    = new THREE.Raycaster();
    this._animTime     = 0;

    this._pendingPlayers = []; // players that arrived before assets were ready

    this._footstepAudios = [];
    this._stepTimer      = 0;

    // Cached reusable objects – avoids per-frame heap allocations / GC pressure.
    // JavaScript is single-threaded so these are safe to reuse across calls.
    this._euler        = new THREE.Euler(0, 0, 0, 'YXZ');
    this._forward      = new THREE.Vector3();
    this._right        = new THREE.Vector3();
    this._moveDir      = new THREE.Vector3();
    this._wallCheckDir = new THREE.Vector3(); // unit direction vector for wall raycasts
    this._groundOrigin = new THREE.Vector3();
    this._wallOrigin   = new THREE.Vector3();
    this._normalMatrix = new THREE.Matrix3();
    this._worldNormal  = new THREE.Vector3();
    this._downVec      = new THREE.Vector3(0, -1, 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════

  async init(container) {
    this.setupRenderer(container);
    this.setupScene();
    this.setupCamera();
    this.setupLights();
    this.setupPointerLock();
    this.setupKeyboard();
    this.setupSocketListeners();
    this.setupChat();
    this._loadFootstepAudios();

    this.updateLoading('Loading character assets…', 10);
    await this.loadSharedAssets();

    this.updateLoading('Loading map…', 45);
    await this.loadMap(this.lobbyData.map);

    this.setupLocalPlayer();
    await this.createGun();
    this.addExistingPlayers(this.lobbyData.players || []);

    // Drain any players that joined during loading
    for (const pd of this._pendingPlayers) this.createRemotePlayer(pd);
    this._pendingPlayers = [];

    this.hideLoading();
    this.startAnimationLoop();
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDERER
  // ═══════════════════════════════════════════════════════════════

  setupRenderer(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // keep perf high
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCENE
  // ═══════════════════════════════════════════════════════════════

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0xb0c8e0, 0.012);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CAMERA + PLAYER OBJECT
  // ═══════════════════════════════════════════════════════════════

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    this.playerObject = new THREE.Object3D();
    this.playerObject.position.set(0, 30, 0);
    this.scene.add(this.playerObject);

    this.cameraMount = new THREE.Object3D();
    this.cameraMount.position.y = PLAYER_HEIGHT; // eye height
    this.playerObject.add(this.cameraMount);
    this.cameraMount.add(this.camera);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LIGHTS
  // ═══════════════════════════════════════════════════════════════

  setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    this.scene.add(sun);

    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x5a4a2a, 0.4));
  }

  // ═══════════════════════════════════════════════════════════════
  //  POINTER LOCK
  // ═══════════════════════════════════════════════════════════════

  setupPointerLock() {
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.chatOpen) {
        document.body.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === document.body;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.yaw   += e.movementX * -0.002;
      this.pitch += e.movementY * -0.002;
      this.pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  KEYBOARD
  // ═══════════════════════════════════════════════════════════════

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this.chatOpen) return; // let chat handle its own keys
      this.keys[e.code] = true;

      if (e.code === 'KeyT') {
        e.preventDefault();
        this.openChat();
      }
      if (e.code === 'Escape') {
        document.exitPointerLock();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SHARED ASSET LOADING (character + animations, loaded once)
  // ═══════════════════════════════════════════════════════════════

  async loadSharedAssets() {
    const fbxLoader = new FBXLoader();

    // ── Character model ──────────────────────────────────────────
    try {
      const model = await fbxLoader.loadAsync('/characters/terrorist-soldier.fbx');
      model.scale.setScalar(0.01); // ~1.75 m world height for a standard Mixamo FBX
      this.sharedCharacterModel = model;
    } catch (err) {
      console.warn('Could not load character model:', err.message);
      // Fallback: box placeholder
      const geo = new THREE.BoxGeometry(0.5, 1.8, 0.3);
      const mat = new THREE.MeshStandardMaterial({ color: 0x446688 });
      this.sharedCharacterModel = new THREE.Mesh(geo, mat);
    }

    // ── Animation clips ──────────────────────────────────────────
    const animDefs = [
      { name: 'idle',       url: '/characters/rifle aiming idle.fbx' },
      { name: 'walk',       url: '/characters/walking.fbx' },
      { name: 'walkBack',   url: '/characters/walking backwards.fbx' },
      { name: 'run',        url: '/characters/rifle run.fbx' },
      { name: 'strafeLeft', url: '/characters/strafe.fbx' },
      { name: 'strafeRight',url: '/characters/strafe (2).fbx' },
    ];

    const progressPerAnim = (45 - 10) / animDefs.length;
    let progressSoFar = 10;

    for (const def of animDefs) {
      try {
        const animFbx = await fbxLoader.loadAsync(def.url);
        const clip = animFbx.animations[0];
        if (clip) {
          clip.name = def.name;
          this.sharedAnimClips[def.name] = clip;
        }
      } catch (err) {
        console.warn(`Could not load animation "${def.name}":`, err.message);
      }
      progressSoFar += progressPerAnim;
      this.updateLoading(`Loading animation: ${def.name}…`, Math.round(progressSoFar));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAP LOADING
  // ═══════════════════════════════════════════════════════════════

  async loadMap(mapName) {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load(
        `/maps/${mapName}/scene.gltf`,
        (gltf) => {
          gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            node.matrixAutoUpdate = false;
            node.updateMatrix();
            node.frustumCulled = true;

            // Only use reasonably-sized meshes for collision
            const box = new THREE.Box3().setFromObject(node);
            const size = new THREE.Vector3();
            box.getSize(size);
            if (size.x > 0.3 || size.y > 0.3 || size.z > 0.3) {
              this.collisionMeshes.push(node);
            }
          });
          this.scene.add(gltf.scene);
          // Ensure world matrices are current for raycasting
          this.scene.updateMatrixWorld(true);
          this.updateLoading('Map loaded.', 90);
          resolve();
        },
        (xhr) => {
          if (xhr.total) {
            const pct = 45 + Math.round((xhr.loaded / xhr.total) * 40);
            this.updateLoading('Loading map…', Math.min(pct, 89));
          }
        },
        (err) => {
          console.warn('Map load error:', err);
          resolve(); // continue without map
        },
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOCAL PLAYER SETUP
  // ═══════════════════════════════════════════════════════════════

  setupLocalPlayer() {
    const model = SkeletonUtils.clone(this.sharedCharacterModel);
    model.visible = false; // first-person: hide own body
    model.position.set(0, -PLAYER_HEIGHT, 0); // feet relative to playerObject
    this.playerObject.add(model);

    this.localMixer = new THREE.AnimationMixer(model);

    for (const [name, clip] of Object.entries(this.sharedAnimClips)) {
      const action = this.localMixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.animations[name] = action;
    }

    this._playLocalAnimation('idle');
  }

  // ═══════════════════════════════════════════════════════════════
  //  FOOTSTEP AUDIO
  // ═══════════════════════════════════════════════════════════════

  _loadFootstepAudios() {
    for (let i = 1; i <= 4; i++) {
      const audio = new Audio(`/audio/footstep-${i}.mp3`);
      audio.volume = 0.4;
      this._footstepAudios.push(audio);
    }
  }

  _playRandomFootstep(volume = 0.4) {
    if (this._footstepAudios.length === 0) return;
    const idx = Math.floor(Math.random() * this._footstepAudios.length);
    const audio = this._footstepAudios[idx];
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════
  //  GUN (GLB ar-15 model)
  // ═══════════════════════════════════════════════════════════════

  async createGun() {
    this.gunGroup = new THREE.Group();
    this.cameraMount.add(this.gunGroup);

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('/guns/ar-15/ar-15.glb');
      const gunModel = gltf.scene;

      // Scale and position to match the original first-person gun placement
      gunModel.scale.setScalar(0.3);
      gunModel.position.set(0.22, -0.18, -0.4);
      gunModel.rotation.y = Math.PI;

      this.gunGroup.add(gunModel);
    } catch (err) {
      console.warn('Could not load gun GLB model:', err.message);
      // Fallback: procedural AR-15 geometry
      this._createProceduralGun();
    }
  }

  _createProceduralGun() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.3,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.6,
      roughness: 0.5,
    });

    const makeMesh = (geo, material = mat) => new THREE.Mesh(geo, material);

    const innerGroup = new THREE.Group();

    // Main receiver body
    const body = makeMesh(new THREE.BoxGeometry(0.05, 0.07, 0.38));
    innerGroup.add(body);

    // Barrel
    const barrel = makeMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.28);
    innerGroup.add(barrel);

    // Stock
    const stock = makeMesh(new THREE.BoxGeometry(0.04, 0.06, 0.18), darkMat);
    stock.position.set(0, -0.005, 0.22);
    innerGroup.add(stock);

    // Pistol grip
    const grip = makeMesh(new THREE.BoxGeometry(0.035, 0.09, 0.04), darkMat);
    grip.position.set(0, -0.065, 0.08);
    grip.rotation.x = 0.3;
    innerGroup.add(grip);

    // Magazine
    const mag = makeMesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), darkMat);
    mag.position.set(0, -0.085, -0.02);
    innerGroup.add(mag);

    // Top rail
    const rail = makeMesh(new THREE.BoxGeometry(0.022, 0.012, 0.3));
    rail.position.set(0, 0.041, -0.08);
    innerGroup.add(rail);

    innerGroup.position.set(0.22, -0.18, -0.4);
    innerGroup.rotation.y = Math.PI;

    this.gunGroup.add(innerGroup);
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXISTING PLAYERS
  // ═══════════════════════════════════════════════════════════════

  addExistingPlayers(players) {
    for (const p of players) this.createRemotePlayer(p);
  }

  // ═══════════════════════════════════════════════════════════════
  //  REMOTE PLAYER
  // ═══════════════════════════════════════════════════════════════

  createRemotePlayer(data) {
    const model = SkeletonUtils.clone(this.sharedCharacterModel);
    if (data.position) {
      model.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data.rotation !== undefined) {
      model.rotation.y = data.rotation;
    }

    const mixer = new THREE.AnimationMixer(model);
    const anims = {};

    for (const [name, clip] of Object.entries(this.sharedAnimClips)) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      anims[name] = action;
    }

    // Start idle
    if (anims.idle) anims.idle.play();

    // Nametag sprite – position is in model-local space (scale 0.01 → world units)
    // y = 200 → 200 * 0.01 = 2 m above feet
    const nameTag = this._createNametag(data.name || 'Player');
    nameTag.position.set(0, 200, 0);
    model.add(nameTag);

    this.scene.add(model);
    this.remotePlayers.set(data.id, {
      model,
      mixer,
      animations: anims,
      currentAnim: 'idle',
      nameTag,
      stepTimer: 0,
    });
  }

  _createNametag(name) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = '#44aaff';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const mat     = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite  = new THREE.Sprite(mat);
    // Model scale is 0.01, so world size = sprite.scale * 0.01
    // World size: ~1.5 m wide × 0.4 m tall → local 150 × 40
    sprite.scale.set(150, 40, 1);
    return sprite;
  }

  // ═══════════════════════════════════════════════════════════════
  //  SOCKET LISTENERS
  // ═══════════════════════════════════════════════════════════════

  setupSocketListeners() {
    const socket = window._gameSocket;
    if (!socket) return;

    socket.on('playerJoined', (data) => {
      if (this.sharedCharacterModel) {
        this.createRemotePlayer(data);
      } else {
        this._pendingPlayers.push(data);
      }
      this.showGameAlert(`${data.name} joined the game`);
      this._updatePlayerCountFromServer(null);
    });

    socket.on('playerLeft', (data) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) {
        this.scene.remove(rp.model);
        this.remotePlayers.delete(data.id);
      }
      this.showGameAlert(`${data.name} left the game`);
    });

    socket.on('playerMoved', (data) => {
      const rp = this.remotePlayers.get(data.id);
      if (!rp) return;
      if (data.position) {
        rp.model.position.set(data.position.x, data.position.y, data.position.z);
      }
      if (data.rotation !== undefined) {
        rp.model.rotation.y = data.rotation;
      }
    });

    socket.on('playerAnimation', (data) => {
      const rp = this.remotePlayers.get(data.id);
      if (!rp) return;
      this._crossfadeRemote(rp, data.animation);
    });

    socket.on('chat', ({ name, message }) => {
      this.addChatMessage({ type: 'chat', name, text: message });
    });

    socket.on('playerCount', ({ count, max }) => {
      document.getElementById('player-count').textContent = `Players: ${count}/${max}`;
    });
  }

  _updatePlayerCountFromServer(data) {
    // playerCount event from server handles this; nothing needed here
  }

  // ═══════════════════════════════════════════════════════════════
  //  REMOTE ANIMATION CROSSFADE
  // ═══════════════════════════════════════════════════════════════

  _crossfadeRemote(rp, newName) {
    if (rp.currentAnim === newName) return;
    const oldAction = rp.animations[rp.currentAnim];
    const newAction = rp.animations[newName];
    if (!newAction) return;

    newAction.reset().play();
    if (oldAction && oldAction !== newAction) {
      oldAction.crossFadeTo(newAction, 0.2, true);
    }
    rp.currentAnim = newName;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOCAL ANIMATION
  // ═══════════════════════════════════════════════════════════════

  _playLocalAnimation(name) {
    if (this.currentAnim === name) return;
    const oldAction = this.animations[this.currentAnim];
    const newAction = this.animations[name];
    if (!newAction) return;

    newAction.reset().play();
    if (oldAction && oldAction !== newAction) {
      oldAction.crossFadeTo(newAction, 0.2, true);
    }
    this.currentAnim = name;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CHAT
  // ═══════════════════════════════════════════════════════════════

  setupChat() {
    const sendBtn   = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');

    sendBtn.addEventListener('click', () => this.sendChat());

    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.sendChat();
      if (e.key === 'Escape') this.closeChat();
    });
  }

  openChat() {
    this.chatOpen = true;
    const area = document.getElementById('chat-input-area');
    area.classList.add('active');
    document.getElementById('chat-input').focus();
    document.exitPointerLock();
  }

  closeChat() {
    this.chatOpen = false;
    const area = document.getElementById('chat-input-area');
    area.classList.remove('active');
    document.getElementById('chat-input').blur();
    document.body.requestPointerLock();
  }

  sendChat() {
    const input = document.getElementById('chat-input');
    const msg   = input.value.trim();
    if (msg && window._gameSocket) {
      window._gameSocket.emit('chat', { message: msg });
    }
    input.value = '';
    this.closeChat();
  }

  addChatMessage({ type, name, text }) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'chat-msg' + (type === 'system' ? ' system' : '');

    if (type === 'system') {
      div.innerHTML = `<span class="sys">${this._escHtml(text)}</span>`;
    } else {
      div.innerHTML = `<span class="name">${this._escHtml(name)}: </span>${this._escHtml(text)}`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // Keep last 50 messages
    while (container.children.length > 50) {
      container.removeChild(container.firstChild);
    }
  }

  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════════════════════
  //  ALERTS
  // ═══════════════════════════════════════════════════════════════

  showGameAlert(text) {
    const container = document.getElementById('game-alerts');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'game-alert';
    div.textContent = text;
    container.appendChild(div);
    setTimeout(() => {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, 4000);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOADING UI
  // ═══════════════════════════════════════════════════════════════

  updateLoading(text, pct) {
    const textEl  = document.getElementById('loading-text');
    const pctEl   = document.getElementById('loading-progress');
    const fillEl  = document.getElementById('progress-fill');
    if (textEl)  textEl.textContent  = text;
    if (pctEl)   pctEl.textContent   = `${pct}%`;
    if (fillEl)  fillEl.style.width  = `${pct}%`;
  }

  hideLoading() {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN LOOP
  // ═══════════════════════════════════════════════════════════════

  startAnimationLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      const rawDelta = this.clock.getDelta();
      const delta    = Math.min(rawDelta, 0.05); // cap at 50 ms
      this.update(delta);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  // ═══════════════════════════════════════════════════════════════
  //  UPDATE
  // ═══════════════════════════════════════════════════════════════

  update(delta) {
    this._animTime += delta;

    // ── Apply yaw / pitch ──────────────────────────────────────
    this.playerObject.rotation.y = this.yaw;
    this.cameraMount.rotation.x  = this.pitch;

    // ── Movement (skip if chat open) ───────────────────────────
    if (!this.chatOpen) {
      this._updateMovement(delta);
    }

    // ── Gun sway ───────────────────────────────────────────────
    if (this.gunGroup) {
      this.gunGroup.rotation.z = Math.sin(this._animTime * 1.8) * 0.008;
      this.gunGroup.rotation.x = Math.sin(this._animTime * 1.2) * 0.005;
    }

    // ── Local animation mixer ──────────────────────────────────
    if (this.localMixer) this.localMixer.update(delta);

    // ── Remote player mixers + footstep audio ─────────────────
    for (const rp of this.remotePlayers.values()) {
      rp.mixer.update(delta);

      // Play footstep sounds for nearby walking remote players
      if (rp.currentAnim && rp.currentAnim !== 'idle') {
        const dist = rp.model.position.distanceTo(this.playerObject.position);
        if (dist < FOOTSTEP_AUDIO_RANGE) {
          const stepInterval = rp.currentAnim === 'run' ? FOOTSTEP_RUN_INTERVAL : FOOTSTEP_WALK_INTERVAL;
          rp.stepTimer += delta;
          if (rp.stepTimer >= stepInterval) {
            rp.stepTimer = 0;
            const volume = Math.max(0, 0.4 * (1 - dist / FOOTSTEP_AUDIO_RANGE));
            this._playRandomFootstep(volume);
          }
        } else {
          rp.stepTimer = 0;
        }
      } else {
        rp.stepTimer = 0;
      }
    }

    // ── Throttled network broadcast ────────────────────────────
    const now = performance.now();
    if (now - this.lastUpdate > BROADCAST_RATE && window._gameSocket) {
      const pos = this.playerObject.position;
      window._gameSocket.emit('playerMove', {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: this.yaw,
      });
      window._gameSocket.emit('playerAnimation', { animation: this.currentAnim || 'idle' });
      this.lastUpdate = now;
    }
  }

  _updateMovement(delta) {
    // Reuse cached objects to avoid per-frame heap allocations
    this._euler.set(0, this.yaw, 0, 'YXZ');
    this._forward.set(0, 0, -1).applyEuler(this._euler);
    this._right.set(1, 0, 0).applyEuler(this._euler);
    this._forward.y = 0; this._forward.normalize();
    this._right.y   = 0; this._right.normalize();

    const w = this.keys['KeyW'] || this.keys['ArrowUp'];
    const s = this.keys['KeyS'] || this.keys['ArrowDown'];
    const a = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const d = this.keys['KeyD'] || this.keys['ArrowRight'];
    const shift = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

    this._moveDir.set(0, 0, 0);
    if (w) this._moveDir.addScaledVector(this._forward, 1);
    if (s) this._moveDir.addScaledVector(this._forward, -1);
    if (a) this._moveDir.addScaledVector(this._right, -1);
    if (d) this._moveDir.addScaledVector(this._right, 1);

    const moving   = this._moveDir.lengthSq() > 0;
    const speed    = shift ? PLAYER_RUN_SPEED : PLAYER_MOVE_SPEED;
    const isBack   = s && !w;

    // ── Determine animation state ──────────────────────────────
    let animState = 'idle';
    if (moving) {
      if (shift && !isBack)       animState = 'run';
      else if (isBack)            animState = 'walkBack';
      else if (a && !w && !s)     animState = 'strafeLeft';
      else if (d && !w && !s)     animState = 'strafeRight';
      else                        animState = 'walk';
    }
    this._playLocalAnimation(animState);

    // ── Local footstep sounds ──────────────────────────────────
    if (animState !== 'idle') {
      const stepInterval = animState === 'run' ? FOOTSTEP_RUN_INTERVAL : FOOTSTEP_WALK_INTERVAL;
      this._stepTimer += delta;
      if (this._stepTimer >= stepInterval) {
        this._stepTimer = 0;
        this._playRandomFootstep(0.4);
      }
    } else {
      this._stepTimer = 0;
    }

    // ── Normalise diagonal movement ────────────────────────────
    if (moving) this._moveDir.normalize();

    // ── Gravity ────────────────────────────────────────────────
    this.velocity.y += GRAVITY * delta;

    // ── Ground check (long-range downward raycast) ────────────
    this._groundOrigin.copy(this.playerObject.position);
    this._groundOrigin.y += 0.2;
    this._raycaster.set(this._groundOrigin, this._downVec);
    this._raycaster.far = 300;

    let groundY = null;
    if (this.collisionMeshes.length > 0) {
      const hits = this._raycaster.intersectObjects(this.collisionMeshes, false);
      if (hits.length > 0) groundY = hits[0].point.y;
    }

    // Predict next vertical position
    const nextY = this.playerObject.position.y + this.velocity.y * delta;

    if (groundY !== null && this.velocity.y <= 0 && nextY <= groundY) {
      this.playerObject.position.y = groundY;
      this.onGround = true;
      this.velocity.y = 0;
    } else if (groundY !== null && this.playerObject.position.y <= groundY + 0.05 && this.velocity.y <= 0) {
      this.playerObject.position.y = groundY;
      this.onGround = true;
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // ── Jump ───────────────────────────────────────────────────
    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround   = false;
    }

    // ── Wall collision (horizontal) – check at three heights ──
    if (moving && this.collisionMeshes.length > 0) {
      this._wallCheckDir.copy(this._moveDir); // _moveDir is already normalised
      let bestHit = null;

      for (const h of [WALL_CHECK_HEIGHT_FOOT, WALL_CHECK_HEIGHT_CHEST, WALL_CHECK_HEIGHT_HEAD]) {
        this._wallOrigin.copy(this.playerObject.position);
        this._wallOrigin.y += h;
        this._raycaster.set(this._wallOrigin, this._wallCheckDir);
        this._raycaster.far = 0.5;
        const wallHits = this._raycaster.intersectObjects(this.collisionMeshes, false);
        if (wallHits.length > 0 && wallHits[0].face) {
          if (!bestHit || wallHits[0].distance < bestHit.distance) {
            bestHit = wallHits[0];
          }
        }
      }

      if (bestHit && bestHit.face) {
        this._normalMatrix.getNormalMatrix(bestHit.object.matrixWorld);
        this._worldNormal.copy(bestHit.face.normal).applyMatrix3(this._normalMatrix).normalize();
        this._worldNormal.y = 0;
        if (this._worldNormal.lengthSq() > 0.001) {
          this._worldNormal.normalize();
          const dot = this._moveDir.dot(this._worldNormal);
          if (dot < 0) this._moveDir.addScaledVector(this._worldNormal, -dot);
        }
      }
    }

    // ── Apply horizontal movement ──────────────────────────────
    this.playerObject.position.addScaledVector(this._moveDir, speed * delta);

    // ── Apply vertical velocity (only when not already grounded) ──
    if (!this.onGround) {
      this.playerObject.position.y += this.velocity.y * delta;
    }

    // ── Fall-through guard: reset to spawn ─────────────────────
    if (this.playerObject.position.y < -50) {
      this.playerObject.position.set(0, 30, 0);
      this.velocity.set(0, 0, 0);
    }
  }
}
