import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeBackdrop() {
  const mountRef = useRef(null);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x060910, 42, 170);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260);
    camera.position.set(0, 8, 50);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x1a2a4a, 1.2);
    scene.add(ambient);

    const keyLight = new THREE.PointLight(0x00d4ff, 0.8, 180);
    keyLight.position.set(30, 20, 20);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x7c6fff, 0.6, 180);
    rimLight.position.set(-28, -14, 18);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(220, 44, 0x00d4ff, 0x163244);
    grid.position.y = -24;
    grid.material.transparent = true;
    grid.material.opacity = 0.08;
    scene.add(grid);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(18, 0.15, 16, 240),
      new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.25,
      })
    );
    ring.position.set(0, 2, -16);
    ring.rotation.x = Math.PI / 2.3;
    scene.add(ring);

    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
      })
    );
    scan.position.set(0, 40, -20);
    scene.add(scan);

    const nodeGroup = new THREE.Group();
    const nodes = [];
    const nodeGeometry = new THREE.IcosahedronGeometry(0.6, 0);
    const nodeCount = 30;
    for (let i = 0; i < nodeCount; i += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x00d4ff : 0x7c6fff,
        metalness: 0.9,
        roughness: 0.1,
        emissive: i % 2 === 0 ? 0x001a22 : 0x120f2b,
        emissiveIntensity: 0.2,
      });
      const mesh = new THREE.Mesh(nodeGeometry.clone(), material);
      mesh.scale.setScalar(THREE.MathUtils.randFloat(0.3, 0.8));
      mesh.position.set(
        THREE.MathUtils.randFloatSpread(120),
        THREE.MathUtils.randFloatSpread(90),
        THREE.MathUtils.randFloat(-40, -5)
      );
      mesh.userData = {
        speed: THREE.MathUtils.randFloat(0.0005, 0.0018),
        axis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
      };
      nodes.push(mesh);
      nodeGroup.add(mesh);
    }
    scene.add(nodeGroup);

    const lineGroup = new THREE.Group();
    scene.add(lineGroup);

    const buildConnections = () => {
      lineGroup.clear();
      const maxDistanceSq = 20 * 20;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i].position;
          const b = nodes[j].position;
          if (a.distanceToSquared(b) > maxDistanceSq) continue;
          const geometry = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
          const line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
              color: 0x00d4ff,
              transparent: true,
              opacity: 0.15,
            })
          );
          lineGroup.add(line);
        }
      }
    };
    buildConnections();
    const lineTimer = window.setInterval(buildConnections, 3000);

    let raf = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const onPointerMove = (event) => {
      const rect = host.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      mouseX = x * 2 - 1;
      mouseY = y * 2 - 1;
      targetTiltX = mouseY * 0.04;
      targetTiltY = mouseX * 0.04;
    };

    const onResize = () => {
      const width = host.clientWidth || window.innerWidth;
      const height = host.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    host.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', onResize);
    onResize();

    let scanOffset = 40;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!prefersReducedMotion) {
        const t = performance.now() * 0.0002;
        nodeGroup.children.forEach((node) => {
          node.rotation.x += node.userData.speed;
          node.rotation.y += node.userData.speed * 1.4;
          node.position.x += Math.sin(t + node.position.y * 0.01) * 0.01;
          node.position.y += Math.cos(t + node.position.x * 0.01) * 0.008;
        });
        ring.rotation.y += 0.001;
        scan.position.y = scanOffset;
        scanOffset -= 0.12;
        if (scanOffset < -40) scanOffset = 40;
        camera.rotation.x += (targetTiltX - camera.rotation.x) * 0.03;
        camera.rotation.y += (targetTiltY - camera.rotation.y) * 0.03;
        keyLight.position.y = 18 + Math.sin(t * 2.8) * 4;
        rimLight.position.x = -28 + Math.cos(t * 2.4) * 4;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(lineTimer);
      host.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((material) => material.dispose?.());
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
        opacity: 0.62,
      }}
      aria-hidden="true"
    />
  );
}
