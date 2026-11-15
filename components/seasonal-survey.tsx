"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as T from "three";
import { type BasinSeason } from "@/lib/basin-calendar";

export const surveyImageUrl = "/patagonia-survey-reference.jpg";
export type SurveyCapture = () => string;

// The banks are traced against the approved 1672 × 941 image, top to bottom.
const creek = [
  [0, 1029, 6], [92, 959, 7], [175, 944, 9], [224, 923, 13],
  [253, 924, 18], [282, 927, 17], [323, 899, 19], [358, 853, 19],
  [398, 790, 21], [429, 766, 19], [455, 764, 21], [485, 778, 22],
  [515, 801, 24], [544, 818, 24], [577, 823, 25], [604, 797, 26],
  [638, 752, 26], [670, 692, 28], [707, 654, 28], [744, 617, 29],
  [782, 592, 29], [822, 564, 30], [857, 545, 27], [902, 532, 24], [941, 521, 24],
];

function creekGuide() {
  const data = new Float32Array(256 * 4);
  let segment = 0;
  for (let i = 0; i < 256; i++) {
    const y = i / 255 * 941;
    while (segment < creek.length - 2 && y > creek[segment + 1][0]) segment++;
    const [startY, startX, startWidth] = creek[segment];
    const [endY, endX, endWidth] = creek[segment + 1];
    const progress = (y - startY) / (endY - startY);
    data[i * 4] = T.MathUtils.lerp(startX, endX, progress) / 1672;
    data[i * 4 + 1] = T.MathUtils.lerp(startWidth, endWidth, progress) / 1672;
  }
  const texture = new T.DataTexture(data, 256, 1, T.RGBAFormat, T.FloatType);
  texture.needsUpdate = true;
  return texture;
}

