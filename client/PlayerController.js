import * as THREE from 'three';

export class PlayerController {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.position = new THREE.Vector3(0, 1.7, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isOnGround = false;
  }

  update(deltaTime) {
    // Update camera position based on server-synced position
    // In a real implementation, we'd do client-side prediction here
    this.camera.position.copy(this.position);
    this.camera.rotation.copy(this.rotation);
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
  }

  setRotation(x, y) {
    this.rotation.set(x, y, 0);
  }
}
