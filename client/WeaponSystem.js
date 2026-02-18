import * as THREE from 'three';

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.muzzleFlash = null;
    this.gunModel = null;
    this.createGunModel();
  }

  createGunModel() {
    // Simple gun model placeholder (in full implementation, load the M4A1 model)
    const group = new THREE.Group();
    
    // Barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.8
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.25, 0, -0.3);
    group.add(barrel);
    
    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.4);
    const body = new THREE.Mesh(bodyGeometry, barrelMaterial);
    body.position.set(0, 0, -0.1);
    group.add(body);
    
    // Stock
    const stockGeometry = new THREE.BoxGeometry(0.1, 0.06, 0.3);
    const stockMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x654321,
      roughness: 0.8
    });
    const stock = new THREE.Mesh(stockGeometry, stockMaterial);
    stock.position.set(0, 0, 0.2);
    group.add(stock);
    
    // Position relative to camera
    group.position.set(0.3, -0.2, -0.5);
    
    this.gunModel = group;
    this.camera.add(this.gunModel);
    
    // Create muzzle flash
    const flashGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0
    });
    this.muzzleFlash = new THREE.Mesh(flashGeometry, flashMaterial);
    this.muzzleFlash.position.set(0.5, 0, -0.3);
    group.add(this.muzzleFlash);
    
    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 5);
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    group.add(this.muzzleLight);
  }

  shoot() {
    // Show muzzle flash
    if (this.muzzleFlash && this.muzzleLight) {
      this.muzzleFlash.material.opacity = 1;
      this.muzzleLight.intensity = 2;
      
      setTimeout(() => {
        this.muzzleFlash.material.opacity = 0;
        this.muzzleLight.intensity = 0;
      }, 60);
    }
    
    // Recoil animation
    if (this.gunModel) {
      this.gunModel.position.z += 0.05;
      setTimeout(() => {
        this.gunModel.position.z = -0.5;
      }, 100);
    }
  }

  update(deltaTime) {
    // Gun sway or idle animation could go here
  }
}
