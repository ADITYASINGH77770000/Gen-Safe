import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeBackdrop() {
  const mountRef = useRef(null);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
    camera.position.z = 45;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x5db9ff, 0.55);
    scene.add(ambient);

    const pointA = new THREE.PointLight(0x48f0ff, 1.1, 140);
    pointA.position.set(22, 8, 28);
    scene.add(pointA);

    const pointB = new THREE.PointLight(0x7f6cff, 0.95, 140);
    pointB.position.set(-26, -10, 20);
    scene.add(pointB);

    const torus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(10, 2.1, 220, 26),
      new THREE.MeshStandardMaterial({
        color: 0xa6dbff,
        metalness: 0.68,
        roughness: 0.24,
        emissive: 0x04364d,
        emissiveIntensity: 0.35,
      })
    );
    torus.position.set(0, 2, -8);
    scene.add(torus);

    const wire = new THREE.Mesh(
      new THREE.TorusGeometry(19, 0.32, 18, 160),
      new THREE.MeshBasicMaterial({
        color: 0x39f4ff,
        transparent: true,
        opacity: 0.33,
      })
    );
    wire.position.set(8, -8, -20);
    wire.rotation.x = 0.7;
    scene.add(wire);

    const particleCount = 480;
    const pointsGeometry = new THREE.BufferGeometry();
    const points = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      points[i * 3 + 0] = (Math.random() - 0.5) * 120;
      points[i * 3 + 1] = (Math.random() - 0.5) * 90;
      points[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));

    const particles = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        color: 0x9be8ff,
        size: 0.28,
        transparent: true,
        opacity: 0.45,
      })
    );
    scene.add(particles);

    let raf = 0;
    const prefersReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches;

    const onResize = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    onResize();
    window.addEventListener('resize', onResize);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!prefersReducedMotion) {
        const t = performance.now() * 0.00035;
        torus.rotation.x += 0.0024;
        torus.rotation.y += 0.0027;
        wire.rotation.z -= 0.0018;
        particles.rotation.y += 0.0004;
        pointA.position.y = 8 + Math.sin(t * 3.1) * 4;
        pointB.position.x = -26 + Math.cos(t * 2.8) * 5;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose?.());
          } else {
            obj.material.dispose?.();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.5,
      }}
      aria-hidden="true"
    />
  );
}
