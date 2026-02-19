import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  createImpactParticles(position, normal, surfaceType = 'concrete') {
    const particleCount = 8;
    const color = surfaceType === 'metal' ? 0xffff00 : 0x888888;
    
    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.SphereGeometry(0.02, 4, 4);
      const material = new THREE.MeshBasicMaterial({ color: color });
      const particle = new THREE.Mesh(geometry, material);
      
      particle.position.copy(position);
      
      // Random velocity in hemisphere aligned with normal
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      
      // Align with surface normal
      if (normal) {
        velocity.add(normal.multiplyScalar(Math.random()));
      }
      
      particle.userData.velocity = velocity;
      particle.userData.lifetime = 0;
      particle.userData.maxLifetime = 0.4;
      
      this.scene.add(particle);
      this.particles.push(particle);
    }
  }

  createBloodEffect(position) {
    const particleCount = 6;
    
    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.SphereGeometry(0.03, 4, 4);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.8
      });
      const particle = new THREE.Mesh(geometry, material);
      
      particle.position.copy(position);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      );
      
      particle.userData.velocity = velocity;
      particle.userData.lifetime = 0;
      particle.userData.maxLifetime = 0.3;
      
      this.scene.add(particle);
      this.particles.push(particle);
    }
  }

  createShellCasing(position, direction) {
    const geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xffaa00,
      roughness: 0.3,
      metalness: 0.8
    });
    const casing = new THREE.Mesh(geometry, material);
    
    casing.position.copy(position);
    casing.rotation.z = Math.PI / 2;
    
    // Eject velocity (up and to the right)
    const velocity = new THREE.Vector3(
      direction.x * 0.5 + Math.random() * 0.5,
      3 + Math.random(),
      direction.z * 0.5 + Math.random() * 0.5
    );
    
    casing.userData.velocity = velocity;
    casing.userData.angularVelocity = new THREE.Vector3(
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10
    );
    casing.userData.lifetime = 0;
    casing.userData.maxLifetime = 2;
    casing.userData.bounced = false;
    
    this.scene.add(casing);
    this.particles.push(casing);
  }

  update(deltaTime) {
    const gravity = -20;
    
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const data = particle.userData;
      
      data.lifetime += deltaTime;
      
      // Update position
      particle.position.add(data.velocity.clone().multiplyScalar(deltaTime));
      
      // Apply gravity
      data.velocity.y += gravity * deltaTime;
      
      // Update rotation for shell casings
      if (data.angularVelocity) {
        particle.rotation.x += data.angularVelocity.x * deltaTime;
        particle.rotation.y += data.angularVelocity.y * deltaTime;
        particle.rotation.z += data.angularVelocity.z * deltaTime;
        
        // Bounce off ground once
        if (particle.position.y <= 0 && !data.bounced) {
          data.velocity.y = Math.abs(data.velocity.y) * 0.3;
          data.bounced = true;
        }
        
        if (particle.position.y < 0) {
          particle.position.y = 0;
          data.velocity.y = 0;
          data.velocity.x *= 0.9;
          data.velocity.z *= 0.9;
        }
      }
      
      // Fade out
      if (particle.material.transparent) {
        particle.material.opacity = 1 - (data.lifetime / data.maxLifetime);
      }
      
      // Remove expired particles
      if (data.lifetime >= data.maxLifetime) {
        this.scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
