const ADJECTIVES = [
  'Shadow', 'Ghost', 'Iron', 'Steel', 'Crimson', 'Dark', 'Silent', 'Storm',
  'Neon', 'Viper', 'Frost', 'Blaze', 'Toxic', 'Rapid', 'Savage', 'Rusty',
  'Grim', 'Hyper', 'Rogue', 'Ultra', 'Cyber', 'Phantom', 'Night', 'Apex',
];

const NOUNS = [
  'Wolf', 'Eagle', 'Hawk', 'Reaper', 'Hunter', 'Striker', 'Falcon', 'Panther',
  'Viper', 'Cobra', 'Raven', 'Titan', 'Ghost', 'Ranger', 'Specter', 'Wraith',
  'Demon', 'Sniper', 'Blade', 'Shark', 'Fox', 'Bear', 'Lion', 'Dragon',
];

/**
 * Returns a random name like "ShadowWolf" or "IronHawk".
 */
export function randomName() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}${noun}`;
}
