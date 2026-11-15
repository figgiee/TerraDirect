"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as T from "three";
import { Basin, GRID, ROCK_RADIUS, noise, terrainHeight } from "@/lib/basin-simulation.mjs";

export type BasinReport = { rock: string; bypass: number; sideFlow: number; outflow: number; poolDepth: number; fps: number };
export type BasinControls = { weather: Basin["weather"]; survey: boolean; orbit: boolean; release: boolean; spillway: boolean; tiled: boolean; revision: number; season: { snow: number; foliage: number; inflow: number } };
export const surveyWidthMeters = 2000;
export const surveyPitch = 65;
export type BasinCapture = (clean?: boolean) => string;

const pitch = 25 * Math.PI / 180;
const radius = 4.6;
const initialBearing = -0.31;
const waterColor = new T.Color("#597783");

function surveyHeight(x: number, z: number) {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge <= 1) return terrainHeight(x, z);
  const nearest = terrainHeight(T.MathUtils.clamp(x, -1, 1), T.MathUtils.clamp(z, -1, 1));
  const valley = 0.04 + 0.47 * T.MathUtils.smoothstep(Math.abs(x + 0.09 * Math.sin(z * 1.8)), 0.18, 2.7);
  const relief = noise(x * 1.8 + 4, z * 1.8) * 0.23 + noise(x * 8.8, z * 8.8 + 2) * 0.037;
  return T.MathUtils.lerp(nearest, valley + relief, T.MathUtils.smoothstep(edge, 1, 2.12));
}

