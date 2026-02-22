import { randomName } from './names.js';
import { io } from 'socket.io-client';

document.addEventListener('DOMContentLoaded', () => {
  const nameInput     = document.getElementById('player-name');
  const randomBtn     = document.getElementById('random-name-btn');
  const playBtn       = document.getElementById('play-btn');
  const enterCodeBtn  = document.getElementById('enter-code-btn');
  const codeModal     = document.getElementById('code-modal');
  const lobbyCodeInput = document.getElementById('lobby-code-input');
  const joinCodeBtn   = document.getElementById('join-code-btn');
  const cancelCodeBtn = document.getElementById('cancel-code-btn');
  const copyCodeBtn   = document.getElementById('copy-code-btn');
  const lobbyCodeSpan = document.getElementById('lobby-code');

  // Initialise with a random name
  nameInput.value = randomName();

  randomBtn.addEventListener('click', () => {
    nameInput.value = randomName();
  });

  enterCodeBtn.addEventListener('click', () => {
    codeModal.style.display = 'flex';
    lobbyCodeInput.focus();
  });

  cancelCodeBtn.addEventListener('click', () => {
    codeModal.style.display = 'none';
  });

  lobbyCodeInput.addEventListener('input', () => {
    lobbyCodeInput.value = lobbyCodeInput.value.toUpperCase();
  });

  playBtn.addEventListener('click', () => connectAndPlay(null));

  joinCodeBtn.addEventListener('click', () => {
    const code = lobbyCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      showStatus('Please enter a 6-character lobby code.', true);
      return;
    }
    codeModal.style.display = 'none';
    connectAndPlay(code);
  });

  copyCodeBtn.addEventListener('click', () => {
    const code = lobbyCodeSpan.textContent;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      const orig = copyCodeBtn.textContent;
      copyCodeBtn.textContent = '✔ Copied!';
      setTimeout(() => { copyCodeBtn.textContent = orig; }, 1500);
    }).catch(() => {});
  });
});

/** Show/clear the status message on the home screen. */
function showStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#ff6644' : '#88ccff';
}

/** Connect to the server and join/create a lobby. */
function connectAndPlay(code) {
  const nameInput = document.getElementById('player-name');
  const playBtn   = document.getElementById('play-btn');

  const playerName = nameInput.value.trim() || randomName();
  nameInput.value = playerName;

  playBtn.disabled = true;
  playBtn.textContent = 'Connecting…';
  showStatus('');

  // Disconnect any previous socket
  if (window._gameSocket) {
    try { window._gameSocket.disconnect(); } catch (_) {}
  }

  const socket = io();
  window._gameSocket = socket;

  socket.once('joinedLobby', async (data) => {
    await startGame(data, playerName);
  });

  socket.on('error', ({ message }) => {
    showStatus(message, true);
    playBtn.disabled = false;
    playBtn.textContent = '▶ PLAY';
    socket.disconnect();
  });

  socket.on('connect_error', () => {
    showStatus('Connection failed. Is the server running?', true);
    playBtn.disabled = false;
    playBtn.textContent = '▶ PLAY';
  });

  if (code) {
    socket.emit('joinByCode', { code, playerName });
  } else {
    socket.emit('requestLobby', { playerName });
  }
}

/** Hide home screen, show game, lazy-load game module and start. */
async function startGame(lobbyData, playerName) {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';

  document.getElementById('lobby-code').textContent = lobbyData.code;
  document.getElementById('player-count').textContent =
    `Players: ${lobbyData.playerCount}/${lobbyData.maxPlayers}`;

  const { Game } = await import('./game.js');
  const game = new Game(lobbyData, playerName);
  await game.init(document.getElementById('game-canvas-container'));
}
