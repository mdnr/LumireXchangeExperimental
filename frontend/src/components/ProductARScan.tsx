import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyProductMaterials } from '../lib/modelMaterials';
import type { Material, ModelMaterial } from '../lib/types';

interface ProductARScanProps {
  modelUrl: string;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  revision?: string | number;
  usdzUrl?: string;
  onExit: () => void;
}

const MIN_WRIST_PX = 28;
const WATCH_WIDTH_FACTOR = 1.0;
const WATCH_ARM_OFFSET = 0.45;
// How far the case stands off the skin, as a fraction of wrist width. A wrist is
// a little over twice as wide as it is deep, so ~0.45 sits close to a real
// forearm without burying the case in it.
const ARM_RADIUS_FACTOR = 0.45;
// How hard the watch rocks as the wrist rolls, in degrees. This is a hard cap:
// the watch face never leans further than this away from the lens, so it always
// shows its dial and never turns its back or slides out of shot. Tunable with
// ?ar-tilt= if you want it more or less dramatic.
const MAX_TILT_DEG = 55;
// How quickly a given palm-facing reading turns into lean. Higher reacts faster
// to small rotations.
const ROLL_GAIN = 2.2;
const HOLD_MS = 350;
const TRACK_MS = 110;
const MEDIAPIPE_BASE = `${import.meta.env.BASE_URL}mediapipe/`;
const DEBUG = new URLSearchParams(window.location.search).has('ar-debug');
const PARAMS = new URLSearchParams(window.location.search);
const numParam = (key: string, fallback: number) => {
  const raw = Number.parseFloat(PARAMS.get(key) ?? '');
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};
const ARM_RADIUS_TUNABLE = numParam('ar-arm', ARM_RADIUS_FACTOR);
const MAX_TILT_RAD = (Math.min(85, numParam('ar-tilt', MAX_TILT_DEG)) * Math.PI) / 180;
const USDZ_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

interface LandmarkPoint {
  x: number;
  y: number;
  // MediaPipe does report a z, but it is regressed from synthetic renders rather
  // than measured, so it is deliberately not read anywhere in this file. The
  // palm-facing signal that drives the watch is computed from x and y alone,
  // which is exact - see the cross product note where it is derived.
  z: number;
}
interface ScanResults {
  multiHandLandmarks: Array<Array<LandmarkPoint>>;
}
interface HandController {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: ScanResults) => void) => void;
  send: (input: { image: HTMLVideoElement | HTMLCanvasElement }) => Promise<unknown>;
  close: () => Promise<void>;
}
interface HandModule {
  Hands: new (options: { locateFile: (file: string) => string }) => HandController;
}

let handsLibPromise: Promise<HandModule> | null = null;

function loadHandsLib(): Promise<HandModule> {
  if (!handsLibPromise) {
    handsLibPromise = new Promise((resolve, reject) => {
      const w = window as unknown as { Hands?: HandModule['Hands'] };
      if (w.Hands) {
        resolve({ Hands: w.Hands });
        return;
      }
      const script = document.createElement('script');
      script.src = `${MEDIAPIPE_BASE}hands.js`;
      script.async = true;
      script.onload = () => (w.Hands ? resolve({ Hands: w.Hands }) : reject(new Error('mediapipe failed')));
      script.onerror = () => reject(new Error('Could not load the AR tracking engine.'));
      document.head.appendChild(script);
    });
  }
  return handsLibPromise;
}

function stripScanTextures(root: THREE.Object3D) {
  const freq = new Map<number, number>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      const hex = mat.color.getHex();
      const l = mat.color.r * 0.299 + mat.color.g * 0.587 + mat.color.b * 0.114;
      if (hex !== 0xffffff && l < 0.95) freq.set(hex, (freq.get(hex) ?? 0) + 1);
    }
  });
  const palette = [...freq.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const band = new THREE.Color(palette[0] ?? 0x26354a);
  const body = new THREE.Color(palette[1] ?? 0xc8cdd5);
  const accent = new THREE.Color(palette[Math.min(2, palette.length - 1)] ?? 0x98a1ab);
  const face = new THREE.Color(0x0b1016);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      mat.map = null;
      mat.normalMap = null;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.aoMap = null;
      mat.emissiveMap = null;
      mat.alphaMap = null;
      const name = `${mat.name} ${obj.name}`;
      let color: THREE.Color;
      if (/glass|screen|display|dial|face|lcd|tft|lenz/i.test(name)) {
        color = face;
      } else if (/band|strap|silicone|bracelet|nato|wrist|poly/i.test(name)) {
        color = band;
      } else if (/crown|button|knob|side/i.test(name)) {
        color = accent;
      } else {
        color = body;
      }
      mat.color.copy(color);
      mat.side = THREE.DoubleSide;
      mat.needsUpdate = true;
    }
  });
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const modelCache = new Map<string, Promise<{ scene: THREE.Group; materials: Record<string, THREE.Material> }>>();