function terrainMesh(basin: Basin, extended = false, surface?: T.MeshStandardMaterial) {
  const size = extended ? 10 : 2;
  const segments = extended ? 320 : GRID - 1;
  const geometry = new T.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  if (extended) {
    const centerStart = segments * 0.4, centerEnd = segments * 0.6;
    const index = geometry.index!;
    const triangles: number[] = [];
    for (let row = 0; row < segments; row++) {
      for (let column = 0; column < segments; column++) {
        if (row >= centerStart && row < centerEnd && column >= centerStart && column < centerEnd) continue;
        const cell = (row * segments + column) * 6;
        for (let i = 0; i < 6; i++) triangles.push(index.getX(cell + i));
      }
    }
    geometry.setIndex(triangles);
  }
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const weights = new Float32Array(positions.count * 3);
  const slate = new T.Color("#5f6680"), grass = new T.Color("#596649");
  const scree = new T.Color("#ad8d67"), snow = new T.Color("#dbe9ed");
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, extended ? surveyHeight(positions.getX(i), positions.getZ(i)) : basin.height[i]);
  }
  geometry.computeVertexNormals();
  for (let i = 0; i < positions.count; i++) {
    const { x, y, z } = new T.Vector3().fromBufferAttribute(positions, i);
    const steep = 1 - geometry.attributes.normal.getY(i);
    const variation = noise(x * 55, z * 55);
    const color = grass.clone().lerp(scree, Math.min(1, y * 3 + variation * 0.5))
      .lerp(slate, Math.min(0.98, steep * 3 + Math.max(0, y - 0.28) * 1.6))
      .lerp(snow, Math.min(0.86, Math.max(0, y - 0.32 - variation * 0.1) * 6) * (1 - steep * 0.5));
    color.multiplyScalar(0.81 + variation * 0.35).toArray(colors, i * 3);
    weights[i * 3] = T.MathUtils.smoothstep(steep + y * 0.22, 0.07, 0.36);
    weights[i * 3 + 1] = T.MathUtils.smoothstep(y - variation * 0.15, 0.20, 0.49);
    weights[i * 3 + 2] = T.MathUtils.smoothstep(y - variation * 0.11, 0.30, 0.57) * (1 - steep * 0.7);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  geometry.setAttribute("surface", new T.BufferAttribute(weights, 3));
  if (surface) return new T.Mesh(geometry, surface);
  const atlas = new T.TextureLoader().load("/alpine-materials.jpg");
  atlas.colorSpace = T.SRGBColorSpace;
  atlas.anisotropy = 8;
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  material.userData.atlas = atlas;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.alpineAtlas = { value: atlas };
    shader.uniforms.atmosphere = material.userData.atmosphere;
    shader.vertexShader = "attribute vec3 surface; varying vec3 alpinePosition; varying vec3 alpineNormal; varying vec3 alpineMix;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nalpinePosition=position; alpineNormal=normal; alpineMix=surface;");
    shader.fragmentShader = `
      uniform sampler2D alpineAtlas;
      uniform vec4 atmosphere;
      varying vec3 alpinePosition;
      varying vec3 alpineNormal;
      varying vec3 alpineMix;
      vec3 sampleAlpine(vec2 position, vec2 tile) {
        vec2 uv = fract(position);
        vec2 blend = smoothstep(vec2(.33), vec2(.5), abs(uv - .5));
        vec2 shifted = fract(uv + .5);
        vec2 start = tile + .015;
        vec3 a = mix(texture2D(alpineAtlas, start + vec2(uv.x, uv.y) * .47).rgb,
                     texture2D(alpineAtlas, start + vec2(shifted.x, uv.y) * .47).rgb, blend.x);
        vec3 b = mix(texture2D(alpineAtlas, start + vec2(uv.x, shifted.y) * .47).rgb,
                     texture2D(alpineAtlas, start + shifted * .47).rgb, blend.x);
        return mix(a, b, blend.y);
      }
      vec3 alpineSurface(vec3 p, vec3 w, vec2 tile) {
        return sampleAlpine(p.zy, tile) * w.x + sampleAlpine(p.xz, tile) * w.y + sampleAlpine(p.xy, tile) * w.z;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec3 projections = pow(abs(normalize(alpineNormal)), vec3(4.));
      projections /= projections.x + projections.y + projections.z;
      vec3 p = alpinePosition * 21.;
      vec3 rock = alpineSurface(p * vec3(1., 1.85, 1.), projections, vec2(0., .5));
      vec3 talus = alpineSurface(p * .67, projections, vec2(.5, .5));
      vec3 meadow = alpineSurface(p * .58, projections, vec2(0.));
      vec3 snow = alpineSurface(p * .8, projections, vec2(.5, 0.));
      vec3 seasonGround = mix(meadow, meadow * vec3(1.2, .83, .59), atmosphere.w * .85);
      vec3 geology = mix(mix(seasonGround, talus, alpineMix.y), rock, alpineMix.x);
      float seasonalSnow = smoothstep(.17, .42, alpinePosition.y + .25 * atmosphere.z) * atmosphere.z;
      seasonalSnow *= 1. - smoothstep(.14, .46, 1. - normalize(alpineNormal).y);
      diffuseColor.rgb *= mix(vec3(1.0), geology * 2.8, .57);
      diffuseColor.rgb = mix(diffuseColor.rgb, .62 + snow * .27, max(alpineMix.z * .45, seasonalSnow * .89));
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      vec2 cloudUV = alpinePosition.xz * 2.1 + vec2(atmosphere.x * .12, .14);
      float cloud = sin(cloudUV.x + sin(cloudUV.y)) * cos(cloudUV.y * 1.3);
      outgoingLight *= 1. - smoothstep(.02, .82, cloud) * mix(.28, .12, atmosphere.y);
      float terrainDistance = distance(cameraPosition, alpinePosition);
      float haze = 1. - exp(-max(0., terrainDistance - 3.4) * mix(.08, .2, atmosphere.y));
      outgoingLight = mix(outgoingLight, vec3(.20, .27, .34), haze);
      #include <opaque_fragment>
    `);
  };
  material.userData.atmosphere = { value: new T.Vector4() };
  return new T.Mesh(geometry, material);
}

function addWoodland(group: T.Group, survey: boolean) {
  const count = survey ? 3600 : 280;
  const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(0.0061, 0), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), count);
  const transform = new T.Object3D();
  const color = new T.Color();
  const extent = survey ? 3.2 : 0.97;
  let tree = 0;
  for (let i = 0; i < count * 6 && tree < count; i++) {
    const x = (noise(i * 7, 33) * 2 - 1) * extent;
    const z = (noise(i * 8, 67) * 2 - 1) * extent;
    const y = survey ? surveyHeight(x, z) : terrainHeight(x, z);
    const forest = noise(x * 7 + 2, z * 7 - 8);
    if (forest < 0.5 || y < 0.107 || y > 0.35 || Math.abs(x + 0.08) < 0.21) continue;
    const size = 0.57 + noise(i * 13, 5) * 0.85;
    transform.scale.set(size, size * 1.27, size * 0.93);
    transform.rotation.y = i * 0.53;
    transform.position.set(x, y + 0.006 * size, z);
    transform.updateMatrix();
    crowns.setMatrixAt(tree, transform.matrix);
    crowns.setColorAt(tree, color.setHSL(0.21 + forest * 0.07, 0.33, 0.16 + size * 0.06));
    tree++;
  }
  crowns.count = tree;
  group.add(crowns);
  return crowns.material;
}

