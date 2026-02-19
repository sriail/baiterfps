export class HUDManager {
  constructor(game) {
    this.game = game;
    this.killFeedEntries = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Respawn button
    const respawnButton = document.getElementById('respawnButton');
    if (respawnButton) {
      respawnButton.addEventListener('click', () => {
        this.game.socket.emit('player:respawn');
        this.hideDeathScreen();
      });
    }

    // Play Again button
    const playAgainButton = document.getElementById('playAgainButton');
    if (playAgainButton) {
      playAgainButton.addEventListener('click', () => {
        this.hideEndScreen();
        this.game.socket.emit('player:join');
        this.game.isRunning = true;
        this.game.animate();
      });
    }
  }

  updateHealth(health) {
    const healthFill = document.getElementById('healthFill');
    const healthText = document.getElementById('healthText');
    
    if (healthFill) {
      healthFill.style.width = `${health}%`;
    }
    
    if (healthText) {
      healthText.textContent = `${Math.max(0, health)} HP`;
    }
  }

  updateAmmo(current, reserve) {
    const ammoCount = document.getElementById('ammoCount');
    if (ammoCount) {
      ammoCount.textContent = `${current} / ${reserve}`;
    }
  }

  showReloadBar() {
    const reloadBar = document.getElementById('reloadBar');
    const reloadText = document.getElementById('reloadText');
    
    if (reloadBar) reloadBar.style.display = 'block';
    if (reloadText) reloadText.style.display = 'block';
    
    // Animate reload bar
    const reloadFill = document.getElementById('reloadFill');
    if (reloadFill) {
      reloadFill.style.transition = 'none';
      reloadFill.style.width = '0%';
      
      setTimeout(() => {
        reloadFill.style.transition = 'width 2.4s linear';
        reloadFill.style.width = '100%';
      }, 10);
    }
  }

  hideReloadBar() {
    const reloadBar = document.getElementById('reloadBar');
    const reloadText = document.getElementById('reloadText');
    
    if (reloadBar) reloadBar.style.display = 'none';
    if (reloadText) reloadText.style.display = 'none';
  }

  updateTimer(timeInSeconds) {
    const matchTimer = document.getElementById('matchTimer');
    if (matchTimer) {
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = timeInSeconds % 60;
      matchTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Add warning style if less than 60 seconds
      if (timeInSeconds < 60) {
        matchTimer.classList.add('warning');
      } else {
        matchTimer.classList.remove('warning');
      }
    }
  }

  showHitMarker() {
    const hitMarker = document.getElementById('hitMarker');
    if (hitMarker) {
      hitMarker.classList.add('show');
      setTimeout(() => {
        hitMarker.classList.remove('show');
      }, 200);
    }
  }

  addKillFeed(killerName, victimName) {
    const killFeed = document.getElementById('killFeed');
    if (!killFeed) return;

    const entry = document.createElement('div');
    entry.className = 'killEntry';
    entry.textContent = `${killerName} → ${victimName}`;
    
    killFeed.insertBefore(entry, killFeed.firstChild);
    this.killFeedEntries.push(entry);

    // Remove after 4 seconds
    setTimeout(() => {
      entry.classList.add('fading');
      setTimeout(() => {
        entry.remove();
        const index = this.killFeedEntries.indexOf(entry);
        if (index > -1) {
          this.killFeedEntries.splice(index, 1);
        }
      }, 500);
    }, 4000);

    // Keep only last 5 entries
    while (this.killFeedEntries.length > 5) {
      const oldEntry = this.killFeedEntries.shift();
      oldEntry.remove();
    }
  }

  updateTeamScores(alphaScore, omegaScore) {
    const teamScores = document.getElementById('teamScores');
    const alphaScoreElem = document.getElementById('alphaScore');
    const omegaScoreElem = document.getElementById('omegaScore');
    
    if (teamScores) teamScores.style.display = 'block';
    if (alphaScoreElem) alphaScoreElem.textContent = alphaScore;
    if (omegaScoreElem) omegaScoreElem.textContent = omegaScore;
  }

  showDeathScreen(killerName) {
    const deathScreen = document.getElementById('deathScreen');
    const killerNameElem = document.getElementById('killerName');
    
    if (deathScreen) deathScreen.classList.add('show');
    if (killerNameElem) killerNameElem.textContent = `Killed by: ${killerName}`;
    
    // Release pointer lock
    document.exitPointerLock();
  }

  hideDeathScreen() {
    const deathScreen = document.getElementById('deathScreen');
    if (deathScreen) deathScreen.classList.remove('show');
  }

  showEndScreen(scoreboard) {
    const endScreen = document.getElementById('endScreen');
    const winnerText = document.getElementById('winnerText');
    const leaderboard = document.getElementById('leaderboard');
    
    if (endScreen) endScreen.classList.add('show');
    if (winnerText) {
      let winnerDisplay = scoreboard.winner;
      if (scoreboard.winner === 'DRAW') {
        winnerDisplay = 'DRAW';
      } else if (scoreboard.mode === 'teams') {
        winnerDisplay = `${scoreboard.winner} Wins!`;
      } else {
        winnerDisplay = `${scoreboard.winner} Wins!`;
      }
      winnerText.textContent = winnerDisplay;
    }
    
    // Populate leaderboard
    if (leaderboard) {
      // Clear existing rows except header
      const existingRows = leaderboard.querySelectorAll('.leaderboardRow');
      for (let i = 1; i < existingRows.length; i++) {
        existingRows[i].remove();
      }
      
      // Add player rows
      scoreboard.players.forEach((player) => {
        const row = document.createElement('div');
        row.className = 'leaderboardRow';
        row.innerHTML = `
          <div>#${player.rank}</div>
          <div>${player.name}</div>
          <div>${player.kills}</div>
          <div>${player.deaths}</div>
          <div>${player.kd}</div>
        `;
        leaderboard.appendChild(row);
      });
    }
    
    // Auto-redirect after 30 seconds
    setTimeout(() => {
      if (document.getElementById('endScreen').classList.contains('show')) {
        this.hideEndScreen();
        this.game.socket.emit('player:join');
        this.game.isRunning = true;
        this.game.animate();
      }
    }, 30000);
  }

  hideEndScreen() {
    const endScreen = document.getElementById('endScreen');
    if (endScreen) endScreen.classList.remove('show');
  }
}
