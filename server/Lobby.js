export class Lobby {
  constructor(id, io) {
    this.id = id;
    this.io = io;
    this.mode = Math.random() > 0.5 ? 'teams' : 'ffa';
    this.maps = ['arabic_city', 'old_town', 'snow_town'];
    this.currentMap = this.maps[Math.floor(Math.random() * this.maps.length)];
    this.state = 'waiting'; // waiting, countdown, live, ended
    this.players = new Map(); // socketId -> player object
    this.projectiles = [];
    this.maxPlayers = 15;
    this.matchDuration = 300; // 5 minutes in seconds
    this.matchTimeRemaining = this.matchDuration;
    this.countdownTime = 15;
    this.countdownStarted = false;
    this.lastTimerBroadcast = Date.now();
  }

  addPlayer(socket, name) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }

    const spawnPoint = this.getRandomSpawnPoint();
    const team = this.mode === 'teams' 
      ? (this.getTeamPlayerCount('alpha') <= this.getTeamPlayerCount('omega') ? 'alpha' : 'omega')
      : null;

    const player = {
      id: socket.id,
      name: name,
      team: team,
      position: { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
      rotation: { x: 0, y: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      ammo: 30,
      reserveAmmo: 90,
      kills: 0,
      deaths: 0,
      isAlive: true,
      isReloading: false,
      reloadStartTime: 0,
      lastShotTime: 0,
      input: { w: false, a: false, s: false, d: false, space: false, shooting: false, reloading: false },
      mouseDelta: { x: 0, y: 0 }
    };

    this.players.set(socket.id, player);
    socket.join(this.id);

    // Send lobby joined event to the player
    socket.emit('lobby:joined', {
      lobbyId: this.id,
      mode: this.mode,
      map: this.currentMap,
      playerId: socket.id,
      playerName: name,
      team: team,
      players: this.getPlayerListForClient()
    });

    // Broadcast to others that a new player joined
    socket.to(this.id).emit('player:joined', {
      id: socket.id,
      name: name,
      team: team
    });

    // Check if we should start countdown
    if (this.state === 'waiting' && this.players.size >= 2 && !this.countdownStarted) {
      this.startCountdown();
    } else if (this.state === 'live') {
      // Player joining mid-match
      socket.emit('lobby:stateChange', { state: 'live' });
    }

    return true;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.io.to(this.id).emit('player:left', { id: socketId });
      
      // If less than 2 players remain during countdown or match, reset to waiting
      if (this.players.size < 2 && (this.state === 'countdown' || this.state === 'live')) {
        this.resetLobby();
      }
    }
  }

  handlePlayerInput(socketId, input) {
    const player = this.players.get(socketId);
    if (player && player.isAlive && this.state === 'live') {
      player.input = input.keys || player.input;
      player.mouseDelta = input.mouseDelta || player.mouseDelta;

      // Handle shooting
      if (input.shooting && !player.isReloading) {
        this.handleShooting(player);
      }

      // Handle reloading
      if (input.reloading && !player.isReloading && player.ammo < 30) {
        this.startReload(player);
      }
    }
  }

  handleShooting(player) {
    const now = Date.now();
    const fireRate = 100; // 600 RPM = 100ms between shots

    if (now - player.lastShotTime < fireRate) {
      return;
    }

    if (player.ammo <= 0) {
      // Auto-reload when out of ammo
      if (player.reserveAmmo > 0) {
        this.startReload(player);
      }
      return;
    }

    player.ammo--;
    player.lastShotTime = now;

    // Perform hitscan
    const hit = this.performHitscan(player);
    
    if (hit) {
      const targetPlayer = this.players.get(hit.playerId);
      if (targetPlayer) {
        const damage = hit.isHeadshot ? 50 : 25;
        targetPlayer.health -= damage;

        // Notify shooter of hit
        this.io.to(player.id).emit('player:hit', {
          targetId: hit.playerId,
          damage: damage,
          isHeadshot: hit.isHeadshot,
          newHealth: targetPlayer.health
        });

        if (targetPlayer.health <= 0) {
          this.handlePlayerDeath(targetPlayer, player);
        }
      }
    }
  }

  performHitscan(shooter) {
    // Simplified hitscan - check all players
    const shooterPos = shooter.position;
    const shooterRot = shooter.rotation;

    // Calculate ray direction from rotation
    const direction = {
      x: Math.sin(shooterRot.y) * Math.cos(shooterRot.x),
      y: -Math.sin(shooterRot.x),
      z: Math.cos(shooterRot.y) * Math.cos(shooterRot.x)
    };

    let closestHit = null;
    let closestDistance = Infinity;

    for (const [id, player] of this.players) {
      if (id === shooter.id || !player.isAlive) continue;
      if (this.mode === 'teams' && player.team === shooter.team) continue;

      // Simple distance check (should be replaced with proper raycasting)
      const toPlayer = {
        x: player.position.x - shooterPos.x,
        y: player.position.y - shooterPos.y,
        z: player.position.z - shooterPos.z
      };

      const distance = Math.sqrt(toPlayer.x ** 2 + toPlayer.y ** 2 + toPlayer.z ** 2);
      
      // Check if player is roughly in front
      const dot = (toPlayer.x * direction.x + toPlayer.y * direction.y + toPlayer.z * direction.z) / distance;
      
      if (dot > 0.99 && distance < closestDistance && distance < 100) {
        // Check if headshot (upper part of capsule)
        const isHeadshot = Math.abs(toPlayer.y - 0.8) < 0.3;
        closestHit = { playerId: id, isHeadshot, distance };
        closestDistance = distance;
      }
    }

    return closestHit;
  }

  handlePlayerDeath(victim, killer) {
    victim.isAlive = false;
    victim.health = 0;
    victim.deaths++;
    killer.kills++;

    this.io.to(this.id).emit('player:killed', {
      victimId: victim.id,
      victimName: victim.name,
      killerId: killer.id,
      killerName: killer.name
    });
  }

  respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (player && !player.isAlive && this.state === 'live') {
      const spawnPoint = this.getRandomSpawnPoint();
      player.position = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z };
      player.health = player.maxHealth;
      player.ammo = 30;
      player.reserveAmmo = 90;
      player.isAlive = true;
      player.isReloading = false;
      player.velocity = { x: 0, y: 0, z: 0 };
    }
  }

  startReload(player) {
    if (player.reserveAmmo > 0) {
      player.isReloading = true;
      player.reloadStartTime = Date.now();
    }
  }

  updateReload(player) {
    if (player.isReloading) {
      const elapsed = Date.now() - player.reloadStartTime;
      if (elapsed >= 2400) { // 2.4 seconds
        const ammoNeeded = 30 - player.ammo;
        const ammoToAdd = Math.min(ammoNeeded, player.reserveAmmo);
        player.ammo += ammoToAdd;
        player.reserveAmmo -= ammoToAdd;
        player.isReloading = false;
      }
    }
  }

  startCountdown() {
    this.state = 'countdown';
    this.countdownStarted = true;
    this.io.to(this.id).emit('lobby:stateChange', { state: 'countdown', time: this.countdownTime });

    setTimeout(() => {
      if (this.players.size >= 2) {
        this.startMatch();
      } else {
        this.resetLobby();
      }
    }, this.countdownTime * 1000);
  }

  startMatch() {
    this.state = 'live';
    this.matchTimeRemaining = this.matchDuration;
    this.io.to(this.id).emit('lobby:stateChange', { state: 'live' });
  }

  resetLobby() {
    this.state = 'waiting';
    this.countdownStarted = false;
    this.matchTimeRemaining = this.matchDuration;
    this.io.to(this.id).emit('lobby:stateChange', { state: 'waiting' });
  }

  tick(deltaTime) {
    if (this.state !== 'live') return;

    // Update match timer
    this.matchTimeRemaining -= deltaTime / 1000;
    
    // Broadcast timer every second
    if (Date.now() - this.lastTimerBroadcast >= 1000) {
      this.io.to(this.id).emit('game:timer', { 
        time: Math.max(0, Math.floor(this.matchTimeRemaining)) 
      });
      this.lastTimerBroadcast = Date.now();
    }

    if (this.matchTimeRemaining <= 0) {
      this.endMatch();
      return;
    }

    // Update all players
    for (const [id, player] of this.players) {
      if (player.isAlive) {
        this.updatePlayerPhysics(player, deltaTime);
        this.updateReload(player);
      }
    }

    // Broadcast game state
    this.broadcastGameState();
  }

  updatePlayerPhysics(player, deltaTime) {
    const speed = 5;
    const dt = deltaTime / 1000;

    // Apply input to velocity
    const input = player.input;
    const forward = { 
      x: Math.sin(player.rotation.y), 
      z: Math.cos(player.rotation.y) 
    };
    const right = { 
      x: Math.cos(player.rotation.y), 
      z: -Math.sin(player.rotation.y) 
    };

    player.velocity.x = 0;
    player.velocity.z = 0;

    if (input.w) {
      player.velocity.x += forward.x * speed;
      player.velocity.z += forward.z * speed;
    }
    if (input.s) {
      player.velocity.x -= forward.x * speed;
      player.velocity.z -= forward.z * speed;
    }
    if (input.a) {
      player.velocity.x -= right.x * speed;
      player.velocity.z -= right.z * speed;
    }
    if (input.d) {
      player.velocity.x += right.x * speed;
      player.velocity.z += right.z * speed;
    }

    // Apply gravity
    if (player.position.y > 0) {
      player.velocity.y -= 20 * dt;
    } else {
      player.velocity.y = 0;
      player.position.y = 0;
      
      // Jump
      if (input.space) {
        player.velocity.y = 8;
      }
    }

    // Update position
    player.position.x += player.velocity.x * dt;
    player.position.y += player.velocity.y * dt;
    player.position.z += player.velocity.z * dt;

    // Update rotation from mouse delta
    if (player.mouseDelta) {
      player.rotation.y += player.mouseDelta.x * 0.002;
      player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, 
        player.rotation.x + player.mouseDelta.y * 0.002));
    }

    // Clamp position to map bounds (simple box)
    const bound = 50;
    player.position.x = Math.max(-bound, Math.min(bound, player.position.x));
    player.position.z = Math.max(-bound, Math.min(bound, player.position.z));
    player.position.y = Math.max(0, player.position.y);
  }

  broadcastGameState() {
    const gameState = {
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        rotation: p.rotation,
        health: p.health,
        ammo: p.ammo,
        reserveAmmo: p.reserveAmmo,
        isAlive: p.isAlive,
        isReloading: p.isReloading,
        kills: p.kills,
        deaths: p.deaths
      })),
      projectiles: this.projectiles
    };

    this.io.to(this.id).emit('game:tick', gameState);
  }

  endMatch() {
    this.state = 'ended';
    
    const scoreboard = this.generateScoreboard();
    this.io.to(this.id).emit('game:ended', scoreboard);

    // Reset lobby after 30 seconds
    setTimeout(() => {
      this.resetForNewMatch();
    }, 30000);
  }

  generateScoreboard() {
    const players = Array.from(this.players.values());
    
    let winner = null;
    if (this.mode === 'ffa') {
      players.sort((a, b) => b.kills - a.kills);
      winner = players.length > 0 ? players[0].name : 'No Winner';
      
      // Check for tie
      if (players.length > 1 && players[0].kills === players[1].kills) {
        winner = 'DRAW';
      }
    } else {
      const alphaKills = players.filter(p => p.team === 'alpha').reduce((sum, p) => sum + p.kills, 0);
      const omegaKills = players.filter(p => p.team === 'omega').reduce((sum, p) => sum + p.kills, 0);
      
      if (alphaKills > omegaKills) {
        winner = 'Team Alpha';
      } else if (omegaKills > alphaKills) {
        winner = 'Team Omega';
      } else {
        winner = 'DRAW';
      }
      
      players.sort((a, b) => b.kills - a.kills);
    }

    return {
      winner: winner,
      mode: this.mode,
      players: players.map((p, index) => ({
        rank: index + 1,
        name: p.name,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        kd: p.deaths === 0 ? p.kills : (p.kills / p.deaths).toFixed(2)
      }))
    };
  }

  resetForNewMatch() {
    // Reset all player stats but keep them in lobby
    for (const [id, player] of this.players) {
      player.kills = 0;
      player.deaths = 0;
      player.health = player.maxHealth;
      player.ammo = 30;
      player.reserveAmmo = 90;
      player.isAlive = true;
      player.isReloading = false;
      
      const spawnPoint = this.getRandomSpawnPoint();
      player.position = { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z };
    }

    // Pick a new map
    this.currentMap = this.maps[Math.floor(Math.random() * this.maps.length)];
    
    this.resetLobby();
  }

  getRandomSpawnPoint() {
    // Return random spawn points (should be map-specific)
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 10;
    return {
      x: Math.cos(angle) * radius,
      y: 1,
      z: Math.sin(angle) * radius
    };
  }

  getTeamPlayerCount(team) {
    return Array.from(this.players.values()).filter(p => p.team === team).length;
  }

  getPlayerListForClient() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      team: p.team,
      kills: p.kills,
      deaths: p.deaths
    }));
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  canJoin() {
    return !this.isFull() && this.state !== 'ended';
  }
}
