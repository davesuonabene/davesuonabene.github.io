import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const DEG2RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function latLonToVector3(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(Math.sin(lon) * cosLat, Math.sin(lat), Math.cos(lon) * cosLat).normalize();
}

// Deterministic 3D smooth value noise + FBM
function hash3(ix, iy, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647);
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = lerp(c000, c100, fx);
  const x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx);
  const x11 = lerp(c011, c111, fx);

  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) * 2 - 1;
}

function fbm3(x, y, z) {
  let sum = 0;
  let amp = 0.52;
  let freq = 1.0;
  for (let i = 0; i < 4; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    freq *= 2.07;
    amp *= 0.48;
  }
  return sum;
}

function createTerrainField(worldCfg, objectTargets) {
  const radius = Number(worldCfg.radius) || 1.55;
  const amplitude = Number(worldCfg.terrain_amplitude) || 0.12;
  const seaLevel = -0.04;
  const plateauHeight = 0.26;

  function getElevation(nx, ny, nz) {
    const px = nx * 2.15 + 4.3;
    const py = ny * 2.15 - 1.7;
    const pz = nz * 2.15 + 8.1;

    const base = fbm3(px, py, pz);
    const ridge = 1.0 - Math.abs(noise3(px * 1.45 + 11.2, py * 1.45 - 3.4, pz * 1.45 + 2.8));
    let h = base * 0.62 + (ridge * ridge - 0.38) * 0.42;

    for (let i = 0; i < objectTargets.length; i++) {
      const target = objectTargets[i];
      const dot = clamp(nx * target.x + ny * target.y + nz * target.z, -1, 1);
      const ang = Math.acos(dot);
      if (ang < 0.15) {
        const blend = smoothstep(0.15, 0.06, ang);
        h = lerp(h, plateauHeight, blend);
      }
    }

    return h;
  }

  function getSurfaceRadius(nx, ny, nz) {
    const h = getElevation(nx, ny, nz);
    return radius + Math.max(h, seaLevel) * amplitude;
  }

  return {
    radius,
    amplitude,
    seaLevel,
    getElevation,
    getSurfaceRadius,
  };
}

