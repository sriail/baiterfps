import { Lobby } from './Lobby.js';

export class LobbyManager {
  constructor(io) {
    this.io = io;
    this.lobbies = new Map();
    this.playerLobbies = new Map(); // socketId -> lobbyId
  }

  generateLobbyId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id;
    do {
      id = '';
      for (let i = 0; i < 4; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.lobbies.has(id));
    return id;
  }

  joinLobby(socket, playerName) {
    // Find an open lobby or create a new one
    let targetLobby = null;
    
    for (const [id, lobby] of this.lobbies) {
      if (lobby.canJoin()) {
        targetLobby = lobby;
        break;
      }
    }

    if (!targetLobby) {
      const lobbyId = this.generateLobbyId();
      targetLobby = new Lobby(lobbyId, this.io);
      this.lobbies.set(lobbyId, targetLobby);
      console.log(`Created new lobby: ${lobbyId}`);
    }

    const success = targetLobby.addPlayer(socket, playerName);
    if (success) {
      this.playerLobbies.set(socket.id, targetLobby.id);
      console.log(`Player ${playerName} joined lobby ${targetLobby.id}`);
    }
  }

  removePlayer(socketId) {
    const lobbyId = this.playerLobbies.get(socketId);
    if (lobbyId) {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        lobby.removePlayer(socketId);
        
        // Remove empty lobbies
        if (lobby.players.size === 0) {
          this.lobbies.delete(lobbyId);
          console.log(`Removed empty lobby: ${lobbyId}`);
        }
      }
      this.playerLobbies.delete(socketId);
    }
  }

  handlePlayerInput(socketId, input) {
    const lobbyId = this.playerLobbies.get(socketId);
    if (lobbyId) {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        lobby.handlePlayerInput(socketId, input);
      }
    }
  }

  respawnPlayer(socketId) {
    const lobbyId = this.playerLobbies.get(socketId);
    if (lobbyId) {
      const lobby = this.lobbies.get(lobbyId);
      if (lobby) {
        lobby.respawnPlayer(socketId);
      }
    }
  }

  tick() {
    const now = Date.now();
    for (const [id, lobby] of this.lobbies) {
      lobby.tick(50); // 50ms delta time
    }
  }
}
