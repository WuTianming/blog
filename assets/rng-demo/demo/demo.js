import { RNG } from "../rng_graph.js";
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const CONFIG = {
  dataset: {
    n: 1000,
    height: 10.0,
    tMin: 1.5 * Math.PI,
    tMax: 6.5 * Math.PI,
    scale: 2.5,
  },
  graph: {
    M: 10,
    efCon: 50,
    alpha: 1.0,
    seed: 42,
  },
  render: {
    baseEdgeColor: 0x3d3d3d,
    baseOpacity: 0.3,
    dimOpacity: 0.05,
    pointColor: 0x6c6c6c,
    pointSize: 0.02,
    entryColor: 0x2b7cff,
    targetColor: 0x2e8b57,
    markerSize: 0.06,
    tubeColor: 0xe4572e,
    tubeOpacity: 0.9,
    tubeRadius: 0.010,
    tubeRadialSegments: 8,
  },
  animation: {
    cycleMs: 5000,
    introMs: 1000,
    highlightMs: 3000,
    holdMs: 1000,
    dimStartMs: 1000,
  },
  camera: {
    fov: 45,
    near: 0.1,
    far: 100,
    position: [0, 0.8, 2.8],
  },
  controls: {
    damping: 0.08,
    rotateSpeed: 0.8,
  },
};

function generateSwissRoll(n, height = 1.0) {
  const points = [];
  const tMin = CONFIG.dataset.tMin;
  const tMax = CONFIG.dataset.tMax;
  for (let i = 0; i < n; i += 1) {
    const t = tMin + (tMax - tMin) * (i / (n - 1));
    const h = Math.random() * height;
    const x = t * Math.cos(t);
    const y = h;
    const z = t * Math.sin(t);
    points.push([x, y, z]);
  }
  return points;
}

function centerAndScale(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = points[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = CONFIG.dataset.scale / span;
  return points.map(([x, y, z]) => [
    (x - cx) * scale,
    (y - cy) * scale,
    (z - cz) * scale,
  ]);
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function buildLineSegments(points, graph) {
  let edgeCount = 0;
  for (let i = 0; i < graph.length; i += 1) {
    edgeCount += graph[i].length;
  }
  const positions = new Float32Array(edgeCount * 2 * 3);
  let idx = 0;
  for (let i = 0; i < graph.length; i += 1) {
    const [x0, y0, z0] = points[i];
    const neighbors = graph[i];
    for (let j = 0; j < neighbors.length; j += 1) {
      const nb = neighbors[j];
      const [x1, y1, z1] = points[nb];
      positions[idx++] = x0;
      positions[idx++] = y0;
      positions[idx++] = z0;
      positions[idx++] = x1;
      positions[idx++] = y1;
      positions[idx++] = z1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: CONFIG.render.baseEdgeColor,
    transparent: true,
    opacity: CONFIG.render.baseOpacity,
  });
  return new THREE.LineSegments(geometry, material);
}

function buildPoints(points) {
  const positions = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const [x, y, z] = points[i];
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: CONFIG.render.pointColor,
    size: CONFIG.render.pointSize,
  });
  return new THREE.Points(geometry, material);
}

function buildHighlightTubes(points, edges, radius = 0.012) {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    1,
    CONFIG.render.tubeRadialSegments,
    1,
    true
  );
  const material = new THREE.MeshBasicMaterial({
    color: CONFIG.render.tubeColor,
    transparent: true,
    opacity: CONFIG.render.tubeOpacity,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, edges.length);
  const tempMatrix = new THREE.Matrix4();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const tempPos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();

  for (let i = 0; i < edges.length; i += 1) {
    const [from, to] = edges[i];
    const p0 = points[from];
    const p1 = points[to];
    dir.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const length = dir.length();
    if (length < 1e-6) {
      tempScale.set(1, 1e-6, 1);
      tempQuat.identity();
      tempPos.set(p0[0], p0[1], p0[2]);
    } else {
      dir.normalize();
      tempQuat.setFromUnitVectors(up, dir);
      tempScale.set(1, length, 1);
      tempPos.set(
        (p0[0] + p1[0]) * 0.5,
        (p0[1] + p1[1]) * 0.5,
        (p0[2] + p1[2]) * 0.5
      );
    }
    tempMatrix.compose(tempPos, tempQuat, tempScale);
    mesh.setMatrixAt(i, tempMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = 0;
  return mesh;
}

function buildMarker(color, size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(3), 3)
  );
  const material = new THREE.PointsMaterial({ color, size });
  return new THREE.Points(geometry, material);
}

