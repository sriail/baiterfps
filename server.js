const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  pingInterval: 5000,
  pingTimeout: 10000
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;
const MAPS = ['arabic_city', 'snow_town'];

// Serve static files with compression headers
app.use(express.static(path.join(__dirname, 'src/playercontent'), { maxAge: '1h' }));
app.use('/maps', express.static(path.join(__dirname, 'src/recources/maps'), { maxAge: '7d' }));

// Lobby storage: code -> { map, host, isPublic, started, players: Map<socketId, playerState> }
const lobbies = new Map();

// ── Random name generation ────────────────────────────────────────────────────
const NAME_ADJECTIVES = [
  'Swift','Shadow','Iron','Ghost','Storm','Blaze','Frost','Crimson','Silent','Brave',
  'Dark','Mighty','Steel','Rapid','Neon','Noble','Wild','Lucky','Fierce','Bold'
];
const NAME_NOUNS = [
  'Wolf','Eagle','Viper','Hawk','Tiger','Fox','Bear','Falcon','Raven','Lion',
  'Phoenix','Cobra','Shark','Panther','Dragon','Lynx','Mantis','Jackal','Puma','Orca'
];

function generateRandomName() {
  const adj  = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const num  = Math.floor(Math.random() * 100);
  return adj + noun + num;
}

// ── Swear word filter ─────────────────────────────────────────────────────────
const SWEAR_WORDS = [
  'fuck','shit','ass','bitch','damn','crap','dick','bastard','cunt','piss',
  'slut','whore','cock','twat','wank','bollocks','arse','nigger','fag','retard',
  'stfu','gtfo','dumbass','jackass','asshole','arsehole',
  'motherfucker','fucker','fucking','shitty','bullshit','horseshit','dipshit',
  'prick','douche','douchebag','skank','tramp','thot','incel',
  'spaz','spastic',
  'kys','kms','negro','chink','spic','wetback','cracker',
  'honky','gook','kike','beaner','coon','darkie','paki','raghead','towelhead',
  'dyke','lesbo','tranny','shemale','dildo','wanker','tosser','bellend',
  'nonce','minger','bugger','sodoff','pissoff'
];

function filterSwearWords(text) {
  let filtered = text;
  for (const word of SWEAR_WORDS) {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, (match) => {
      if (match.length <= 2) return match[0] + '#';
      return match[0] + '#'.repeat(match.length - 2) + match[match.length - 1];
    });
  }
  return filtered;
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getUniqueLobbyCode() {
  let code;
  do {
    code = generateCode();
  } while (lobbies.has(code));
  return code;
}

// Helper: build player list for a lobby
function getPlayerList(lobby) {
  const list = [];
  lobby.players.forEach((p, id) => {
    list.push({ id, name: p.name, isHost: id === lobby.host });
  });
  return list;
}

// Helper: broadcast updated player list to entire lobby
function broadcastPlayerList(lobbyCode) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return;
  io.to(lobbyCode).emit('playerList', getPlayerList(lobby));
}

