import * as THREE from 'three';
import { io } from 'socket.io-client';
import { Game } from './Game.js';

// Initialize socket connection
const socket = io(window.location.origin);

// Initialize game
const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas, socket);

// Loading screen
const loadingScreen = document.getElementById('loadingScreen');
const loadingText = document.getElementById('loadingText');

socket.on('connect', () => {
  loadingText.textContent = 'Connected! Joining lobby...';
  socket.emit('player:join');
});

socket.on('lobby:joined', (data) => {
  loadingText.textContent = 'Lobby joined! Loading game...';
  game.init(data);
  
  setTimeout(() => {
    loadingScreen.style.display = 'none';
    game.start();
  }, 1000);
});

socket.on('disconnect', () => {
  loadingText.textContent = 'Disconnected from server';
  loadingScreen.style.display = 'flex';
});

// Handle window resize
window.addEventListener('resize', () => {
  game.onResize();
});