function main() {
  const container = document.getElementById("stage");
  if (!container) return;

  const n = CONFIG.dataset.n;
  const vecs = generateSwissRoll(n, CONFIG.dataset.height);
  const rng = new RNG({
    vecs,
    M: CONFIG.graph.M,
    efCon: CONFIG.graph.efCon,
    alpha: CONFIG.graph.alpha,
    seed: CONFIG.graph.seed,
  });

  setStatus("Building graph...");
  rng.build();
  let edgeCount = 0;
  for (let i = 0; i < rng.graph.length; i += 1) {
    edgeCount += rng.graph[i].length;
  }
  setStatus(
    `Graph built. Nodes: ${n}, edges: ${edgeCount} (degree cap = ${rng.M}).`
  );

  const points = centerAndScale(vecs);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfffaf2);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    container.clientWidth / container.clientHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(
    CONFIG.camera.position[0],
    CONFIG.camera.position[1],
    CONFIG.camera.position[2]
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = CONFIG.controls.damping;
  controls.rotateSpeed = CONFIG.controls.rotateSpeed;

  const baseEdges = buildLineSegments(points, rng.graph);
  scene.add(baseEdges);
  scene.add(buildPoints(points));

  const entryMarker = buildMarker(
    CONFIG.render.entryColor,
    CONFIG.render.markerSize
  );
  const targetMarker = buildMarker(
    CONFIG.render.targetColor,
    CONFIG.render.markerSize
  );
  scene.add(entryMarker);
  scene.add(targetMarker);

  let highlightTubes = null;
  let runStart = performance.now();
  const cycleMs = CONFIG.animation.cycleMs;
  const introMs = CONFIG.animation.introMs;
  const highlightMs = CONFIG.animation.highlightMs;
  const holdMs = CONFIG.animation.holdMs;
  const dimStartMs = CONFIG.animation.dimStartMs;
  const baseOpacity = CONFIG.render.baseOpacity;
  const dimOpacity = CONFIG.render.dimOpacity;
  let highlightEdgeCount = 0;

  function setMarker(marker, point) {
    const attr = marker.geometry.getAttribute("position");
    attr.setXYZ(0, point[0], point[1], point[2]);
    attr.needsUpdate = true;
  }

  function makeRun() {
    const entry = Math.floor(Math.random() * rng.nAdded);
    let target = Math.floor(Math.random() * rng.nAdded);
    while (target === entry) {
      target = Math.floor(Math.random() * rng.nAdded);
    }

    const efSearch = rng.nAdded;
    let { trail, precursor } = rng.searchFrom(
      entry,
      vecs[target],
      1,
      efSearch
    );

    const targetIdx = trail.indexOf(target);
    if (targetIdx !== -1) {
      trail = trail.slice(0, targetIdx + 1);
      precursor = precursor.slice(0, targetIdx + 1);
    }

    const edges = [];
    for (let i = 1; i < trail.length; i += 1) {
      const u = trail[i];
      const v = precursor[i];
      edges.push([v, u]);
    }

    if (highlightTubes) {
      scene.remove(highlightTubes);
      highlightTubes.geometry.dispose();
      highlightTubes.material.dispose();
    }
    highlightEdgeCount = edges.length;
    highlightTubes = buildHighlightTubes(
      points,
      edges,
      CONFIG.render.tubeRadius
    );
    scene.add(highlightTubes);

    setMarker(entryMarker, points[entry]);
    setMarker(targetMarker, points[target]);
  }

  makeRun();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    const now = performance.now();
    const elapsed = now - runStart;
    if (elapsed >= cycleMs) {
      runStart = now;
      makeRun();
    }

    if (highlightTubes) {
      if (elapsed < introMs) {
        highlightTubes.count = 0;
      } else if (elapsed < introMs + highlightMs) {
        const t = (elapsed - introMs) / highlightMs;
        const edgesShown = Math.floor(t * highlightEdgeCount);
        highlightTubes.count = edgesShown;
      } else if (elapsed < introMs + highlightMs + holdMs) {
        highlightTubes.count = highlightEdgeCount;
      }
    }

    if (elapsed < dimStartMs) {
      baseEdges.material.opacity = baseOpacity;
    } else {
      baseEdges.material.opacity = dimOpacity;
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

main();
