import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class RemotePlayer {
  constructor(playerData, scene, gameMode) {
    this.scene = scene;
    this.data = playerData;
    this.gameMode = gameMode;
    this.loader = new FBXLoader();
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    
    // Create player mesh (will be replaced with animated model)
    this.createPlayerMesh();
    
    // Create name label
    this.createNameLabel();
    
    // Load animations asynchronously
    this.loadAnimations();
  }

  async loadAnimations() {
    try {
      // Load idle animation as the base model
      const idleAnimation = await this.loadFBX('/player/rifle aiming idle.fbx');
      
      if (idleAnimation) {
        // Remove simple mesh and use animated model
        if (this.mesh) {
          this.scene.remove(this.mesh);
        }
        
        // Scale and setup the model
        idleAnimation.scale.set(0.01, 0.01, 0.01);
        idleAnimation.position.set(
          this.data.position.x,
          this.data.position.y,
          this.data.position.z
        );
        
        // Enable shadows
        idleAnimation.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Apply team color to materials
            if (child.material && this.data.team) {
              const teamColor = this.data.team === 'alpha' ? 0x3366ff : 
                                this.data.team === 'omega' ? 0xff3333 : 0x888888;
              child.material = child.material.clone();
              child.material.color.setHex(teamColor);
            }
          }
        });
        
        this.mesh = idleAnimation;
        this.scene.add(this.mesh);
        
        // Re-add name label to new mesh
        if (this.nameLabel) {
          this.mesh.add(this.nameLabel);
        }
        
        // Setup animation mixer
        this.mixer = new THREE.AnimationMixer(this.mesh);
        
        // Play idle animation
        if (idleAnimation.animations && idleAnimation.animations.length > 0) {
          this.currentAction = this.mixer.clipAction(idleAnimation.animations[0]);
          this.currentAction.play();
        }
      }
    } catch (error) {
      console.warn('Could not load player animations, using simple model:', error);
    }
  }

  async loadFBX(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (object) => resolve(object),
        undefined,
        (error) => reject(error)
      );
    });
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

  update(playerData, deltaTime) {
    this.data = playerData;
    
    // Interpolate position (simplified - should use proper interpolation)
    this.mesh.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
    
    // Update rotation
    this.mesh.rotation.y = playerData.rotation.y;
    
    // Update animation mixer if available
    if (this.mixer && deltaTime) {
      this.mixer.update(deltaTime);
    }
    
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