io.on('connection', (socket) => {
  let currentLobbyCode = null;
  let playerName = generateRandomName();

  // Allow client to set/update their display name
  socket.on('setName', ({ name } = {}, callback) => {
    if (!name || typeof name !== 'string') return callback && callback({ success: false });
    const cleaned = filterSwearWords(name.trim().substring(0, 20));
    if (cleaned.length === 0) return callback && callback({ success: false });
    playerName = cleaned;
    // Update name in lobby if in one
    if (currentLobbyCode) {
      const lobby = lobbies.get(currentLobbyCode);
      if (lobby) {
        const p = lobby.players.get(socket.id);
        if (p) p.name = playerName;
        broadcastPlayerList(currentLobbyCode);
      }
    }
    if (callback) callback({ success: true, name: playerName });
  });

  // Send the generated name to the client on connect
  socket.emit('assignedName', { name: playerName });

  socket.on('createLobby', ({ map: chosenMap, isPublic } = {}, callback) => {
    // Support old-style callback-only signature
    if (typeof chosenMap === 'function') { callback = chosenMap; chosenMap = undefined; }
    const code = getUniqueLobbyCode();
    const map = MAPS.includes(chosenMap) ? chosenMap : MAPS[Math.floor(Math.random() * MAPS.length)];
    lobbies.set(code, { map, host: socket.id, isPublic: !!isPublic, started: false, players: new Map() });

    currentLobbyCode = code;
    socket.join(code);

    const playerState = { id: socket.id, name: playerName, x: 0, y: 2, z: 0, yaw: 0 };
    lobbies.get(code).players.set(socket.id, playerState);

    callback({ success: true, code, map, isPublic: !!isPublic, isHost: true, playerList: getPlayerList(lobbies.get(code)) });
  });

  socket.on('joinLobby', ({ code }, callback) => {
    const normalizedCode = (code || '').toUpperCase().trim();
    const lobby = lobbies.get(normalizedCode);

    if (!lobby) {
      return callback({ success: false, error: 'Lobby not found' });
    }
    if (lobby.players.size >= MAX_PLAYERS) {
      return callback({ success: false, error: 'Lobby is full (max 16 players)' });
    }

    currentLobbyCode = normalizedCode;
    socket.join(normalizedCode);

    const playerState = { id: socket.id, name: playerName, x: 0, y: 2, z: 0, yaw: 0 };
    lobby.players.set(socket.id, playerState);

    // Send existing players to the new player
    const existingPlayers = [];
    lobby.players.forEach((p, id) => {
      if (id !== socket.id) existingPlayers.push(p);
    });

    const isHost = lobby.host === socket.id;
    callback({ success: true, map: lobby.map, existingPlayers, isHost, playerList: getPlayerList(lobby) });

    // Notify others of new player
    socket.to(normalizedCode).emit('playerJoined', playerState);

    // Broadcast chat announcement
    io.to(normalizedCode).emit('chatMessage', { sender: '', text: playerName + ' has joined the lobby', system: true });

    // Broadcast updated player list
    broadcastPlayerList(normalizedCode);
  });

  // Toggle lobby visibility (public/private) — admin only
  socket.on('toggleVisibility', ({ isPublic }, callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby || lobby.host !== socket.id) return callback && callback({ success: false });
    lobby.isPublic = !!isPublic;
    if (callback) callback({ success: true, isPublic: lobby.isPublic });
  });

  // Host starts game → broadcast to all lobby members (admin only)
  socket.on('startGame', (callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return callback && callback({ success: false });
    if (lobby.host !== socket.id) return callback && callback({ success: false, error: 'Only the lobby admin can start the game' });
    lobby.started = true;
    // Broadcast to everyone in the lobby (including sender via io.to)
    io.to(currentLobbyCode).emit('gameStart', { map: lobby.map, code: currentLobbyCode });
    if (callback) callback({ success: true });
  });

  // List all public lobbies
  socket.on('listLobbies', (callback) => {
    const publicLobbies = [];
    lobbies.forEach((lobby, code) => {
      if (lobby.isPublic) {
        publicLobbies.push({
          code,
          map: lobby.map,
          playerCount: lobby.players.size,
          maxPlayers: MAX_PLAYERS,
          started: lobby.started
        });
      }
    });
    callback({ lobbies: publicLobbies });
  });

  // Quick play: join a random non-full, non-started public lobby, or create one
  socket.on('quickPlay', (callback) => {
    const candidates = [];
    lobbies.forEach((lobby, code) => {
      if (lobby.isPublic && !lobby.started && lobby.players.size < MAX_PLAYERS) {
        candidates.push(code);
      }
    });
    if (candidates.length > 0) {
      const code = candidates[Math.floor(Math.random() * candidates.length)];
      const lobby = lobbies.get(code);
      currentLobbyCode = code;
      socket.join(code);
      const playerState = { id: socket.id, name: playerName, x: 0, y: 2, z: 0, yaw: 0 };
      lobby.players.set(socket.id, playerState);
      const existingPlayers = [];
      lobby.players.forEach((p, id) => { if (id !== socket.id) existingPlayers.push(p); });
      callback({ success: true, code, map: lobby.map, existingPlayers, isHost: false, isPublic: true, playerList: getPlayerList(lobby) });
      socket.to(code).emit('playerJoined', playerState);
      io.to(code).emit('chatMessage', { sender: '', text: playerName + ' has joined the lobby', system: true });
      broadcastPlayerList(code);
    } else {
      // Create a new public lobby with a random map
      const code = getUniqueLobbyCode();
      const map = MAPS[Math.floor(Math.random() * MAPS.length)];
      lobbies.set(code, { map, host: socket.id, isPublic: true, started: false, players: new Map() });
      currentLobbyCode = code;
      socket.join(code);
      const playerState = { id: socket.id, name: playerName, x: 0, y: 2, z: 0, yaw: 0 };
      lobbies.get(code).players.set(socket.id, playerState);
      callback({ success: true, code, map, isPublic: true, isHost: true, playerList: getPlayerList(lobbies.get(code)) });
    }
  });

  // Chat message
  socket.on('sendChat', ({ text } = {}, callback) => {
    if (!currentLobbyCode || !text || typeof text !== 'string') return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return callback && callback({ success: false });

    const trimmed = text.trim().substring(0, 200);
    if (trimmed.length === 0) return callback && callback({ success: false });

    // Private message: ?send:(USERNAME);(MESSAGE)
    const pmMatch = trimmed.match(/^\?send:([^;]+);(.+)$/i);
    if (pmMatch) {
      const targetName = pmMatch[1].trim();
      const pmText = filterSwearWords(pmMatch[2].trim());
      // Find target player by name
      let targetId = null;
      lobby.players.forEach((p, id) => {
        if (p.name.toLowerCase() === targetName.toLowerCase()) targetId = id;
      });
      if (!targetId) return callback && callback({ success: false, error: 'Player not found' });
      io.to(targetId).emit('chatMessage', { sender: playerName, text: pmText, pm: true });
      socket.emit('chatMessage', { sender: 'You → ' + targetName, text: pmText, pm: true });
      if (callback) callback({ success: true });
      return;
    }

    const filtered = filterSwearWords(trimmed);
    io.to(currentLobbyCode).emit('chatMessage', { sender: playerName, text: filtered, system: false });
    if (callback) callback({ success: true });
  });

  // Kick player (admin only)
  socket.on('kickPlayer', ({ targetId } = {}, callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby || lobby.host !== socket.id) return callback && callback({ success: false, error: 'Only the admin can kick players' });
    if (targetId === socket.id) return callback && callback({ success: false, error: 'Cannot kick yourself' });
    if (!lobby.players.has(targetId)) return callback && callback({ success: false, error: 'Player not in lobby' });

    const kickedName = lobby.players.get(targetId).name;
    lobby.players.delete(targetId);

    // Notify the kicked player
    io.to(targetId).emit('kicked', { reason: 'You were kicked by the lobby admin' });
    // Remove from socket room
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.leave(currentLobbyCode);
      targetSocket.currentLobbyCode = null;
    }

    // Announce in chat
    io.to(currentLobbyCode).emit('chatMessage', { sender: '', text: kickedName + ' was kicked from the lobby', system: true });
    broadcastPlayerList(currentLobbyCode);
    if (callback) callback({ success: true });
  });

  // Report player to admin
  socket.on('reportPlayer', ({ targetId, reason } = {}, callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return callback && callback({ success: false });
    if (!lobby.players.has(targetId)) return callback && callback({ success: false, error: 'Player not in lobby' });

    const reporterName = playerName;
    const reportedName = lobby.players.get(targetId).name;
    // Send report notification to admin
    io.to(lobby.host).emit('chatMessage', {
      sender: 'REPORT',
      text: reporterName + ' reported ' + reportedName + (reason ? ': ' + filterSwearWords(reason) : ''),
      system: true
    });
    if (callback) callback({ success: true });
  });

  // Map change (admin only, in lobby before game starts)
  socket.on('changeMap', ({ map } = {}, callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby || lobby.host !== socket.id) return callback && callback({ success: false });
    if (!MAPS.includes(map)) return callback && callback({ success: false, error: 'Invalid map' });
    if (lobby.started) return callback && callback({ success: false, error: 'Game already started' });
    lobby.map = map;
    io.to(currentLobbyCode).emit('mapChanged', { map });
    if (callback) callback({ success: true, map });
  });

  socket.on('playerMove', (state) => {
    if (!currentLobbyCode) return;
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return;

    const player = lobby.players.get(socket.id);
    if (player) {
      player.x = state.x;
      player.y = state.y;
      player.z = state.z;
      player.yaw = state.yaw;
    }

    // Broadcast to others in lobby
    socket.to(currentLobbyCode).emit('playerMoved', {
      id: socket.id,
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw
    });
  });

  socket.on('disconnect', () => {
    if (!currentLobbyCode) return;
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return;

    const leftName = playerName;
    lobby.players.delete(socket.id);
    socket.to(currentLobbyCode).emit('playerLeft', { id: socket.id });

    // Announce in chat
    socket.to(currentLobbyCode).emit('chatMessage', { sender: '', text: leftName + ' has left the lobby', system: true });

    if (lobby.players.size === 0) {
      lobbies.delete(currentLobbyCode);
    } else {
      broadcastPlayerList(currentLobbyCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`BaiterFPS server running at http://localhost:${PORT}`);
});