function loadModel(url: string) {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        new GLTFLoader().load(
          url,
          (gltf) => {
            const g = gltf as typeof gltf & { materials?: Record<string, THREE.Material> };
            resolve({ scene: gltf.scene, materials: g.materials ?? {} });
          },
          undefined,
          reject,
        );
      }),
    );
  }
  return modelCache.get(url)!;
}

export function ProductARScan({ modelUrl, material, modelMaterials, revision, usdzUrl, onExit }: ProductARScanProps) {
  const fetchUrl = revision ? `${modelUrl}?v=${revision}` : modelUrl;

  const videoRef = useRef<HTMLVideoElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLCanvasElement>(null);
  const flipRef = useRef<() => void>(null);
  const stateRef = useRef({
    stream: null as MediaStream | null,
    hands: null as HandController | null,
    raf: 0,
  });

  const [mirror, setMirror] = useState(true);
  const [status, setStatus] = useState<'starting' | 'scan' | 'worn' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const gl = glRef.current;
    const video = videoRef.current;
    if (!gl || !video) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setError('3D rendering is not supported on this device.');
      setStatus('error');
      return undefined;
    }
    renderer.setClearColor(0x000000, 0);
    gl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(-6, 0, -4);
    scene.add(rimLight);
    const watchGroup = new THREE.Group();
    const wristAnchor = new THREE.Object3D();
    scene.add(wristAnchor);
    wristAnchor.add(watchGroup);

    // No occluder, deliberately. Masking the watch against the arm was cutting
    // away parts of it that should stay visible, and a watch that ducks behind
    // your wrist when you turn your hand is not what a try-on is for. Instead the
    // watch is pinned to whichever side of the wrist faces the lens, so it is
    // solid and visible for the whole gesture and only its own back is ever
    // hidden, which happens automatically once its face is toward the camera.
    const CAM_DIR = new THREE.Vector3(0, 0, 1);

    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 10);

    const refreshSize = () => {
      const w = gl.clientWidth || window.innerWidth;
      const h = gl.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      cam.left = -w / 2;
      cam.right = w / 2;
      cam.top = h / 2;
      cam.bottom = -h / 2;
      cam.updateProjectionMatrix();
    };
    refreshSize();
    window.addEventListener('resize', refreshSize);

    let mirrorCurrent = true;

    const model = { cached: false, maxDim: 1, sceneObj: null as THREE.Group | null };
    const pose = {
      x: 0,
      y: 0,
      wristPx: 0,
      // The arm axis in scene pixels: screen position of the wrist, and the unit
      // direction the forearm runs in.
      axis: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 1, 0),
      armR: 1,
      // Low-passed 2D palm facing: positive when the palm squares up to the
      // lens, negative when the back of the hand does.
      palm: 0,
      rel: 0,
      face: 1,
      visible: false,
    };
    // The pose the wrist was in when tracking first locked, used to zero the tilt
    // so the watch always starts square to the lens.
    const rest = { palm: null as number | null };
    // Scratch vectors for the wrist frame. +x runs along the forearm, +z is the
    // outward face of the watch.
    // The wrist frame is rebuilt from the 3D landmarks every frame: +x runs
    // along the forearm, +z is the outward face of the watch. Handing the model
    // a full basis instead of two screen-space angles is what lets a
    // palm-to-back flip swing the watch right around the arm.
    const anchor = new THREE.Vector3();
    const armDir = new THREE.Vector3(0, 1, 0);
    const faceDir = new THREE.Vector3(0, 0, 1);
    const across = new THREE.Vector3(1, 0, 0);
    const armNormal = new THREE.Vector3(0, 1, 0);
    const poseBasis = new THREE.Matrix4();
    const watchQuat = new THREE.Quaternion();
    let cameraReady = false;
    let engineReady = false;
    let tracking = false;
    let lastTrack = 0;
    let lastDiagDraw = 0;
    let glFrames = 0;
    let holdUntil = 0;

    const diag = { state: 'idle' as 'idle' | 'loading' | 'ready' | 'error', hands: 0, wristPx: 0, lastMs: 0, sends: 0, sendMs: 0, err: '' };

    const sendCanvas = document.createElement('canvas');
    const getSendImage = () => {
      const vw = video.videoWidth || 720;
      const vh = video.videoHeight || 1280;
      const scale = Math.min(1, 512 / Math.max(vw, vh));
      const w = Math.max(1, Math.floor(vw * scale));
      const h = Math.max(1, Math.floor(vh * scale));
      if (sendCanvas.width !== w) sendCanvas.width = w;
      if (sendCanvas.height !== h) sendCanvas.height = h;
      const c = sendCanvas.getContext('2d');
      if (c) c.drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
      return sendCanvas;
    };

    const getDims = () => {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const sw = gl.clientWidth || window.innerWidth;
      const sh = gl.clientHeight || window.innerHeight;
      const cover = Math.max(sw / vw, sh / vh);
      const visW = sw / cover;
      const visH = sh / cover;
      return { vw, vh, sw, sh, cover, ox: (vw - visW) / 2, oy: (vh - visH) / 2 };
    };
    const toScreen = (p: LandmarkPoint) => {
      const d = getDims();
      let sx = (p.x * d.vw - d.ox) * d.cover;
      if (mirrorCurrent) sx = d.sw - sx;
      return { x: sx - d.sw / 2, y: (p.y * d.vh - d.oy) * d.cover - d.sh / 2 };
    };
    const drawDebug = (hand: LandmarkPoint[] | null) => {
      if (!DEBUG) return;
      const c = debugRef.current;
      if (!c) return;
      const w = gl.clientWidth;
      const h = gl.clientHeight;
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const d = getDims();
      if (hand) {
        const pts = hand.map((p) => toScreen(p));
        pts.forEach((pt, i) => {
          ctx.beginPath();
          ctx.arc(pt.x + w / 2, pt.y + h / 2, i === 0 || i === 5 || i === 9 ? 8 : 5, 0, Math.PI * 2);
          ctx.fillStyle = i === 0 ? '#ff5252' : i === 5 ? '#69f0ae' : i === 9 ? '#ffd740' : '#ffffff';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(pts[0].x + w / 2, pts[0].y + h / 2);
        ctx.lineTo(pts[5].x + w / 2, pts[5].y + h / 2);
        ctx.lineTo(pts[9].x + w / 2, pts[9].y + h / 2);
        ctx.strokeStyle = '#69f0ae';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const age = diag.lastMs ? Math.round(performance.now() - diag.lastMs) : -1;
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
      ctx.fillRect(8, 8, 330, 96);
      ctx.fillStyle = '#4dd0e1';
      ctx.fillText(`engine: ${diag.state}   video: ${d.vw}x${d.vh}`, 14, 24);
      ctx.fillText(`hands: ${diag.hands}   wrist: ${Math.round(diag.wristPx)}px   gl: ${glFrames}fr`, 14, 40);
      ctx.fillText(
        `roll: ${pose.rel.toFixed(2)} from rest   face: ${pose.face > 0 ? 'palm to lens' : 'back to lens'} (${pose.face.toFixed(2)})   cap: ${Math.round((MAX_TILT_RAD * 180) / Math.PI)}deg`,
        14,
        56,
      );
      ctx.fillText(
        `standoff: ${Math.round(pose.armR)}px   wrist: ${Math.round(pose.wristPx)}px   depth: ${Math.round(cam.far)}px`,
        14,
        72,
      );
      ctx.fillText(
        diag.err
          ? `err: ${diag.err.slice(0, 42)}`
          : `last result: ${age >= 0 ? `${age}ms ago` : 'never'}   send time: ${diag.sendMs}ms`,
        14,
        88,
      );
    };

    const s = stateRef.current;

    const maybeStartEngine = () => {
      if (engineReady || disposed) return;
      if (!model.cached || !cameraReady || !s.stream) return;
      engineReady = true;
      diag.state = 'loading';
      loadHandsLib()
        .then(({ Hands: HandsCtor }) => {
          if (disposed) return;
          const hands = new HandsCtor({ locateFile: (file) => `${MEDIAPIPE_BASE}${file}` });
          hands.setOptions({
            modelComplexity: 0,
            maxNumHands: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          hands.onResults((results: ScanResults) => {
            diag.hands = results.multiHandLandmarks.length > 0 ? 1 : 0;
            diag.lastMs = performance.now();
            const lmOut = results.multiHandLandmarks[0];
            drawDebug(lmOut ?? null);
            const found = Boolean(lmOut);
            const lost = (): void => {
              if (performance.now() < holdUntil) return;
              pose.visible = false;
              if (ringRef.current) ringRef.current.style.opacity = '0';
              setStatus((prev) => (prev === 'worn' ? 'scan' : prev));
            };
            if (!found) {
              lost();
              return;
            }
            const p0 = toScreen(lmOut[0]);
            const p5 = toScreen(lmOut[5]);
            const p9 = toScreen(lmOut[9]);
            const wristPx = dist(p0, p5);
            diag.wristPx = wristPx;
            if (wristPx < MIN_WRIST_PX) {
              lost();
              return;
            }
            const dx = p0.x - p9.x;
            const dy = p0.y - p9.y;
            const len = Math.hypot(dx, dy) || 1;
            const offset = WATCH_ARM_OFFSET * wristPx;
            pose.x = p0.x + (dx / len) * offset;
            pose.y = p0.y + (dy / len) * offset;
            pose.wristPx = wristPx;

            // The palm normal's camera-facing component, computed from 2D only.
            //
            // For the palm normal n = a x b, the z component is a.x*b.y - a.y*b.x -
            // the z terms of a and b cancel out of it completely, so this is exact
            // and needs no depth at all. That matters because MediaPipe's landmark
            // z is regressed from synthetic renders rather than measured, so
            // anything built on it is noise: the watch never had a clean rotation
            // signal to follow, which is why it would not turn.
            //
            // a runs wrist -> middle knuckle (along the forearm), b runs index
            // knuckle -> ring knuckle (across the palm). Screen y points down, so
            // the sign is inverted relative to a y-up frame.
            const ax = p9.x - p0.x;
            const ay = p9.y - p0.y;
            const p13 = toScreen(lmOut[13]);
            const bx = p13.x - p5.x;
            const by = p13.y - p5.y;
            const palmScale = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1;
            // Normalised so it is scale free: near +1 when the palm squares up to
            // the lens, near 0 when the wrist is edge on, and negative once the
            // back of the hand turns toward the camera.
            const palmFacing = (ax * by - ay * bx) / palmScale;
            // Calibrate against however you happen to be holding your hand when
            // tracking first locks, so the watch starts square to the lens
            // whichever way your wrist is turned and then responds to the
            // movement from there. Without this it would start life tilted, and
            // which way it started would depend on your hand and which side of
            // your wrist you happened to hold up.
            if (rest.palm === null) rest.palm = palmFacing;
            // Low-pass it. The raw signal is exact but the landmarks themselves
            // jitter, and a hard sign flip would snap the watch between sides.
            pose.palm += (palmFacing - pose.palm) * 0.25;
            const rel = pose.palm - rest.palm;
            // The face blend is low-passed rather than switched, so a flip eases
            // the watch through facing the lens instead of snapping between two
            // angles. The deadband stops a hand hovering near edge-on from
            // chattering.
            const faceTarget = rel > 0.05 ? 1 : rel < -0.05 ? -1 : pose.face;
            pose.face += (faceTarget - pose.face) * 0.18;
            pose.rel = rel;
            pose.dir.set(ax / len, -ay / len, 0).normalize();
            pose.axis.set(pose.x, -pose.y, -0.5);

            pose.armR = ARM_RADIUS_TUNABLE * wristPx;
            pose.visible = true;
            holdUntil = performance.now() + HOLD_MS;
            setStatus('worn');
          });
          s.hands = hands;
          diag.state = 'ready';
        })
        .catch(() => {
          engineReady = false;
          diag.state = 'error';
          if (!disposed) {
            setError('Could not load the AR tracking engine.');
            setStatus('error');
          }
        });
    };

    const stopStream = () => {
      s.stream?.getTracks().forEach((t) => t.stop());
      s.stream = null;
      video.srcObject = null;
    };

    const startCamera = async (useFacing: 'user' | 'environment') => {
      stopStream();
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: useFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          if (useFacing === 'user') throw new Error('front-camera-unavailable');
          // Some devices only honour a bare video request for the rear camera.
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        s.stream = stream;
        mirrorCurrent = useFacing === 'user';
        setMirror(mirrorCurrent);
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        await video.play();
        cameraReady = true;
        setStatus('scan');
        if (window.setTimeout) window.setTimeout(() => maybeStartEngine(), 350);
        else maybeStartEngine();
      } catch (e) {
        if (!disposed) {
          setStatus('error');
          setError(
            e instanceof DOMException && e.name === 'NotAllowedError'
              ? 'Camera access was denied. Please allow camera access and try again.'
              : 'Camera is not available on this device.',
          );
        }
      }
    };

    flipRef.current = () => {
      void startCamera(mirrorCurrent ? 'environment' : 'user');
    };

    loadModel(fetchUrl)
      .then(({ scene: modelScene, materials }) => {
        if (disposed) return;
        const fresh = modelScene.clone(true);
        applyProductMaterials(fresh, materials, material, modelMaterials);
        const box = new THREE.Box3().setFromObject(fresh);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.maxDim = Math.max(size.x, size.y, size.z) || 1;
        fresh.position.set(-center.x, -center.y, -center.z);
        fresh.quaternion.identity();
        stripScanTextures(fresh);
        model.sceneObj = fresh;
        watchGroup.add(fresh);
        model.cached = true;
        maybeStartEngine();
      })
      .catch(() => {
        if (!disposed) {
          setError('Could not load the 3D model.');
          setStatus('error');
        }
      });

    void startCamera('user');

    const loop = () => {
      try {
        if (video.readyState >= 2 && s.hands) {
          const now = performance.now();
          if (!tracking && now - lastTrack >= TRACK_MS) {
            tracking = true;
            lastTrack = now;
            diag.sends++;
            const t0 = performance.now();
            void s.hands
              .send({ image: getSendImage() })
              .then(() => {
                diag.sendMs = Math.round(performance.now() - t0);
              })
              .catch((e) => {
                diag.err = String(e instanceof Error ? e.message : e);
              })
              .finally(() => {
                tracking = false;
              });
            window.setTimeout(() => {
              if (tracking) tracking = false;
            }, 2500);
          }
          if (now - lastDiagDraw > 600) {
            lastDiagDraw = now;
            drawDebug(null);
          }
        }
        if (model.cached) {
          watchGroup.visible = pose.visible;
          if (pose.visible) {
            // One smoothed frame drives the watch, so it cannot lag the wrist.
            anchor.lerp(pose.axis, 0.45);
            armDir.lerp(pose.dir, 0.45).normalize();

            // Tilt the watch by how far the wrist has rolled, taken straight from
            // the measured palm facing. It leans furthest when the wrist is edge
            // on and comes back square as either side turns toward the lens, so
            // the watch rocks as you move your hand and always ends up facing
            // you. Saturating with tanh keeps small movements responsive while
            // capping the lean at MAX_TILT, so the watch can never rotate far
            // enough to show its back or leave the screen.
            //
            // The magnitude comes from the size of the roll and the direction
            // from which face is presented. That split is forced by the signal:
            // palmFacing is sin(theta), so it is identical for an equal roll in
            // either direction and no 2D method can tell the two apart. Rather
            // than pretend otherwise, the watch leans out and back symmetrically
            // and eases through facing the lens as you turn your hand over.
            const mag = MAX_TILT_RAD * Math.tanh(Math.atan(Math.abs(pose.rel) * ROLL_GAIN) / MAX_TILT_RAD);
            const tilt = mag * pose.face;

            // The watch face starts pointing at the lens and leans by the tilt,
            // rotating about the forearm so the lean reads as the wrist rolling
            // rather than the watch sliding around the arm.
            across.set(-armDir.y, armDir.x, 0);
            if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
            across.normalize();
            faceDir.copy(CAM_DIR).multiplyScalar(Math.cos(tilt)).addScaledVector(across, -Math.sin(tilt)).normalize();
            armNormal.crossVectors(faceDir, armDir).normalize();
            poseBasis.makeBasis(armNormal, armDir, faceDir);
            watchGroup.quaternion.slerp(watchQuat.setFromRotationMatrix(poseBasis), 0.35);

            // Seated on the skin on the side the lens can see.
            watchGroup.position.copy(anchor).addScaledVector(faceDir, pose.armR);

            const pxPerModelWidth = (WATCH_WIDTH_FACTOR * pose.wristPx) / model.maxDim;
            watchGroup.scale.setScalar(pxPerModelWidth);
            const depth = Math.max(1e-6, model.maxDim * pxPerModelWidth) + 4;
            if (Math.abs(cam.far - depth) > 1e-3) {
              cam.near = -depth;
              cam.far = depth;
              cam.updateProjectionMatrix();
            }
            if (ringRef.current) {
              ringRef.current.style.left = `${pose.x + gl.clientWidth / 2}px`;
              ringRef.current.style.top = `${pose.y + gl.clientHeight / 2}px`;
              ringRef.current.style.opacity = '1';
            }
          } else if (ringRef.current) {
            ringRef.current.style.opacity = '0';
          }
        }
        try {
          renderer.render(scene, cam);
          glFrames++;
        } catch (e) {
          diag.err = `gl: ${e instanceof Error ? e.message.slice(0, 36) : String(e)}`;
        }
      } catch {
        // keep the loop resilient in case a frame fails on a given device
      }
      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(s.raf);
      window.removeEventListener('resize', refreshSize);
      stopStream();
      void s.hands?.close();
      renderer.dispose();
      renderer.forceContextLoss();
      if (gl.contains(renderer.domElement)) gl.removeChild(renderer.domElement);
    };
  }, [fetchUrl, material, modelMaterials]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = glRef.current?.querySelector('canvas');
    const w = canvas?.width ?? 0;
    const h = canvas?.height ?? 0;
    if (!video || !canvas || !w || !h) return;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.save();
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    ctx.drawImage(canvas, 0, 0, w, h);
    setPhoto(out.toDataURL('image/png'));
  };

  return (
    <div className="ar-layer">
      <video
        ref={videoRef}
        className={`ar-scan-video ${mirror ? 'ar-scan-mirror' : ''}`}
        playsInline
        muted
      />
      {DEBUG && <canvas ref={debugRef} className="ar-scan-debug" />}
      <div ref={glRef} className="ar-scan-gl" />
      <div ref={ringRef} className="ar-wrist-ring" />
      <div className="ar-controls ar-controls-scan">
        {status === 'error' ? (
          <div className="ar-start-panel">
            <p className="ar-error" role="alert">{error}</p>
            {usdzUrl && (
              <a className="btn btn-ghost ar-usdz-link" href={usdzUrl} rel="ar">
                <img src={USDZ_POSTER} alt="" aria-hidden="true" />
                No camera? Open model in AR instead
              </a>
            )}
            <button type="button" className="btn btn-primary" onClick={() => flipRef.current?.()}>
              Retry camera
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Close
            </button>
          </div>
        ) : status === 'starting' ? (
          <p className="ar-hint">Starting camera…</p>
        ) : (
          <div className="ar-panel">
            <p className="ar-hint ar-hint-banner">
              {status === 'worn'
                ? 'The watch is on your wrist — take a photo!'
                : 'Let the camera see your wrist — bring it into view and close enough.'}
            </p>
            <div className="ar-btn-row">
              <button type="button" className="ar-flip" onClick={() => flipRef.current?.()} aria-label="Switch camera">
                ⇄
              </button>
              <button type="button" className="btn btn-primary" onClick={takePhoto} disabled={status !== 'worn'}>
                Take photo
              </button>
              <button type="button" className="ar-exit" onClick={onExit}>
                Exit
              </button>
            </div>
          </div>
        )}
      </div>
      {photo && (
        <div className="ar-photo-modal">
          <img src={photo} alt="Your AR preview" />
          <div className="ar-btn-row">
            <a className="btn btn-primary" href={photo} download="agora-ar-watch.png">
              Save photo
            </a>
            <button type="button" className="btn btn-ghost" onClick={() => setPhoto(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}