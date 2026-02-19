import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import rateLimit from 'express-rate-limit';
import { LobbyManager } from './LobbyManager.js';
import { NameGenerator } from './NameGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Rate limiting for static file routes
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

if (isDev) {
  // In development, serve client files directly
  app.use(express.static(join(__dirname, '../client')));
  app.use(express.static(join(__dirname, '../src/recources')));
} else {
  // In production, serve built files
  app.use(express.static(join(__dirname, '../dist/client')));
}

// Fallback to serve index.html for all routes
app.get('*', (req, res) => {
  const indexPath = isDev 
    ? join(__dirname, '../client/index.html')
    : join(__dirname, '../dist/client/index.html');
  res.sendFile(indexPath);
});

const lobbyManager = new LobbyManager(io);
const nameGenerator = new NameGenerator();
const playerNames = new Map(); // socketId -> name

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Assign a random name to the player
  const playerName = nameGenerator.generateName();
  playerNames.set(socket.id, playerName);

  socket.on('player:join', () => {
    lobbyManager.joinLobby(socket, playerName);
  });

  socket.on('player:input', (input) => {
    lobbyManager.handlePlayerInput(socket.id, input);
  });

  socket.on('player:respawn', () => {
    lobbyManager.respawnPlayer(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    lobbyManager.removePlayer(socket.id);
    playerNames.delete(socket.id);
  });
});

// Start game loop at 20 ticks/second (50ms per tick)
setInterval(() => {
  lobbyManager.tick();
}, 50);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
