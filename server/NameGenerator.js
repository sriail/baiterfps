export class NameGenerator {
  constructor() {
    this.adjectives = [
      'Silent', 'Iron', 'Ghost', 'Crimson', 'Shadow', 'Steel', 'Dark', 'Thunder',
      'Lightning', 'Frozen', 'Burning', 'Swift', 'Deadly', 'Rogue', 'Venom',
      'Phantom', 'Storm', 'Night', 'Arctic', 'Blazing', 'Mystic', 'Savage',
      'Mighty', 'Noble', 'Ancient', 'Wild', 'Fierce', 'Bold', 'Brave', 'Lunar',
      'Solar', 'Cosmic', 'Chaos', 'Primal', 'Stealth', 'Alpha', 'Omega', 'Delta',
      'Viper', 'Razor', 'Titan', 'Demon', 'Angel', 'Silver', 'Golden', 'Jade'
    ];

    this.nouns = [
      'Hawk', 'Viper', 'Wraith', 'Fox', 'Wolf', 'Eagle', 'Dragon', 'Tiger',
      'Panther', 'Falcon', 'Raven', 'Bear', 'Lion', 'Cobra', 'Reaper', 'Hunter',
      'Warrior', 'Ranger', 'Sniper', 'Soldier', 'Ghost', 'Phantom', 'Shadow',
      'Blade', 'Striker', 'Thunder', 'Storm', 'Flame', 'Frost', 'Knight',
      'Guardian', 'Sentinel', 'Warden', 'Paladin', 'Champion', 'Legend', 'Hero',
      'Assassin', 'Ninja', 'Samurai', 'Spartan', 'Titan', 'Giant', 'Daemon', 'Spirit'
    ];

    this.usedNames = new Set();
  }

  generateName() {
    let name;
    let attempts = 0;
    
    do {
      const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
      const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
      name = `${adjective} ${noun}`;
      attempts++;
    } while (this.usedNames.has(name) && attempts < 100);

    this.usedNames.add(name);
    return name;
  }

  releaseName(name) {
    this.usedNames.delete(name);
  }
}
