#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resourcesDir = join(__dirname, 'src', 'recources');

async function extractZip(zipFile, targetDir) {
  const zipPath = join(resourcesDir, zipFile);
  const targetPath = join(resourcesDir, targetDir);
  
  if (existsSync(targetPath)) {
    console.log(`✓ ${targetDir} already extracted`);
    return;
  }
  
  console.log(`Extracting ${zipFile}...`);
  mkdirSync(targetPath, { recursive: true });
  
  try {
    await execAsync(`unzip -q "${zipPath}" -d "${targetPath}"`);
    console.log(`✓ Extracted ${zipFile}`);
  } catch (error) {
    console.error(`✗ Failed to extract ${zipFile}:`, error.message);
  }
}

async function extractGunZip() {
  const zipPath = join(resourcesDir, 'guns', 'gun-m4a1.zip');
  const targetPath = join(resourcesDir, 'guns', 'gun-m4a1');
  
  if (existsSync(targetPath)) {
    console.log(`✓ gun-m4a1 already extracted`);
    return;
  }
  
  console.log(`Extracting gun-m4a1.zip...`);
  mkdirSync(targetPath, { recursive: true });
  
  try {
    await execAsync(`unzip -q "${zipPath}" -d "${targetPath}"`);
    console.log(`✓ Extracted gun-m4a1.zip`);
  } catch (error) {
    console.error(`✗ Failed to extract gun-m4a1.zip:`, error.message);
  }
}

async function main() {
  console.log('Setting up game assets...\n');
  
  await extractZip('snow_town.zip', 'snow_town');
  await extractZip('old_town.zip', 'old_town');
  await extractZip('arabic_city.zip', 'arabic_city');
  await extractGunZip();
  
  console.log('\n✓ Asset setup complete!');
}

main().catch(console.error);
