import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MapLoader {
  constructor(scene) {
    this.scene = scene;
    this.collisionMeshes = [];
    this.loader = new GLTFLoader();
    this.currentMap = null;
  }

  async loadMap(mapName) {
    console.log(`Loading map: ${mapName}`);
    
    // Remove previous map if exists
    if (this.currentMap) {
      this.scene.remove(this.currentMap);
      this.collisionMeshes = [];
    }

    // Map the map name to the GLTF file path
    const mapPaths = {
      'snow_town': '/snow_town/scene.gltf',
      'old_town': '/old_town/scene.gltf',
      'arabic_city': '/arabic_city/scene.gltf'
    };

    const mapPath = mapPaths[mapName] || mapPaths['snow_town'];

    return new Promise((resolve, reject) => {
      this.loader.load(
        mapPath,
        (gltf) => {
          console.log('Map loaded successfully:', mapName);
          this.currentMap = gltf.scene;
          
          // Scale and position the map appropriately
          this.currentMap.scale.set(1, 1, 1);
          this.currentMap.position.set(0, 0, 0);
          
          // Enable shadows on all meshes and collect for collision
          this.currentMap.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Add to collision meshes
              this.collisionMeshes.push(child);
              
              // Ensure materials are set up properly
              if (child.material) {
                child.material.needsUpdate = true;
              }
            }
          });
          
          this.scene.add(this.currentMap);
          resolve(this.currentMap);
        },
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`Loading map: ${percent.toFixed(0)}%`);
        },
        (error) => {
          console.error('Error loading map:', error);
          reject(error);
        }
      );
    });
  }

  checkCollision(position, radius = 0.5) {
    // Simple AABB collision check
    for (const mesh of this.collisionMeshes) {
      const box = new THREE.Box3().setFromObject(mesh);
      
      // Expand box by player radius
      box.expandByScalar(radius);
      
      if (box.containsPoint(position)) {
        return true;
      }
    }
    return false;
  }

  getCollisionMeshes() {
    return this.collisionMeshes;
  }
}