function makeRock() {
  const group = new T.Group();
  const shape = new T.IcosahedronGeometry(ROCK_RADIUS, 0);
  shape.scale(1.08, 0.83, 0.90);
  const material = new T.MeshStandardMaterial({
    color: "#d5a46d",
    roughness: 0.82,
  });
  const stone = new T.Mesh(shape, material);
  const seam = new T.Mesh(new T.IcosahedronGeometry(ROCK_RADIUS * 1.007, 0), new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: "varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec3 p; void main(){if(abs(dot(p,normalize(vec3(.8,.55,-.28))))>.008)discard;gl_FragColor=vec4(.99,.93,.8,1.);}",
  }));
  seam.scale.set(1.08, 0.83, 0.90);
  stone.castShadow = true;
  stone.receiveShadow = true;
  group.add(stone, seam);
  return group;
}

export function BasinView({ controls, onReport, capture, hidden = false }: { controls: RefObject<BasinControls>; onReport: (report: BasinReport) => void; capture: RefObject<BasinCapture | null>; hidden?: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      element.textContent = "WebGL is unavailable in this browser.";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.setClearColor("#090c0e");
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-label", "Interactive Alpine Basin terrain");
    element.append(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 30);
    const basinGroup = new T.Group();
    scene.add(basinGroup);
    const ambient = new T.HemisphereLight("#dce9ff", "#594c3d", 1.45);
    const sun = new T.DirectionalLight("#ffe0b7", 3.15);
    sun.position.set(-4, 3, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -1.8;
    sun.shadow.camera.right = 1.8;
    sun.shadow.camera.top = 1.8;
    sun.shadow.camera.bottom = -1.8;
    sun.shadow.normalBias = 0.006;
    scene.add(ambient, sun);
    let basin = new Basin();
    const terrain = terrainMesh(basin);
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    const survey = terrainMesh(basin, true, terrain.material);
    survey.castShadow = true;
    survey.receiveShadow = true;
    const outline = new T.LineLoop(new T.BufferGeometry().setFromPoints(
      [[-1,-1,1,0],[1,-1,0,1],[1,1,-1,0],[-1,1,0,-1]].flatMap(([x, z, dx, dz]) =>
        Array.from({ length: 64 }, (_, i) => {
          const px = x + dx * i / 32, pz = z + dz * i / 32;
          return new T.Vector3(px, terrainHeight(px, pz) + 0.006, pz);
        }),
      ),
    ), new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.05, gapSize: 0.032, transparent: true, opacity: 0.42 }));
    outline.computeLineDistances();
    const neighbors = new T.Group();
    for (let row = -1; row <= 1; row++) {
      for (let column = -1; column <= 1; column++) {
        if (column === 0 && row === 0) continue;
        const neighbor = terrain.clone();
        neighbor.position.set(2 * column, 0, 2 * row);
        neighbor.scale.set(column ? -1 : 1, 1, row ? -1 : 1);
        neighbors.add(neighbor);
      }
    }
    basinGroup.add(neighbors);
    const rock = makeRock();
    const waterGeo = new T.PlaneGeometry(2, 2, GRID - 1, GRID - 1);
    waterGeo.rotateX(-Math.PI / 2);
    const waterPositions = waterGeo.attributes.position;
    const depths = new Float32Array(GRID * GRID);
    const waterDepth = new T.DataTexture(depths, GRID, GRID, T.RedFormat, T.FloatType);
    waterDepth.needsUpdate = true;
    const water = new T.Mesh(waterGeo, new T.ShaderMaterial({
      uniforms: { color: { value: waterColor }, time: { value: 0 }, waterDepth: { value: waterDepth } },
      vertexShader: "varying vec2 p; void main(){p=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        uniform sampler2D waterDepth;
        varying vec2 p;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                     mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
        }

        float depthAt(vec2 p) {
          vec2 cell = (p * .5 + .5) * ${GRID - 1}.0;
          vec2 center = (floor(cell) + .5) / ${GRID}.0;
          vec2 offset = fract(cell);
          vec2 step = vec2(1.0 / ${GRID}.0, 0.0);
          float row0 = mix(texture2D(waterDepth, center).r, texture2D(waterDepth, center + step).r, offset.x);
          float row1 = mix(texture2D(waterDepth, center + step.yx).r, texture2D(waterDepth, center + step.xx).r, offset.x);
          return mix(row0, row1, offset.y);
        }

        void main() {
          float d = depthAt(p);
          if (d < .0025) discard;
          float broad = noise(p * vec2(75., 99.) - vec2(.1, time * 2.1));
          float fine = noise(p * vec2(159., 224.) - vec2(.6, time * 6.5));
          float highlights = smoothstep(.55, .88, broad * .7 + fine * .3);
          vec3 tint = color * (.74 + broad * .24) + vec3(.13, .16, .18) * highlights;
          gl_FragColor = vec4(tint, smoothstep(.0025, .009, d) * .88);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    water.renderOrder = 2;
    const rainGeometry = new T.BufferGeometry();
    const rain = new Float32Array(420 * 6);
    rainGeometry.setAttribute("position", new T.BufferAttribute(rain, 3));
    const rainLines = new T.LineSegments(rainGeometry, new T.LineBasicMaterial({ color: "#b0dcf2", transparent: true, opacity: 0.45 }));
    rainLines.frustumCulled = false;
    const surveyForest = new T.Group(), tileForest = new T.Group();
    const surveyCanopy = addWoodland(surveyForest, true);
    const tileCanopy = addWoodland(tileForest, false);
    const summerCanopy = new T.Color("#fbffe7"), dormantCanopy = new T.Color("#c87e4f");
    basinGroup.add(terrain, survey, outline, water, rock, rainLines, surveyForest, tileForest);
    function setProjection(width: number, height: number) {
      if (!width || !height) return;
      const aspect = width / height;
      const settings = controls.current;
      const half = settings.survey ? Math.max(1.58, 1.78 / aspect) : Math.max(0.94, 1.68 / aspect) * (settings.tiled ? 2.85 : 1);
      camera.aspect = aspect;
      camera.fov = T.MathUtils.radToDeg(2 * Math.atan(half / radius));
      camera.updateProjectionMatrix();
    }
    const frameCamera = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      setProjection(width, height);
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(frameCamera);
    observer.observe(element);
    capture.current = (clean = false) => {
      const ratio = renderer.getPixelRatio();
      const size = renderer.getSize(new T.Vector2());
      const boundaryVisible = outline.visible;
      try {
        updateWater();
        outline.visible = boundaryVisible && !clean;
        renderer.setPixelRatio(1);
        renderer.setSize(3840, 2160, false);
        setProjection(3840, 2160);
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/jpeg", 0.94);
      } finally {
        outline.visible = boundaryVisible;
        renderer.setPixelRatio(ratio);
        renderer.setSize(size.x, size.y);
        setProjection(size.x, size.y);
        renderer.render(scene, camera);
      }
    };

    let frame = 0, last = performance.now(), elapsed = 0, reportTime = 0, frames = 0;
    let bearing = initialBearing;
    let revision = controls.current.revision;
    let mode = "";
    function draw(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const settings = controls.current;
      if (revision !== settings.revision) {
        basin = new Basin();
        bearing = initialBearing;
        revision = settings.revision;
        elapsed = 0;
      }
      const nextMode = settings.survey ? "survey" : settings.tiled ? "tiles" : "tile";
      if (mode !== nextMode) {
        mode = nextMode;
        survey.visible = outline.visible = surveyForest.visible = settings.survey;
        neighbors.visible = mode === "tiles";
        tileForest.visible = !settings.survey;
        rock.scale.setScalar(settings.survey ? 0.23 : 1);
        frameCamera();
      }
      basin.weather = settings.weather;
      basin.inflow = settings.season.inflow;
      const raining = settings.weather !== "clear";
      if (settings.release) basin.release();
      if (settings.spillway) basin.openSpillway();
      elapsed += dt;
      for (let step = 0; elapsed >= 1 / 90 && step < 5; step++, elapsed -= 1 / 90) basin.advance();

      // A gentle sweep keeps the creek bend in view, while preserving the pitch and scale.
      if (!settings.survey && settings.orbit) bearing += dt * 0.16;
      const angle = settings.survey ? 0.27 : 0.68 + 0.17 * Math.sin(bearing);
      const downward = settings.survey ? T.MathUtils.degToRad(surveyPitch) : pitch;
      camera.position.set(Math.sin(angle) * radius * Math.cos(downward), 0.17 + radius * Math.sin(downward), Math.cos(angle) * radius * Math.cos(downward));
      camera.lookAt(0, 0.17, 0);
      renderer.domElement.dataset.pitch = String(T.MathUtils.radToDeg(downward));
      renderer.domElement.dataset.bearing = String(angle);
      rock.position.set(basin.rock.x, terrainHeight(basin.rock.x, basin.rock.z) + ROCK_RADIUS * 0.73 * rock.scale.y, basin.rock.z);
      rock.rotation.set(0.21, -0.28, -basin.rock.distance / ROCK_RADIUS);
      water.material.uniforms.time.value = basin.time;
      rainLines.visible = raining;
      const atmosphere = terrain.material.userData.atmosphere.value as T.Vector4;
      atmosphere.x = now / 1000;
      atmosphere.y = T.MathUtils.lerp(atmosphere.y, raining ? 1 : 0, dt * 2.5);
      atmosphere.z = settings.season.snow;
      atmosphere.w = settings.season.foliage;
      surveyCanopy.color.copy(summerCanopy).lerp(dormantCanopy, atmosphere.w);
      tileCanopy.color.copy(surveyCanopy.color);
      ambient.intensity = T.MathUtils.lerp(1.24, 0.96, atmosphere.y);
      sun.intensity = T.MathUtils.lerp(3.15 - 0.75 * atmosphere.z, 0.9, atmosphere.y);
      sun.position.y = 3 - 1.25 * atmosphere.z;
      if (raining) {
        for (let i = 0; i < rain.length; i += 6) {
          const x = noise(i * 2.32, 19) * 2 - 1;
          const z = noise(i * 1.41, 73) * 2 - 1;
          const ground = terrainHeight(x, z);
          const speed = settings.weather === "cloudburst" ? 2.1 : 1.2;
          const y = ground + ((noise(i, 82) + 100 - basin.time * speed) % 1 + 1) % 1;
          rain.set([x, y, z, x - 0.043, y + 0.067, z + 0.012], i);
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }
      if (renderer.domElement.clientWidth) {
        updateWater();
        renderer.render(scene, camera);
      }
      reportTime += dt;
      frames++;
      if (reportTime >= 0.25) {
        onReport({ rock: basin.rock.state, bypass: basin.bypassShare, sideFlow: basin.discharge[1] * 1000, outflow: basin.outflow * 1000, poolDepth: basin.upstreamDepth * 1000, fps: Math.round(frames / reportTime) });
        frames = 0;
        reportTime = 0;
      }
      frame = requestAnimationFrame(draw);
    }

    function updateWater() {
      for (let i = 0; i < depths.length; i++) {
        depths[i] = basin.water[i];
        waterPositions.setY(i, basin.height[i] + Math.min(depths[i], 0.11) + 0.001);
      }
      waterPositions.needsUpdate = true;
      waterDepth.needsUpdate = true;
    }
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      capture.current = null;
      terrain.material.userData.atlas.dispose();
      waterDepth.dispose();
      observer.disconnect();
      const geometries = new Set<T.BufferGeometry>();
      const materials = new Set<T.Material>();
      scene.traverse((object) => {
        if (object instanceof T.Mesh || object instanceof T.LineSegments) {
          geometries.add(object.geometry);
          const objectMaterials: T.Material[] = Array.isArray(object.material) ? object.material : [object.material];
          objectMaterials.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [controls, onReport, capture]);
  return <div className="basin-canvas" ref={mount} hidden={hidden} />;
}
