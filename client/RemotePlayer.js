import * as THREE from 'three';

export class RemotePlayer {
  constructor(playerData, scene, gameMode) {
    this.scene = scene;
    this.data = playerData;
    this.gameMode = gameMode;
    
    // Create player capsule
    this.createPlayerMesh();
    
    // Create name label
    this.createNameLabel();
  }

  createPlayerMesh() {
    const group = new THREE.Group();
    
    // Body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.4, 16);
    const teamColor = this.data.team === 'alpha' ? 0x3366ff : 
                      this.data.team === 'omega' ? 0xff3333 : 0x888888;
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: teamColor,
      roughness: 0.7,
      metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xFFDBAC,
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);
    
    this.mesh = group;
    this.mesh.position.set(
      this.data.position.x,
      this.data.position.y,
      this.data.position.z
    );
    
    this.scene.add(this.mesh);
  }

  createNameLabel() {
    // Create a simple sprite for the name label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(this.data.name, canvas.width / 2, 25);
    
    // Health bar
    context.fillStyle = 'rgba(255, 0, 0, 0.8)';
    context.fillRect(28, 35, 200, 10);
    
    const healthPercent = this.data.health / 100;
    context.fillStyle = 'rgba(0, 255, 0, 0.8)';
    context.fillRect(28, 35, 200 * healthPercent, 10);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    
    this.nameLabel = new THREE.Sprite(spriteMaterial);
    this.nameLabel.scale.set(2, 0.5, 1);
    this.nameLabel.position.y = 2.5;
    this.mesh.add(this.nameLabel);
  }

  update(playerData) {
    this.data = playerData;
    
    // Interpolate position (simplified - should use proper interpolation)
    this.mesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
    
    // Update rotation
    this.mesh.rotation.y = playerData.rotation.y;
    
    // Update name label with health
    this.updateNameLabel();
    
    // Hide if not alive
    this.mesh.visible = playerData.isAlive;
  }

  updateNameLabel() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText(this.data.name, canvas.width / 2, 25);
    
    // Health bar
    context.fillStyle = 'rgba(255, 0, 0, 0.8)';
    context.fillRect(28, 35, 200, 10);
    
    const healthPercent = Math.max(0, this.data.health) / 100;
    context.fillStyle = 'rgba(0, 255, 0, 0.8)';
    context.fillRect(28, 35, 200 * healthPercent, 10);
    
    const texture = new THREE.CanvasTexture(canvas);
    this.nameLabel.material.map = texture;
    this.nameLabel.material.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      
      // Dispose geometries and materials
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
  }
}
