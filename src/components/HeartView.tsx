import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ANCHOR_DATABASE } from '../constants';
import { LeadBeats } from '../types';

interface HeartViewProps {
  onCoordUpdate: (coord: THREE.Vector3, beats: LeadBeats | null) => void;
  isHovering: boolean;
  setIsHovering: (hover: boolean) => void;
  clippingValue: number;
  isClippingActive: boolean;
}

const HeartView: React.FC<HeartViewProps> = ({ 
  onCoordUpdate, 
  isHovering, 
  setIsHovering,
  clippingValue,
  isClippingActive
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const heartGroupRef = useRef<THREE.Group | null>(null);
  const laserPointerRef = useRef<THREE.Mesh | null>(null);
  const fleshMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const clippingPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 0, -1), 2));
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const clickableMeshesRef = useRef<THREE.Mesh[]>([]);
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  const isHoveringRef = useRef(isHovering);

  useEffect(() => {
    isHoveringRef.current = isHovering;
  }, [isHovering]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050a, 0.05);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      40,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 10.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.localClippingEnabled = true;
    
    // Clear container to prevent duplicates
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x111122, 0.4));
    const dirLight = new THREE.DirectionalLight(0xfff0e6, 1.8);
    dirLight.position.set(4, 10, 6);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x88aaff, 1.5);
    rimLight.position.set(-6, 2, -5);
    scene.add(rimLight);
    const pointLight = new THREE.PointLight(0xffffff, 1.0, 20);
    pointLight.position.set(2, 3, 7);
    scene.add(pointLight);

    const heartGroup = new THREE.Group();
    scene.add(heartGroup);
    heartGroupRef.current = heartGroup;

    // Laser Pointer
    const pointerGeo = new THREE.SphereGeometry(0.06, 16, 16);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const laserPointer = new THREE.Mesh(pointerGeo, pointerMat);
    const haloGeo = new THREE.RingGeometry(0.08, 0.12, 32);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    laserPointer.add(halo);
    laserPointer.visible = false;
    scene.add(laserPointer);
    laserPointerRef.current = laserPointer;

    clickableMeshesRef.current = [];

    // Materials
    const fleshMat = new THREE.MeshPhysicalMaterial({
      color: 0x8a1a1a,
      emissive: 0x220000,
      roughness: 0.4,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.2,
      sheen: 1.0,
      sheenColor: 0xff8888,
      clippingPlanes: [clippingPlaneRef.current],
      clipShadows: true,
      side: THREE.DoubleSide, // Show interior
    });
    fleshMatRef.current = fleshMat;

    const vesselMatRed = new THREE.MeshPhysicalMaterial({
      color: 0x9c1a1a,
      roughness: 0.5,
      metalness: 0.1,
      clearcoat: 0.5,
      clippingPlanes: [clippingPlaneRef.current],
    });

    const vesselMatBlue = new THREE.MeshPhysicalMaterial({
      color: 0x1a3a8a,
      roughness: 0.5,
      metalness: 0.1,
      clearcoat: 0.5,
      clippingPlanes: [clippingPlaneRef.current],
    });

    fleshMat.onBeforeCompile = (shader) => {
      shader.uniforms.waveTime = { value: 0.0 };
      shader.uniforms.waveOrigin = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.isVPC = { value: 0.0 };
      shader.uniforms.uTime = { value: 0.0 };
      fleshMat.userData.shader = shader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWorldPos;`
      ).replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWorldPos;\nuniform float waveTime;\nuniform vec3 waveOrigin;\nuniform float isVPC;\nuniform float uTime;
        
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float noise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                         mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                         mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        `
      ).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float n = noise(vWorldPos * 1.5 + 10.0);
         float fatMask = smoothstep(0.65, 0.85, n);
         vec3 fatColor = vec3(0.95, 0.9, 0.6);
         diffuseColor.rgb = mix(diffuseColor.rgb, fatColor, fatMask * 0.5);

         if (isVPC > 0.5) {
             float dist = distance(vWorldPos, waveOrigin);
             float waveFront = waveTime * 8.0; 
             float bandWidth = 0.8; 
             float intensity = smoothstep(waveFront + bandWidth, waveFront, dist) * smoothstep(waveFront - bandWidth, waveFront, dist);
             float trailing = smoothstep(waveFront, waveFront - 2.0, dist) * 0.2;
             vec3 activationColor = mix(vec3(1.0, 0.9, 0.2), vec3(1.0, 0.3, 0.1), intensity);
             float totalEffect = max(intensity * 1.5, trailing);
             diffuseColor.rgb = mix(diffuseColor.rgb, activationColor, clamp(totalEffect, 0.0, 0.9));
         }
        `
      );
    };

    const deformGeometry = (geometry: THREE.BufferGeometry, scale: number, frequency: number, taper: boolean = false) => {
      const pos = geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        
        // Subtle taper for organic conical shape
        if (taper) {
          const taperFactor = 0.5 + ((v.y + 2.0) / 4.0) * 0.5; 
          v.x *= taperFactor;
          v.z *= taperFactor;
        }

        const noise = (Math.sin(v.x * frequency) + Math.cos(v.y * frequency) + Math.sin(v.z * frequency)) * 0.33;
        v.addScaledVector(v.clone().normalize(), noise * scale);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    };

    const offsetGroup = new THREE.Group();
    
    // Main Heart Body - Ventricles
    const lvGeom = new THREE.SphereGeometry(1.8, 64, 64);
    deformGeometry(lvGeom, 0.1, 3, true);
    const lv = new THREE.Mesh(lvGeom, fleshMat);
    lv.scale.set(1.1, 1.5, 1.0);
    lv.position.set(0.5, -0.6, -0.2);
    lv.rotation.set(0.1, 0, -0.2);
    offsetGroup.add(lv);
    clickableMeshesRef.current.push(lv);

    const rvGeom = new THREE.SphereGeometry(1.7, 64, 64);
    deformGeometry(rvGeom, 0.1, 3, true);
    const rv = new THREE.Mesh(rvGeom, fleshMat);
    rv.scale.set(1.2, 1.3, 0.8);
    rv.position.set(-0.6, -0.4, 0.4);
    rv.rotation.set(0.1, 0, 0.1);
    offsetGroup.add(rv);
    clickableMeshesRef.current.push(rv);

    // Atria
    const raGeom = new THREE.SphereGeometry(1.2, 32, 32);
    deformGeometry(raGeom, 0.15, 4);
    const ra = new THREE.Mesh(raGeom, fleshMat);
    ra.position.set(-1.1, 1.0, 0.0);
    offsetGroup.add(ra);

    const laGeom = new THREE.SphereGeometry(1.1, 32, 32);
    deformGeometry(laGeom, 0.15, 4);
    const la = new THREE.Mesh(laGeom, fleshMat);
    la.position.set(0.8, 1.1, -0.6);
    offsetGroup.add(la);

    // Major Vessels
    // Aorta
    const aortaCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0.2, 0.8, -0.1),
      new THREE.Vector3(0.2, 4.0, -0.1),
      new THREE.Vector3(2.2, 4.0, -1.5),
      new THREE.Vector3(2.2, -3.0, -2.5)
    );
    const aortaGeom = new THREE.TubeGeometry(aortaCurve, 40, 0.5, 16, false);
    const aorta = new THREE.Mesh(aortaGeom, vesselMatRed);
    offsetGroup.add(aorta);

    // Aortic Branches
    const branchData = [
      { start: new THREE.Vector3(0.5, 3.9, -0.2), end: new THREE.Vector3(0.5, 4.8, -0.2) },
      { start: new THREE.Vector3(1.1, 4.0, -0.6), end: new THREE.Vector3(1.1, 4.9, -0.6) },
      { start: new THREE.Vector3(1.7, 3.9, -1.1), end: new THREE.Vector3(1.7, 4.8, -1.1) },
    ];
    branchData.forEach(d => {
      const bCurve = new THREE.LineCurve3(d.start, d.end);
      const bGeom = new THREE.TubeGeometry(bCurve, 2, 0.14, 8, false);
      const b = new THREE.Mesh(bGeom, vesselMatRed);
      offsetGroup.add(b);
    });

    // Pulmonary Artery
    const paCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-0.4, 0.8, 0.7),
      new THREE.Vector3(-0.4, 3.2, 0.7),
      new THREE.Vector3(-2.2, 3.2, 0.0),
      new THREE.Vector3(-3.2, 2.2, -0.5)
    );
    const paGeom = new THREE.TubeGeometry(paCurve, 30, 0.45, 16, false);
    const pa = new THREE.Mesh(paGeom, vesselMatBlue);
    offsetGroup.add(pa);

    // Superior Vena Cava
    const svcCurve = new THREE.LineCurve3(new THREE.Vector3(-1.4, 1.0, -0.3), new THREE.Vector3(-1.4, 3.2, -0.3));
    const svcGeom = new THREE.TubeGeometry(svcCurve, 5, 0.4, 16, false);
    const svc = new THREE.Mesh(svcGeom, vesselMatBlue);
    offsetGroup.add(svc);

    // Inferior Vena Cava
    const ivcCurve = new THREE.LineCurve3(new THREE.Vector3(-1.4, -0.5, -0.3), new THREE.Vector3(-1.4, -2.5, -0.3));
    const ivcGeom = new THREE.TubeGeometry(ivcCurve, 5, 0.4, 16, false);
    const ivc = new THREE.Mesh(ivcGeom, vesselMatBlue);
    offsetGroup.add(ivc);

    // Coronary Vessels
    const addCoronary = (points: THREE.Vector3[], color: number, thickness: number = 0.07) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const geom = new THREE.TubeGeometry(curve, 30, thickness, 8, false);
      const mat = new THREE.MeshPhysicalMaterial({ 
        color, 
        roughness: 0.2, 
        metalness: 0.1, 
        clearcoat: 1.0,
        clippingPlanes: [clippingPlaneRef.current]
      });
      const mesh = new THREE.Mesh(geom, mat);
      offsetGroup.add(mesh);
    };

    // LAD
    addCoronary([
      new THREE.Vector3(0.1, 0.8, 0.8),
      new THREE.Vector3(0.0, -0.2, 1.2),
      new THREE.Vector3(-0.4, -1.4, 1.5),
      new THREE.Vector3(-0.9, -2.6, 1.2),
    ], 0xbd2a2a, 0.09);

    // RCA
    addCoronary([
      new THREE.Vector3(-0.9, 0.6, 0.8),
      new THREE.Vector3(-1.5, 0.0, 1.1),
      new THREE.Vector3(-1.9, -1.0, 0.7),
      new THREE.Vector3(-1.7, -2.2, -0.1),
    ], 0xbd2a2a, 0.08);

    // Cardiac Veins
    addCoronary([
      new THREE.Vector3(0.7, 0.3, 1.0),
      new THREE.Vector3(0.9, -1.0, 1.2),
      new THREE.Vector3(0.6, -2.2, 0.9),
    ], 0x2a4abd, 0.06);

    // Small branching vessels
    for (let i = 0; i < 5; i++) {
      const startX = (Math.random() - 0.5) * 2;
      const startY = (Math.random() - 0.5) * 2;
      addCoronary([
        new THREE.Vector3(startX, startY, 1.2),
        new THREE.Vector3(startX + 0.3, startY - 0.5, 1.4),
      ], 0xbd2a2a, 0.03);
    }

    // RVOT (Right Ventricular Outflow Tract)
    const rvotGeom = new THREE.SphereGeometry(0.8, 32, 32);
    deformGeometry(rvotGeom, 0.05, 5);
    const rvot = new THREE.Mesh(rvotGeom, fleshMat);
    rvot.position.set(-0.4, 1.0, 0.7);
    rvot.scale.set(1.2, 1.0, 1.0);
    offsetGroup.add(rvot);
    clickableMeshesRef.current.push(rvot);

    // LVOT (Left Ventricular Outflow Tract)
    const lvotGeom = new THREE.SphereGeometry(0.7, 32, 32);
    deformGeometry(lvotGeom, 0.05, 5);
    const lvot = new THREE.Mesh(lvotGeom, fleshMat);
    lvot.position.set(0.2, 1.2, -0.1);
    lvot.scale.set(1.0, 1.2, 1.0);
    offsetGroup.add(lvot);
    clickableMeshesRef.current.push(lvot);

    offsetGroup.position.set(0, 0.8, 0);
    offsetGroup.scale.setScalar(0.8);
    heartGroup.add(offsetGroup);
    heartGroup.rotation.y = 0.4;
    heartGroup.rotation.x = 0.1;

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const timeNow = Date.now();
      const progress = (timeNow % 1000) / 1000;

      if (laserPointerRef.current && laserPointerRef.current.visible) {
        const halo = laserPointerRef.current.children[0] as THREE.Mesh;
        halo.scale.setScalar(1 + Math.sin(timeNow * 0.01) * 0.2);
      }

      const squeeze = Math.exp(-Math.pow((progress - 0.35) * 12.0, 2.0));
      const pulseScale = 1.0 - squeeze * 0.08;
      if (!isDraggingRef.current && heartGroupRef.current) {
        heartGroupRef.current.scale.set(pulseScale, pulseScale, pulseScale);
        heartGroupRef.current.rotation.y += 0.0005;
      }

      if (fleshMatRef.current?.userData.shader && isHoveringRef.current) {
        let shaderTime = 0.0;
        if (progress >= 0.3) {
          shaderTime = (progress - 0.3) * 2.0;
        }
        fleshMatRef.current.userData.shader.uniforms.waveTime.value = shaderTime;
        fleshMatRef.current.userData.shader.uniforms.uTime.value = timeNow * 0.001;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    const handleWindowMouseUp = () => {
      isDraggingRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = isHovering ? 'crosshair' : 'grab';
      }
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (clippingPlaneRef.current) {
      // Adjust plane constant based on clippingValue
      // Heart is roughly from Z=-2 to Z=2
      // clippingValue 1.0 -> constant = 5 (no clip)
      // clippingValue 0.0 -> constant = -5 (all clip)
      const constant = (clippingValue - 0.5) * 6;
      clippingPlaneRef.current.constant = isClippingActive ? constant : 10;
    }
  }, [clippingValue, isClippingActive]);

  const calculateDynamicECG = (hitPoint: THREE.Vector3) => {
    let totalWeight = 0;
    const weights: { key: string; w: number }[] = [];
    const anchors = Object.keys(ANCHOR_DATABASE).filter((k) => k !== 'Normal');
    const p = 3.0;

    anchors.forEach((key) => {
      const anchorPos = ANCHOR_DATABASE[key].pos;
      if (!anchorPos) return;
      const dist = hitPoint.distanceTo(anchorPos);
      const w = 1.0 / (Math.pow(dist, p) + 0.001);
      weights.push({ key, w });
      totalWeight += w;
    });

    const dynamicBeats: LeadBeats = {};
    const leads = Object.keys(ANCHOR_DATABASE['Normal'].beats);

    leads.forEach((lead) => {
      dynamicBeats[lead] = { q: 0, r: 0, s: 0, t: 0 };
      weights.forEach((item) => {
        const normW = item.w / totalWeight;
        const anchorBeat = ANCHOR_DATABASE[item.key].beats[lead];
        dynamicBeats[lead].q += anchorBeat.q * normW;
        dynamicBeats[lead].r += anchorBeat.r * normW;
        dynamicBeats[lead].s += anchorBeat.s * normW;
        dynamicBeats[lead].t += anchorBeat.t * normW;
      });
    });

    return dynamicBeats;
  };

  const onMouseMove = (event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !heartGroupRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (isDraggingRef.current) {
      const deltaMove = {
        x: event.clientX - previousMousePositionRef.current.x,
        y: event.clientY - previousMousePositionRef.current.y,
      };
      heartGroupRef.current.rotation.y += deltaMove.x * 0.01;
      heartGroupRef.current.rotation.x += deltaMove.y * 0.01;
      previousMousePositionRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    mouseRef.current.x = ((event.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    let intersects = raycasterRef.current.intersectObjects(clickableMeshesRef.current);

    // Filter intersects to respect clipping plane
    if (isClippingActive) {
      intersects = intersects.filter(hit => {
        // Plane equation: n.p + constant = 0
        // Point is visible if n.p + constant > 0
        return clippingPlaneRef.current.distanceToPoint(hit.point) > 0;
      });
    }

    if (intersects.length > 0) {
      setIsHovering(true);
      const hitPoint = intersects[0].point;
      const faceNormal = intersects[0].face?.normal;

      if (laserPointerRef.current) {
        laserPointerRef.current.position.copy(hitPoint);
        if (faceNormal) {
          laserPointerRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceNormal);
        }
        laserPointerRef.current.visible = true;
      }

      if (fleshMatRef.current?.userData.shader) {
        fleshMatRef.current.userData.shader.uniforms.isVPC.value = 1.0;
        fleshMatRef.current.userData.shader.uniforms.waveOrigin.value.copy(hitPoint);
      }

      const dynamicBeats = calculateDynamicECG(hitPoint);
      onCoordUpdate(hitPoint, dynamicBeats);
    } else {
      if (isHovering) {
        setIsHovering(false);
        if (laserPointerRef.current) laserPointerRef.current.visible = false;
        if (fleshMatRef.current?.userData.shader) fleshMatRef.current.userData.shader.uniforms.isVPC.value = 0.0;
        onCoordUpdate(new THREE.Vector3(), null);
      }
    }
  };

  const onMouseDown = (event: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: event.clientX, y: event.clientY };
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  };

  return (
    <div
      ref={containerRef}
      className={`flex-grow w-full h-full ${isHovering ? 'cursor-crosshair' : 'cursor-grab'} active:cursor-grabbing`}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
    />
  );
};

export default HeartView;
