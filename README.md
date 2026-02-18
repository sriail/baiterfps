# BaiterFPS - Browser-Based Multiplayer FPS

A real-time multiplayer first-person shooter built with Three.js, Node.js, and Socket.IO.

## Features

- **Real-time Multiplayer**: Up to 15 players per lobby with automatic matchmaking
- **Two Game Modes**: 
  - Free-For-All (FFA): Every player for themselves
  - Teams: Alpha (Blue) vs Omega (Red)
- **Three Maps**: Arabic City, Old Town, and Snow Town
- **Weapon System**: Assault rifle with realistic mechanics (30-round magazine, reload system, headshots)
- **Visual Effects**: Muzzle flash, shell casings, impact particles, blood effects
- **Full HUD**: Health bar, ammo counter, kill feed, match timer, team scores
- **Lobby System**: Automatic matchmaking, 15-second countdown, 5-minute matches
- **Dynamic Names**: Auto-generated military callsigns for each player

## Getting Started

### Installation

```bash
npm install
```

### Running the Game

Development mode (runs both server and client):
```bash
npm run dev
```

Or run separately:

Server only:
```bash
npm run server
```

Client only (in another terminal):
```bash
npm run client
```

### Playing

1. Open your browser to `http://localhost:3001` (or `http://localhost:3000` if running server only)
2. The game will automatically connect and join a lobby
3. Once 2+ players join, a 15-second countdown begins
4. Click to lock your mouse pointer and start playing

### Controls

- **WASD**: Move
- **Mouse**: Look around
- **Left Click**: Shoot
- **Space**: Jump
- **R**: Reload
- **Tab**: Show scoreboard

## Technical Details

### Server (Node.js + Express + Socket.IO)

- Runs at 20 ticks per second
- Server-authoritative gameplay (all physics and hit detection on server)
- Lobby system with automatic matchmaking
- Supports multiple concurrent lobbies

### Client (Three.js + Vite)

- Three.js (r160+) for 3D rendering
- Client-side prediction for smooth movement
- Particle system for visual effects
- Pointer Lock API for mouse control
- Real-time state synchronization

### Game Mechanics

- **Health**: 100 HP per player
- **Weapon**: Assault rifle (30/90 ammo, 600 RPM, 2.4s reload)
- **Damage**: 25 HP body shot, 50 HP headshot
- **Match Duration**: 5 minutes
- **Win Condition**: Most kills when timer expires

## Architecture

```
baiterfps/
├── client/             # Client-side code
│   ├── main.js        # Entry point
│   ├── Game.js        # Main game class
│   ├── InputManager.js
│   ├── HUDManager.js
│   ├── MapLoader.js
│   ├── PlayerController.js
│   ├── RemotePlayer.js
│   ├── WeaponSystem.js
│   ├── ParticleSystem.js
│   └── index.html
├── server/            # Server-side code
│   ├── index.js       # Server entry point
│   ├── LobbyManager.js
│   ├── Lobby.js
│   └── NameGenerator.js
├── src/recources/     # Game assets
│   ├── arabic_city.zip
│   ├── old_town.zip
│   ├── snow_town.zip
│   ├── guns/gun-m4a1.zip
│   └── player/*.fbx
└── package.json
```

## Socket.IO Events

### Client → Server
- `player:join` - Join a lobby
- `player:input` - Send movement/shooting input
- `player:respawn` - Respawn after death

### Server → Client
- `lobby:joined` - Lobby joined successfully
- `lobby:stateChange` - Game state changed (waiting/countdown/live/ended)
- `game:tick` - Full game state update (20 Hz)
- `game:timer` - Match timer update
- `player:hit` - Hit confirmation
- `player:killed` - Death notification
- `game:ended` - Match ended with scoreboard

## License

MIT