export function SeasonalSurvey({ season, weather, flow, highResolution, capture }: {
  season: BasinSeason;
  weather: "clear" | "storm" | "cloudburst";
  flow: number;
  highResolution: boolean;
  capture: RefObject<SurveyCapture | null>;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const state = useRef({ season, weather, flow, highResolution });
  const [ready, setReady] = useState(false);
  useEffect(() => { state.current = { season, weather, flow, highResolution }; }, [season, weather, flow, highResolution]);

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ alpha: false, antialias: false });
    } catch {
      return;
    }
    renderer.setPixelRatio(1);
    renderer.domElement.setAttribute("aria-label", "Fixed aerial view of the Patagonian valley");
    element.append(renderer.domElement);

    let imageReady = false, firstFrame = true;
    const texture = new T.TextureLoader().load(surveyImageUrl, () => { imageReady = true; });
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const guide = creekGuide();
    const uniforms = {
      photograph: { value: texture },
      creekGuide: { value: guide },
      climate: { value: new T.Vector3() },
      foliage: { value: new T.Vector2() },
      weather: { value: 0 },
      snowfall: { value: 0 },
      wind: { value: new T.Vector2() },
      current: { value: 0 },
      time: { value: 0 },
    };
    const material = new T.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 photoUv;
        void main() {
          photoUv = vec2(uv.x, 1.0 - uv.y);
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 photoUv;
        uniform sampler2D photograph;
        uniform sampler2D creekGuide;
        uniform vec3 climate;
        uniform vec2 foliage;
        uniform float weather;
        uniform float snowfall;
        uniform vec2 wind;
        uniform float current;
        uniform float time;

        float hash(vec2 p) {
          p = fract(p * vec2(.1031, .1171));
          p += dot(p, p.yx + 33.33);
          return fract((p.x + p.y) * p.x);
        }

        float noise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                     mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
        }

        void main() {
          vec2 p = photoUv;
          vec3 photo = texture2D(photograph, vec2(p.x, 1.0 - p.y)).rgb;
          float index = p.y * 255.0;
          float cell = floor(index);
          vec2 bank = mix(texture2D(creekGuide, vec2((cell + .5) / 256.0, .5)).rg,
                          texture2D(creekGuide, vec2((cell + 1.5) / 256.0, .5)).rg, fract(index));
          float spread = clamp(climate.y - 1.0 + weather * .78, -.35, 1.0);
          float waterDistance = abs(p.x - bank.x) / max(bank.y, .001);
          float wet = (1.0 - smoothstep(.65 + spread * .13, 1.03 + spread * .23, waterDistance)) * smoothstep(.07, .22, p.y);
          float luminance = dot(photo, vec3(.2126, .7152, .0722));
          float warmth = photo.r - photo.b;
          float woodland = smoothstep(.036, .108, warmth) * (1.0 - smoothstep(.37, .53, luminance));
          vec3 fresh = vec3(.85, 1.16, .83);
          vec3 rust = vec3(1.18, .91, .72);
          vec3 dormant = vec3(.98, .99, 1.01);
          vec3 colorGrade = mix(mix(dormant, fresh, foliage.x), rust, foliage.y);
          vec3 surface = mix(photo, photo * colorGrade, woodland * (1.0 - wet) * .91);

          float brokenGround = noise(p * vec2(39.0, 25.0)) * .58 + noise(p * vec2(103.0, 61.0)) * .28;
          float upperSlopes = 1.0 - p.y * .48 - (1.0 - smoothstep(.008, .32, abs(p.x-bank.x))) * .36;
          float snowLine = 1.45 - climate.x * .95;
          float snow = smoothstep(snowLine - .12, snowLine + .17, upperSlopes * .74 + brokenGround * .34);
          float exposedStone = smoothstep(.48, .71, luminance) * .37;
          snow *= climate.x * (1.0 - wet) * (1.0 - exposedStone);
          vec3 snowColor = mix(vec3(.37, .45, .54), vec3(.93, .94, .94), smoothstep(.14, .55, luminance));
          surface = mix(surface, snowColor + (luminance - .35) * .18, snow * .92);

          float movingDetail = noise(vec2((p.x - bank.x) * 410.0, p.y * 100.0 - current));
          float sheen = smoothstep(.53, .88, movingDetail) * .20;
          vec3 water = mix(photo * vec3(.81, .95, 1.05), vec3(.29, .40, .45), .25 + spread * .09);
          water += vec3(.65, .75, .80) * sheen;
          surface = mix(surface, water, wet * .72);

          float cloudShadow = noise(p * vec2(3.6, 2.2) + time * wind * .10);
          surface *= (1.02 + climate.z * .15 - cloudShadow * .09) * (1.0 - weather * .24);
          surface = mix(surface, vec3(.46, .50, .55), (1.0 - p.y) * (.026 + weather * .16));
          vec2 rainGrid = vec2((p.x - p.y * (wind.x * .18 + .16)) * 157.0, p.y * 28.0 - time * 22.0);
          vec2 streak = fract(rainGrid);
          float rainShape = (1.0 - smoothstep(.01, .09, abs(streak.x - .5))) * smoothstep(.13, .37, streak.y) * (1.0 - smoothstep(.55, .94, streak.y));
          float rain = rainShape * step(.55, hash(floor(rainGrid))) * weather * .20;
          vec2 flakeGrid = (p - time * vec2(.019 * wind.x, .069)) * vec2(100.0, 55.0);
          float snowflake = (1.0 - smoothstep(.03, .17, length(fract(flakeGrid) - .5))) * step(.74, hash(floor(flakeGrid))) * snowfall * .37;
          surface = mix(surface, vec3(.81, .86, .9), rain + snowflake);
          gl_FragColor = vec4(surface, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new T.PlaneGeometry(2, 2);
    const scene = new T.Scene();
    scene.add(new T.Mesh(geometry, material));
    const camera = new T.Camera();
    let frame = 0, previous = 0, presented = 0;
    let clock = 0;
    const climate = new T.Vector3();
    const foliage = new T.Vector2();
    const wind = new T.Vector2();

    capture.current = () => {
      if (!imageReady) return "";
      const size = renderer.getSize(new T.Vector2());
      renderer.setSize(3840, 2160, false);
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/jpeg", .94);
      } finally {
        renderer.setSize(size.x, size.y, false);
        renderer.render(scene, camera);
      }
    };

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      const elapsed = Math.min(.07, (now - previous) / 1000);
      previous = now;
      if (!imageReady || now - presented < 31) return;
      const { season: cycle, weather: weatherMode, flow: outflow, highResolution: full } = state.current;
      const interval = Math.min(.08, (now - presented) / 1000);
      presented = now;
      const displayWidth = renderer.domElement.clientWidth;
      if (!displayWidth) return;
      const width = full ? 3840 : Math.min(3072, Math.round(displayWidth * Math.min(window.devicePixelRatio, 2)));
      const height = full ? 2160 : Math.round(width * 9 / 16);
      if (renderer.domElement.width !== width || renderer.domElement.height !== height) renderer.setSize(width, height, false);
      const regional = cycle.weather;
      const rainfall = weatherMode === "cloudburst" ? 1 : weatherMode === "storm" ? .67 : Math.min(.58, (regional?.rain ?? 0) / 35);
      const lerp = firstFrame ? 1 : 1 - Math.exp(-interval * 9);
      uniforms.climate.value.lerp(climate.set(cycle.snow, cycle.inflow, cycle.light), lerp);
      uniforms.foliage.value.lerp(foliage.set(cycle.green, cycle.gold), lerp);
      const bearing = T.MathUtils.degToRad(regional?.windBearing ?? 45);
      const windSpeed = (regional?.wind ?? 12) / 28;
      uniforms.wind.value.lerp(wind.set(-Math.sin(bearing) * windSpeed, Math.cos(bearing) * windSpeed), lerp);
      uniforms.weather.value = T.MathUtils.lerp(uniforms.weather.value, rainfall, lerp);
      uniforms.snowfall.value = T.MathUtils.lerp(uniforms.snowfall.value, Math.min(.84, (regional?.snow ?? 0) / 11), lerp);
      uniforms.current.value = (uniforms.current.value + Math.max(elapsed, interval) * (4.5 + cycle.inflow * 9 + outflow * .22 + rainfall * 6)) % 8192;
      clock += interval;
      uniforms.time.value = clock;
      renderer.render(scene, camera);
      if (firstFrame) { firstFrame = false; setReady(true); }
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      capture.current = null;
      geometry.dispose();
      material.dispose();
      texture.dispose();
      guide.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [capture]);

  return <div className="seasonal-survey" ref={mount} data-ready={ready}>
    <img src={surveyImageUrl} alt="Aerial view of the Patagonian valley, creek and lenga woodland" />
  </div>;
}
