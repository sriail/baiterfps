import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.muzzleFlash = null;
    this.gunModel = null;
    this.loader = new FBXLoader();
    this.loadGunModel();
  }

  async loadGunModel() {
    try {
      const fbx = await new Promise((resolve, reject) => {
        this.loader.load(
          '/guns/gun-m4a1/source/Gun_M41D.fbx',
          (object) => resolve(object),
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading gun model: ${percent.toFixed(0)}%`);
          },
          (error) => reject(error)
        );
      });

      console.log('Gun model loaded successfully');
      
      // Scale down the model to appropriate size
      fbx.scale.set(0.001, 0.001, 0.001);
      
      // Position and rotate the gun relative to camera
      fbx.position.set(0.15, -0.12, -0.3);
      fbx.rotation.set(0, Math.PI, 0);
      
      // Enable shadows
      fbx.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = false;
        }
      });
      
      this.gunModel = fbx;
      this.camera.add(this.gunModel);
      
      // Create muzzle flash at the barrel tip
      this.createMuzzleFlash();
      
    } catch (error) {
      console.error('Error loading gun model:', error);
      // Fallback to simple placeholder
      this.createSimpleGunModel();
    }
  }

  createSimpleGunModel() {
    // Fallback simple gun model if FBX fails to load
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
    this.createMuzzleFlash();
  }

  createMuzzleFlash() {
    if (!this.gunModel) return;
    
    // Create muzzle flash
    const flashGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0
    });
    this.muzzleFlash = new THREE.Mesh(flashGeometry, flashMaterial);
    
    // Position at barrel tip (adjust based on model)
    if (this.gunModel.type === 'Group') {
      // FBX model
      this.muzzleFlash.position.set(0.3, -0.05, -0.5);
    } else {
      // Simple model
      this.muzzleFlash.position.set(0.5, 0, -0.3);
    }
    
    this.gunModel.add(this.muzzleFlash);
    
    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa00, 0, 5);
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    this.gunModel.add(this.muzzleLight);
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
