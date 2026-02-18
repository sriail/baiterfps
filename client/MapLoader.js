import * as THREE from 'three';

export class MapLoader {
  constructor(scene) {
    this.scene = scene;
    this.collisionMeshes = [];
  }

  loadMap(mapName) {
    // For now, create a simple placeholder map with ground and walls
    // In a full implementation, this would load the actual map files from the zip archives
    
    console.log(`Loading map: ${mapName}`);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x556B2F,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.collisionMeshes.push(ground);

    // Add some walls for cover
    this.createWall(0, 1.5, -20, 20, 3, 1, 0x8B4513);
    this.createWall(20, 1.5, 0, 1, 3, 20, 0x8B4513);
    this.createWall(-20, 1.5, 0, 1, 3, 20, 0x8B4513);
    this.createWall(0, 1.5, 20, 20, 3, 1, 0x8B4513);

    // Add some obstacles
    this.createBox(10, 1, 10, 3, 2, 3, 0x696969);
    this.createBox(-10, 1, 10, 3, 2, 3, 0x696969);
    this.createBox(10, 1, -10, 3, 2, 3, 0x696969);
    this.createBox(-10, 1, -10, 3, 2, 3, 0x696969);
    this.createBox(0, 1.5, 0, 4, 3, 4, 0xA0522D);

    // Add perimeter walls
    this.createWall(0, 2.5, -50, 100, 5, 1, 0x808080);
    this.createWall(0, 2.5, 50, 100, 5, 1, 0x808080);
    this.createWall(-50, 2.5, 0, 1, 5, 100, 0x808080);
    this.createWall(50, 2.5, 0, 1, 5, 100, 0x808080);
  }

  createWall(x, y, z, width, height, depth, color) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.7,
      metalness: 0.3
    });
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.collisionMeshes.push(wall);
    return wall;
  }

  createBox(x, y, z, width, height, depth, color) {
    return this.createWall(x, y, z, width, height, depth, color);
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
