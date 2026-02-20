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
const MAPS = ['arabic_city', 'old_town', 'snow_town'];

// Serve static files with compression headers
app.use(express.static(path.join(__dirname, 'src/playercontent'), { maxAge: '1h' }));
app.use('/maps', express.static(path.join(__dirname, 'src/recources/maps'), { maxAge: '7d' }));

// Lobby storage: code -> { map, host, isPublic, players: Map<socketId, playerState> }
const lobbies = new Map();

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

io.on('connection', (socket) => {
  let currentLobbyCode = null;

  socket.on('createLobby', ({ map: chosenMap, isPublic } = {}, callback) => {
    // Support old-style callback-only signature
    if (typeof chosenMap === 'function') { callback = chosenMap; chosenMap = undefined; }
    const code = getUniqueLobbyCode();
    const map = MAPS.includes(chosenMap) ? chosenMap : MAPS[Math.floor(Math.random() * MAPS.length)];
    lobbies.set(code, { map, host: socket.id, isPublic: !!isPublic, players: new Map() });

    currentLobbyCode = code;
    socket.join(code);

    const playerState = { id: socket.id, x: 0, y: 2, z: 0, yaw: 0 };
    lobbies.get(code).players.set(socket.id, playerState);

    callback({ success: true, code, map, isPublic: !!isPublic });
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

    const playerState = { id: socket.id, x: 0, y: 2, z: 0, yaw: 0 };
    lobby.players.set(socket.id, playerState);

    // Send existing players to the new player
    const existingPlayers = [];
    lobby.players.forEach((p, id) => {
      if (id !== socket.id) existingPlayers.push(p);
    });

    callback({ success: true, map: lobby.map, existingPlayers });

    // Notify others of new player
    socket.to(normalizedCode).emit('playerJoined', playerState);
  });

  // Toggle lobby visibility (public/private)
  socket.on('toggleVisibility', ({ isPublic }, callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby || lobby.host !== socket.id) return callback && callback({ success: false });
    lobby.isPublic = !!isPublic;
    if (callback) callback({ success: true, isPublic: lobby.isPublic });
  });

  // Host starts game → broadcast to all lobby members
  socket.on('startGame', (callback) => {
    if (!currentLobbyCode) return callback && callback({ success: false });
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return callback && callback({ success: false });
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
          maxPlayers: MAX_PLAYERS
        });
      }
    });
    callback({ lobbies: publicLobbies });
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

    lobby.players.delete(socket.id);
    socket.to(currentLobbyCode).emit('playerLeft', { id: socket.id });

    if (lobby.players.size === 0) {
      lobbies.delete(currentLobbyCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`BaiterFPS server running at http://localhost:${PORT}`);
});
