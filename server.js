import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const MAX_LOBBY = 18;

// ─── Auto-extract assets on startup ────────────────────────────────────────
const extractions = [
  {
    zip: join(__dirname, 'public/maps/arabic_city.zip'),
    dest: join(__dirname, 'public/maps/arabic_city'),
    cmd: `unzip -o "${join(__dirname, 'public/maps/arabic_city.zip')}" -d "${join(__dirname, 'public/maps/arabic_city')}"`,
  },
  {
    zip: join(__dirname, 'public/player-modles/player-1.zip'),
    dest: join(__dirname, 'public/characters'),
    cmd: `unzip -o "${join(__dirname, 'public/player-modles/player-1.zip')}" -d "${join(__dirname, 'public/characters')}"`,
  },
];

for (const { zip, dest, cmd } of extractions) {
  if (!existsSync(dest) && existsSync(zip)) {
    try {
      console.log(`Extracting ${zip} → ${dest}`);
      execSync(cmd, { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to extract ${zip}:`, err.message);
    }
  }
}

// ─── Express + Socket.io setup ──────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

// Serve static files
app.use(express.static(join(__dirname, 'public')));
if (existsSync(join(__dirname, 'dist'))) {
  app.use(express.static(join(__dirname, 'dist')));
}

// ─── Lobby system ───────────────────────────────────────────────────────────
const MAPS = ['arabic_city'];
const lobbies = new Map(); // code → { players: Map, map: string }

function generateLobbyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getAvailableLobby() {
  for (const [code, lobby] of lobbies) {
    if (lobby.players.size < MAX_LOBBY) return code;
  }
  return null;
}

function createLobby() {
  let code;
  do { code = generateLobbyCode(); } while (lobbies.has(code));
  const map = MAPS[Math.floor(Math.random() * MAPS.length)];
  lobbies.set(code, { players: new Map(), map });
  return code;
}

function joinLobby(socket, code, playerName) {
  const lobby = lobbies.get(code);
  if (!lobby) return;

  const player = {
    id: socket.id,
    name: playerName,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    animation: 'idle',
  };

  const existingPlayers = Array.from(lobby.players.values());
  lobby.players.set(socket.id, player);
  socket.join(code);

  // Tell the joiner about the current lobby state
  socket.emit('joinedLobby', {
    code,
    map: lobby.map,
    players: existingPlayers,
    myId: socket.id,
    playerCount: lobby.players.size,
    maxPlayers: MAX_LOBBY,
  });

  // Tell everyone else about the new player
  socket.to(code).emit('playerJoined', player);

  // Broadcast updated count to all in lobby
  io.to(code).emit('playerCount', { count: lobby.players.size, max: MAX_LOBBY });
}

function leaveLobby(socket, code) {
  const lobby = lobbies.get(code);
  if (!lobby) return;

  const player = lobby.players.get(socket.id);
  lobby.players.delete(socket.id);
  socket.leave(code);

  if (player) {
    io.to(code).emit('playerLeft', { id: socket.id, name: player.name });
  }
  io.to(code).emit('playerCount', { count: lobby.players.size, max: MAX_LOBBY });

  // Clean up empty lobbies
  if (lobby.players.size === 0) lobbies.delete(code);
}

// ─── Socket event handlers ──────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentLobbyCode = null;

  socket.on('requestLobby', ({ playerName }) => {
    const name = String(playerName || 'Player').slice(0, 16);
    let code = getAvailableLobby();
    if (!code) code = createLobby();
    currentLobbyCode = code;
    joinLobby(socket, code, name);
  });

  socket.on('joinByCode', ({ code, playerName }) => {
    const upperCode = String(code || '').toUpperCase();
    const lobby = lobbies.get(upperCode);
    if (!lobby) {
      socket.emit('error', { message: 'Lobby not found.' });
      return;
    }
    if (lobby.players.size >= MAX_LOBBY) {
      socket.emit('error', { message: 'Lobby is full.' });
      return;
    }
    const name = String(playerName || 'Player').slice(0, 16);
    currentLobbyCode = upperCode;
    joinLobby(socket, upperCode, name);
  });

  socket.on('playerMove', ({ position, rotation }) => {
    if (!currentLobbyCode) return;
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (player) {
      player.position = position;
      player.rotation = rotation;
    }
    socket.to(currentLobbyCode).emit('playerMoved', {
      id: socket.id,
      position,
      rotation,
    });
  });

  socket.on('playerAnimation', ({ animation }) => {
    if (!currentLobbyCode) return;
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (player) player.animation = animation;
    socket.to(currentLobbyCode).emit('playerAnimation', {
      id: socket.id,
      animation,
    });
  });

  socket.on('chat', ({ message }) => {
    if (!currentLobbyCode) return;
    const lobby = lobbies.get(currentLobbyCode);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    const sanitized = String(message || '').slice(0, 150);
    if (!sanitized.trim()) return;
    io.to(currentLobbyCode).emit('chat', {
      id: socket.id,
      name: player.name,
      message: sanitized,
    });
  });

  socket.on('disconnect', () => {
    if (currentLobbyCode) leaveLobby(socket, currentLobbyCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`BaiterFPS server running on port ${PORT}`);
});