function buildGlobeMesh(field) {
  const geo = new THREE.IcosahedronGeometry(1, 22);
  const posAttr = geo.attributes.position;
  const count = posAttr.count;
  const normals = new Float32Array(count * 3);
  const elevations = new Float32Array(count);

  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const b = new THREE.Vector3();
  const nTp = new THREE.Vector3();
  const nTm = new THREE.Vector3();
  const nBp = new THREE.Vector3();
  const nBm = new THREE.Vector3();
  const dT = new THREE.Vector3();
  const dB = new THREE.Vector3();
  const surfN = new THREE.Vector3();
  const eps = 0.008;

  for (let i = 0; i < count; i++) {
    n.fromBufferAttribute(posAttr, i).normalize();
    const h = field.getElevation(n.x, n.y, n.z);
    const r = field.radius + Math.max(h, field.seaLevel) * field.amplitude;

    posAttr.setXYZ(i, n.x * r, n.y * r, n.z * r);
    elevations[i] = h;

    const ref = Math.abs(n.y) < 0.9 ? UP : RIGHT;
    t.crossVectors(ref, n).normalize();
    b.crossVectors(n, t).normalize();

    nTp.copy(n).addScaledVector(t, eps).normalize();
    nTm.copy(n).addScaledVector(t, -eps).normalize();
    nBp.copy(n).addScaledVector(b, eps).normalize();
    nBm.copy(n).addScaledVector(b, -eps).normalize();

    const rTp = field.getSurfaceRadius(nTp.x, nTp.y, nTp.z);
    const rTm = field.getSurfaceRadius(nTm.x, nTm.y, nTm.z);
    const rBp = field.getSurfaceRadius(nBp.x, nBp.y, nBp.z);
    const rBm = field.getSurfaceRadius(nBm.x, nBm.y, nBm.z);

    dT.set(nTp.x * rTp - nTm.x * rTm, nTp.y * rTp - nTm.y * rTm, nTp.z * rTp - nTm.z * rTm);
    dB.set(nBp.x * rBp - nBm.x * rBm, nBp.y * rBp - nBm.y * rBm, nBp.z * rBp - nBm.z * rBm);

    surfN.crossVectors(dT, dB).normalize();
    normals[i * 3] = surfN.x;
    normals[i * 3 + 1] = surfN.y;
    normals[i * 3 + 2] = surfN.z;
  }

  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("aElevation", new THREE.BufferAttribute(elevations, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir1: { value: new THREE.Vector3(-4, 5, 5).normalize() },
      uLightDir2: { value: new THREE.Vector3(5, -3, -4).normalize() },
      uSeaLevel: { value: field.seaLevel },
    },
    vertexShader: `
      attribute float aElevation;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vElevation;

      void main() {
        vElevation = aElevation;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uLightDir1;
      uniform vec3 uLightDir2;
      uniform float uSeaLevel;

      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vElevation;

      float contourLine(float val, float stepSize, float lineWidthPx) {
        float scaled = val / stepSize;
        float grid = abs(fract(scaled - 0.5) - 0.5) / max(fwidth(scaled), 0.0001);
        return 1.0 - smoothstep(0.0, lineWidthPx, grid);
      }

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L1 = normalize(uLightDir1);
        vec3 L2 = normalize(uLightDir2);

        float diff1 = max(dot(N, L1), 0.0);
        float diff2 = max(dot(N, L2), 0.0);
        float hemi = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;

        vec3 basinCol = vec3(0.043, 0.051, 0.068);
        vec3 lowLand = vec3(0.068, 0.078, 0.100);
        vec3 highLand = vec3(0.145, 0.165, 0.205);

        float landFactor = smoothstep(uSeaLevel - 0.015, uSeaLevel + 0.025, vElevation);
        float heightNorm = clamp((vElevation - uSeaLevel) / 0.55, 0.0, 1.0);
        vec3 landCol = mix(lowLand, highLand, pow(heightNorm, 0.85));
        vec3 albedo = mix(basinCol, landCol, landFactor);

        vec3 lit = albedo * (0.42 + 0.25 * hemi)
                 + albedo * diff1 * 0.95
                 + vec3(0.11, 0.13, 0.17) * diff2 * 0.55;

        float minorContour = contourLine(vElevation, 0.048, 1.15) * landFactor;
        float majorContour = contourLine(vElevation, 0.144, 1.45) * landFactor;

        float shoreDist = abs(vElevation - uSeaLevel) / max(fwidth(vElevation), 0.0005);
        float shoreLine = 1.0 - smoothstep(0.0, 1.5, shoreDist);

        vec3 lineInk = vec3(0.945, 0.953, 0.961);
        lit = mix(lit, lineInk, minorContour * 0.14);
        lit = mix(lit, lineInk, majorContour * 0.34);
        lit = mix(lit, lineInk, shoreLine * 0.38);

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
        lit += vec3(0.75, 0.80, 0.88) * fresnel * 0.28;

        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  });

  return new THREE.Mesh(geo, material);
}

function buildGraticule(radius) {
  const r = radius + 0.004;
  const positions = [];

  // 12 Meridians (every 30 deg)
  const segs = 72;
  for (let m = 0; m < 12; m++) {
    const lon = m * 30 * DEG2RAD;
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);
    for (let s = 0; s < segs; s++) {
      const a0 = -Math.PI * 0.5 + (s / segs) * Math.PI;
      const a1 = -Math.PI * 0.5 + ((s + 1) / segs) * Math.PI;
      positions.push(
        sinLon * Math.cos(a0) * r,
        Math.sin(a0) * r,
        cosLon * Math.cos(a0) * r,
        sinLon * Math.cos(a1) * r,
        Math.sin(a1) * r,
        cosLon * Math.cos(a1) * r
      );
    }
  }

  // 5 Parallels (-60, -30, 0, +30, +60)
  const latitudes = [-60, -30, 0, 30, 60];
  const pSegs = 96;
  for (let i = 0; i < latitudes.length; i++) {
    const lat = latitudes[i] * DEG2RAD;
    const y = Math.sin(lat) * r;
    const ringR = Math.cos(lat) * r;
    for (let s = 0; s < pSegs; s++) {
      const a0 = (s / pSegs) * Math.PI * 2;
      const a1 = ((s + 1) / pSegs) * Math.PI * 2;
      positions.push(Math.sin(a0) * ringR, y, Math.cos(a0) * ringR, Math.sin(a1) * ringR, y, Math.cos(a1) * ringR);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xc2cbd6,
    transparent: true,
    opacity: 0.17,
  });

  return new THREE.LineSegments(geo, mat);
}

function buildContainer(objCfg, index) {
  const root = new THREE.Group();
  const hoverGroup = new THREE.Group();
  root.add(hoverGroup);

  const accentColor = new THREE.Color(objCfg.accent || "#f1f3f5");
  const containerW = 0.145;
  const containerH = 0.066;
  const containerD = 0.072;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1a1f2a,
    emissive: 0x1e2533,
    emissiveIntensity: 0,
    roughness: 0.48,
    metalness: 0.38,
  });

  const bodyGeo = new THREE.BoxGeometry(containerW, containerH, containerD);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = containerH * 0.5;
  hoverGroup.add(bodyMesh);

  const edgeGeo = new THREE.EdgesGeometry(bodyGeo, 25);
  const edgeMat = new THREE.LineBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.52,
  });
  edgeMat.userData = { baseOpacity: 0.52, hoverBoost: 0.48 };
  bodyMesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

  // Subtle vertical corrugation ribs on the two long faces + inset roof seam
  const detailPositions = [];
  const ribCount = 5;
  const halfX = 0.052;
  const zOffset = containerD * 0.5 + 0.0008;
  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0 : (i / (ribCount - 1)) * 2 - 1;
    const x = t * halfX;
    detailPositions.push(x, 0.008, zOffset, x, containerH - 0.008, zOffset);
    detailPositions.push(x, 0.008, -zOffset, x, containerH - 0.008, -zOffset);
  }

  const topY = containerH + 0.0008;
  const roofX = containerW * 0.5 - 0.012;
  const roofZ = containerD * 0.5 - 0.011;
  detailPositions.push(
    -roofX,
    topY,
    -roofZ,
    roofX,
    topY,
    -roofZ,
    roofX,
    topY,
    -roofZ,
    roofX,
    topY,
    roofZ,
    roofX,
    topY,
    roofZ,
    -roofX,
    topY,
    roofZ,
    -roofX,
    topY,
    roofZ,
    -roofX,
    topY,
    -roofZ
  );

  const detailGeo = new THREE.BufferGeometry();
  detailGeo.setAttribute("position", new THREE.Float32BufferAttribute(detailPositions, 3));
  const detailMat = new THREE.LineBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.26,
  });
  detailMat.userData = { baseOpacity: 0.26, hoverBoost: 0.46 };
  hoverGroup.add(new THREE.LineSegments(detailGeo, detailMat));

  // Proportional invisible raycast collider
  const hitGeo = new THREE.BoxGeometry(0.24, 0.18, 0.18);
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = 0.075;
  hitMesh.userData.gaiaIndex = index;
  root.add(hitMesh);

  return {
    root,
    hoverGroup,
    hitMesh,
    bodyMat,
    edgeMats: [edgeMat, detailMat],
    anchorLocal: new THREE.Vector3(0, 0.115, 0),
    hoverAmt: 0,
  };
}

function computeFocusQuaternion(dirLocal, azDeg = 0, elDeg = 8) {
  const lat = Math.asin(clamp(dirLocal.y, -1, 1));
  const lon = Math.atan2(dirLocal.x, dirLocal.z);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, azDeg * DEG2RAD - lon);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(RIGHT, lat - elDeg * DEG2RAD);
  return qPitch.multiply(qYaw).normalize();
}

function initGaia() {
  const configEl = document.getElementById("gaia-config");
  const canvasMount = document.getElementById("gaia-canvas-mount");
  const markersLayer = document.getElementById("gaia-markers-layer");
  const indexNav = document.getElementById("gaia-index");
  const veilEl = document.getElementById("gaia-transition-veil");
  const fallbackEl = document.getElementById("gaia-fallback");

  if (!configEl || !canvasMount) return;

  function showFallback() {
    if (!fallbackEl) return;
    fallbackEl.hidden = false;
    fallbackEl.classList.add("is-fallback");
  }

  let config;
  try {
    config = JSON.parse(configEl.textContent || "{}");
  } catch {
    showFallback();
    return;
  }

  const worldCfg = config.world || {};
  const objects = Array.isArray(config.objects) ? config.objects : [];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    showFallback();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  canvasMount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  const ambientLight = new THREE.AmbientLight(0xc8d2e0, 0.65);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-4, 5, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xcfe4ff, 1.15);
  rimLight.position.set(5, -3, -4);
  scene.add(rimLight);

  const objectDirs = objects.map((obj) => latLonToVector3(Number(obj.lat) || 0, Number(obj.lon) || 0));
  const field = createTerrainField(worldCfg, objectDirs);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const globeMesh = buildGlobeMesh(field);
  worldGroup.add(globeMesh);

  const graticule = buildGraticule(field.radius);
  worldGroup.add(graticule);

  // Build containers & DOM pins
  const entries = [];
  const hitMeshes = [];
  const indexButtons = indexNav ? Array.from(indexNav.querySelectorAll(".gaia-index-btn")) : [];

  objects.forEach((obj, idx) => {
    const dir = objectDirs[idx];
    const r = field.getSurfaceRadius(dir.x, dir.y, dir.z);
    const monument = buildContainer(obj, idx);

    monument.root.position.copy(dir).multiplyScalar(r - 0.008);
    monument.root.quaternion.setFromUnitVectors(UP, dir);
    worldGroup.add(monument.root);
    hitMeshes.push(monument.hitMesh);

    const marker = document.createElement("div");
    marker.className = "gaia-marker";

    const node = document.createElement("span");
    node.className = "gaia-marker-node";
    const stem = document.createElement("span");
    stem.className = "gaia-marker-stem";

    const tag = document.createElement("a");
    tag.className = "gaia-marker-tag";
    tag.href = obj.url;
    if (obj.external) {
      tag.target = "_blank";
      tag.rel = "noopener noreferrer";
    }

    const codeSpan = document.createElement("span");
    codeSpan.className = "gaia-marker-code";
    codeSpan.textContent = `[${obj.code || String(idx + 1).padStart(2, "0")}]`;

    const labelSpan = document.createElement("span");
    labelSpan.className = "gaia-marker-label";
    labelSpan.textContent = obj.label;

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "gaia-marker-arrow";
    arrowSpan.setAttribute("aria-hidden", "true");
    arrowSpan.textContent = "\u2197";

    tag.appendChild(codeSpan);
    tag.appendChild(labelSpan);
    tag.appendChild(arrowSpan);

    marker.appendChild(node);
    marker.appendChild(stem);
    marker.appendChild(tag);
    if (markersLayer) markersLayer.appendChild(marker);

    entries.push({
      index: idx,
      cfg: obj,
      dir,
      monument,
      marker,
      tag,
      indexBtn: indexButtons[idx] || null,
      isFlipped: false,
    });
  });

  // Initial hero framing: orient first object cleanly forward-right
  if (entries.length > 0) {
    worldGroup.quaternion.copy(computeFocusQuaternion(entries[0].dir, 14, 10));
  }

  let viewportW = canvasMount.clientWidth || window.innerWidth;
  let viewportH = canvasMount.clientHeight || window.innerHeight;
  let baseCamZ = 4.2;
  let minZoom = 3.2;
  let maxZoom = 6.0;
  let targetCamZ = 4.2;
  let currentCamZ = 4.2;

  function updateViewportSize() {
    viewportW = canvasMount.clientWidth || window.innerWidth;
    viewportH = canvasMount.clientHeight || window.innerHeight;
    const aspect = viewportW / Math.max(1, viewportH);

    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(viewportW, viewportH, false);

    baseCamZ = 4.2;
    if (aspect < 0.78) baseCamZ = 5.45;
    else if (aspect < 1.05) baseCamZ = 4.75;
    else if (aspect < 1.35) baseCamZ = 4.45;

    minZoom = baseCamZ - 1.0;
    maxZoom = baseCamZ + 1.8;
    targetCamZ = clamp(baseCamZ, minZoom, maxZoom);
    currentCamZ = targetCamZ;
    camera.position.set(0, 0, currentCamZ);
  }

  updateViewportSize();
  window.addEventListener("resize", updateViewportSize);

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = reducedMotionQuery.matches;
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", (e) => {
      prefersReducedMotion = e.matches;
    });
  }

  let hoveredRayIdx = -1;
  let hoveredMarkerIdx = -1;
  let hoveredIndex = -1;
  let isNavigating = false;
  let navTimer = null;

  function resetTransitionState() {
    isNavigating = false;
    if (navTimer) {
      clearTimeout(navTimer);
      navTimer = null;
    }
    targetCamZ = baseCamZ;
    currentCamZ = baseCamZ;
    camera.position.z = currentCamZ;
    if (veilEl) veilEl.classList.remove("is-transitioning");
  }

  window.addEventListener("pageshow", resetTransitionState);

  function navigateToObject(entry) {
    if (!entry || isNavigating) return;

    if (entry.cfg.external) {
      window.open(entry.cfg.url, "_blank", "noopener,noreferrer");
      return;
    }

    isNavigating = true;
    targetCamZ = Math.max(minZoom * 0.88, currentCamZ - 0.65);
    if (veilEl) veilEl.classList.add("is-transitioning");

    const delay = prefersReducedMotion ? 0 : 340;
    navTimer = setTimeout(() => {
      window.location.href = entry.cfg.url;
    }, delay);
  }

  // Hover sync between 2D tags and 3D scene
  entries.forEach((entry) => {
    entry.tag.addEventListener("mouseenter", () => {
      hoveredMarkerIdx = entry.index;
    });
    entry.tag.addEventListener("mouseleave", () => {
      if (hoveredMarkerIdx === entry.index) hoveredMarkerIdx = -1;
    });
    entry.tag.addEventListener("focus", () => {
      hoveredMarkerIdx = entry.index;
    });
    entry.tag.addEventListener("blur", () => {
      if (hoveredMarkerIdx === entry.index) hoveredMarkerIdx = -1;
    });
    entry.tag.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || entry.cfg.external) return;
      e.preventDefault();
      navigateToObject(entry);
    });
  });

  // Rotation, inertia, pinch-zoom & focus slerp state
  const activePointers = new Map();
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let downTime = 0;
  let dragDistance = 0;
  let lastPinchDist = 0;
  let velYaw = 0;
  let velPitch = 0;

  let focusTargetQuat = null;
  const qStepYaw = new THREE.Quaternion();
  const qStepPitch = new THREE.Quaternion();

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const worldNormalTmp = new THREE.Vector3();

  function focusOnEntry(entry) {
    if (!entry) return;
    velYaw = 0;
    velPitch = 0;
    focusTargetQuat = computeFocusQuaternion(entry.dir, 0, 8);
  }

  entries.forEach((entry) => {
    if (!entry.indexBtn) return;
    entry.indexBtn.addEventListener("click", () => {
      worldNormalTmp.copy(entry.dir).applyQuaternion(worldGroup.quaternion);
      if (worldNormalTmp.z > 0.94) {
        navigateToObject(entry);
      } else {
        focusOnEntry(entry);
      }
    });
  });

  function updatePointerNdc(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  function pickContainer(clientX, clientY) {
    if (hitMeshes.length === 0) return -1;
    updatePointerNdc(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (hits.length === 0) return -1;

    const idx = hits[0].object.userData.gaiaIndex;
    if (typeof idx !== "number" || !entries[idx]) return -1;

    worldNormalTmp.copy(entries[idx].dir).applyQuaternion(worldGroup.quaternion);
    return worldNormalTmp.z > 0.05 ? idx : -1;
  }

  function applyWorldRotation(yawDelta, pitchDelta) {
    qStepYaw.setFromAxisAngle(UP, yawDelta);
    qStepPitch.setFromAxisAngle(RIGHT, pitchDelta);
    worldGroup.quaternion.premultiply(qStepYaw).premultiply(qStepPitch).normalize();
  }

  function getPinchDistance() {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  canvasMount.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    canvasMount.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    focusTargetQuat = null;
    velYaw = 0;
    velPitch = 0;

    if (activePointers.size === 1) {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downTime = performance.now();
      dragDistance = 0;
      canvasMount.classList.add("is-dragging");
    } else if (activePointers.size === 2) {
      isDragging = false;
      dragDistance = 999;
      lastPinchDist = getPinchDistance();
      canvasMount.classList.remove("is-dragging");
    }
  });

  canvasMount.addEventListener("pointermove", (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size >= 2) {
        const dist = getPinchDistance();
        if (lastPinchDist > 0 && dist > 0) {
          targetCamZ = clamp(targetCamZ - (dist - lastPinchDist) * 0.008, minZoom, maxZoom);
        }
        lastPinchDist = dist;
        hoveredRayIdx = -1;
        return;
      }

      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        dragDistance += Math.hypot(dx, dy);

        const sensitivity = 0.0052;
        const yawDelta = dx * sensitivity;
        const pitchDelta = dy * sensitivity;
        applyWorldRotation(yawDelta, pitchDelta);

        velYaw = yawDelta * 55;
        velPitch = pitchDelta * 55;
        hoveredRayIdx = -1;
        return;
      }
    }

    if (e.pointerType === "mouse") {
      hoveredRayIdx = pickContainer(e.clientX, e.clientY);
    }
  });

  function handlePointerEnd(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);

    if (activePointers.size === 1) {
      const remaining = activePointers.values().next().value;
      lastX = remaining.x;
      lastY = remaining.y;
      lastPinchDist = 0;
      isDragging = true;
      canvasMount.classList.add("is-dragging");
      return;
    }

    if (activePointers.size === 0) {
      const wasDragging = isDragging;
      isDragging = false;
      lastPinchDist = 0;
      canvasMount.classList.remove("is-dragging");

      if (wasDragging) {
        const elapsed = performance.now() - downTime;
        if (dragDistance < 6 && elapsed < 450) {
          const hitIdx = pickContainer(e.clientX, e.clientY);
          if (hitIdx >= 0) {
            navigateToObject(entries[hitIdx]);
          }
        }
      }
    }
  }

  canvasMount.addEventListener("pointerup", handlePointerEnd);
  canvasMount.addEventListener("pointercancel", handlePointerEnd);
  canvasMount.addEventListener("pointerleave", () => {
    if (!isDragging) hoveredRayIdx = -1;
  });

  canvasMount.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      targetCamZ = clamp(targetCamZ + e.deltaY * 0.0022, minZoom, maxZoom);
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 0.75;
    if (e.key === "ArrowLeft") {
      focusTargetQuat = null;
      velYaw -= step;
    } else if (e.key === "ArrowRight") {
      focusTargetQuat = null;
      velYaw += step;
    } else if (e.key === "ArrowUp") {
      focusTargetQuat = null;
      velPitch -= step;
    } else if (e.key === "ArrowDown") {
      focusTargetQuat = null;
      velPitch += step;
    } else if (e.key >= "1" && e.key <= "9") {
      const idx = Number(e.key) - 1;
      if (entries[idx]) focusOnEntry(entries[idx]);
    }
  });

  const idleSpeed = Number(worldCfg.idle_speed) || 0.042;
  const idleAxis = new THREE.Vector3(0.18, 0.98, 0).normalize();
  const qIdle = new THREE.Quaternion();
  const toCamDir = new THREE.Vector3();
  const anchorWorld = new THREE.Vector3();
  const projVec = new THREE.Vector3();

  let rafId = null;
  let contextLost = false;
  let prevTime = performance.now();

  function renderFrame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
    prevTime = now;

    hoveredIndex = hoveredMarkerIdx >= 0 ? hoveredMarkerIdx : hoveredRayIdx;
    if (hoveredIndex >= 0 && !isDragging) {
      canvasMount.classList.add("is-pointer");
    } else {
      canvasMount.classList.remove("is-pointer");
    }

    // Smooth camera zoom interpolation
    currentCamZ += (targetCamZ - currentCamZ) * (1 - Math.exp(-9 * dt));
    camera.position.z = currentCamZ;

    // Rotation update: focus slerp > inertia > gentle idle drift
    if (focusTargetQuat) {
      const slerpAlpha = 1 - Math.exp(-7.5 * dt);
      worldGroup.quaternion.slerp(focusTargetQuat, slerpAlpha);
      if (worldGroup.quaternion.angleTo(focusTargetQuat) < 0.004) {
        worldGroup.quaternion.copy(focusTargetQuat);
        focusTargetQuat = null;
      }
    } else if (!isDragging && activePointers.size === 0) {
      if (Math.abs(velYaw) > 0.001 || Math.abs(velPitch) > 0.001) {
        applyWorldRotation(velYaw * dt, velPitch * dt);
        const damp = Math.exp(-4.8 * dt);
        velYaw *= damp;
        velPitch *= damp;
      } else if (hoveredIndex < 0 && !prefersReducedMotion) {
        qIdle.setFromAxisAngle(idleAxis, idleSpeed * dt);
        worldGroup.quaternion.premultiply(qIdle).normalize();
      }
    }

    // Update world matrices before 2D marker projection
    worldGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    let closestFrontIdx = -1;
    let closestFrontDot = -1;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isHovered = i === hoveredIndex;
      const m = entry.monument;

      m.hoverAmt += ((isHovered ? 1 : 0) - m.hoverAmt) * (1 - Math.exp(-12 * dt));
      m.hoverGroup.position.y = m.hoverAmt * 0.024;
      m.bodyMat.emissiveIntensity = m.hoverAmt * 0.65;

      for (let e = 0; e < m.edgeMats.length; e++) {
        const em = m.edgeMats[e];
        const baseOp = em.userData && typeof em.userData.baseOpacity === "number" ? em.userData.baseOpacity : 0.52;
        const boost = em.userData && typeof em.userData.hoverBoost === "number" ? em.userData.hoverBoost : 0.48;
        em.opacity = Math.min(1, baseOp + m.hoverAmt * boost);
      }

      // Visibility & 2D screen projection
      worldNormalTmp.copy(entry.dir).applyQuaternion(worldGroup.quaternion).normalize();
      anchorWorld.copy(m.anchorLocal).applyMatrix4(m.root.matrixWorld);
      toCamDir.copy(camera.position).sub(anchorWorld).normalize();

      const facing = worldNormalTmp.dot(toCamDir);
      if (facing > closestFrontDot) {
        closestFrontDot = facing;
        closestFrontIdx = i;
      }

      if (facing > 0.08) {
        projVec.copy(anchorWorld).project(camera);
        if (projVec.z >= -1 && projVec.z <= 1) {
          const sx = (projVec.x * 0.5 + 0.5) * viewportW;
          const sy = (-projVec.y * 0.5 + 0.5) * viewportH;

          // Hysteresis edge-flip so markers never clip off the right side on desktop or mobile
          if (!entry.isFlipped && sx > viewportW - 165) {
            entry.isFlipped = true;
            entry.marker.classList.add("is-flipped");
          } else if (entry.isFlipped && sx < viewportW - 215) {
            entry.isFlipped = false;
            entry.marker.classList.remove("is-flipped");
          }

          const offsetTransform = entry.isFlipped ? "translate(-100%, -50%)" : "translateY(-50%)";
          entry.marker.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) ${offsetTransform}`;
          entry.marker.classList.add("is-visible");
        } else {
          entry.marker.classList.remove("is-visible");
        }
      } else {
        entry.marker.classList.remove("is-visible");
      }

      if (isHovered) {
        entry.marker.classList.add("is-hovered");
      } else {
        entry.marker.classList.remove("is-hovered");
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const btn = entries[i].indexBtn;
      if (!btn) continue;
      if (i === hoveredIndex || (i === closestFrontIdx && closestFrontDot > 0.72)) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    }

    renderer.render(scene, camera);
  }

  function startLoop() {
    if (rafId !== null || contextLost || document.visibilityState === "hidden") return;
    prevTime = performance.now();
    function tick(now) {
      if (contextLost || document.visibilityState === "hidden") {
        rafId = null;
        return;
      }
      renderFrame(now);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopLoop();
    } else {
      startLoop();
    }
  });

  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
    stopLoop();
  });

  renderer.domElement.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    startLoop();
  });

  // Render initial frame and reveal smoothly
  renderFrame(performance.now());
  requestAnimationFrame(() => {
    canvasMount.classList.add("is-ready");
  });
  startLoop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGaia);
} else {
  initGaia();
}
