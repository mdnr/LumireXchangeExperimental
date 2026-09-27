import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyProductMaterials } from '../lib/modelMaterials';
import type { Material, ModelAlignment, ModelMaterial } from '../lib/types';
import { toWristAlignment, WATCH_WIDTH_FACTOR, type WristAlignment } from '../lib/wristAlignment';

interface ProductARScanProps {
  modelUrl: string;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  /**
   * The seller's saved wrist placement. Held in a ref rather than read during
   * render, because the whole camera and tracker session is built in one effect
   * and this must never be a reason to tear it down and ask for camera access
   * again mid-session.
   */
  alignment?: ModelAlignment | null;
  revision?: string | number;
  usdzUrl?: string;
  onExit: () => void;
}

const MIN_WRIST_PX = 28;
const HOLD_MS = 350;
const TRACK_MS = 110;
// Where along the forearm the watch's origin is seated, in wrist widths, measured
// from the wrist landmark toward the middle of the palm. This is the tracker's
// own geometry and says nothing about the model, which is why it survives the
// removal of the orientation guessing: the hand landmarks are fixed points, so
// this only decides which point the model is hung from.
const WATCH_ARM_OFFSET = 0.45;
const MEDIAPIPE_BASE = `${import.meta.env.BASE_URL}mediapipe/`;
const DEBUG = new URLSearchParams(window.location.search).has('ar-debug');
const USDZ_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ---------------------------------------------------------------------------
// The watch's placement is not worked out here. It is stated, once, by the seller
// on the align page against a reference hand, and arrives as a saved alignment.
// The frame itself, and the reading of one, live in lib/wristAlignment.ts, shared
// with the page the seller aligns on.
// ---------------------------------------------------------------------------

interface LandmarkPoint {
  x: number;
  y: number;
  // MediaPipe reports depth in the same scale as x, smaller = nearer the
  // camera. Dropping it is what made a palm-to-back flip untrackable: without
  // depth there is no way to tell which side of the wrist you are looking at.
  z: number;
}
interface ScanResults {
  multiHandLandmarks: Array<Array<LandmarkPoint>>;
  // The metric 3D hand, in metres, centred on the hand. This is a genuinely
  // different measurement from the landmarks above: their z is a depth guess
  // normalised against the image, whereas these are a real reconstruction and
  // are what the wrist rotation is actually derived from.
  multiHandWorldLandmarks?: Array<Array<LandmarkPoint>>;
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

export function ProductARScan({ modelUrl, material, modelMaterials, alignment, revision, usdzUrl, onExit }: ProductARScanProps) {
  const fetchUrl = revision ? `${modelUrl}?v=${revision}` : modelUrl;

  // Mirrored into a ref so the effect that owns the camera session can read the
  // current alignment every frame without depending on it. Adding it to that
  // effect's dependency list would restart the camera and the hand tracker, and on
  // a phone that means asking for camera permission again mid-try-on.
  const alignRef = useRef<WristAlignment>(toWristAlignment(alignment));
  useEffect(() => {
    alignRef.current = toWristAlignment(alignment);
  }, [alignment]);

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

    // Axis probe. The watch is parented here and the model is recentred on its
    // own bounding box, so the group origin is the model centre and an arrow
    // drawn along a local axis shows exactly where that axis points on screen.
    // A bounding box says which axis is the thinnest but not which one the dial
    // actually faces, and the two came apart on this model, so the dial axis is
    // read off the screen instead of being inferred. Labels rather than colours,
    // because red against green is the one pair that cannot be told apart.
    const AXES = new URLSearchParams(window.location.search).has('ar-axes');
    if (AXES) {
      const label = (text: string, hex: number) => {
        const c = document.createElement('canvas');
        c.width = 96;
        c.height = 96;
        const g = c.getContext('2d');
        if (g) {
          g.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
          g.font = 'bold 64px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, 48, 50);
        }
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })
        );
        s.scale.setScalar(0.17);
        return s;
      };
      const probe = new THREE.Group();
      const axes: [string, THREE.Vector3, number][] = [
        ['X', new THREE.Vector3(1, 0, 0), 0xff453a],
        ['Y', new THREE.Vector3(0, 1, 0), 0x32d74b],
        ['Z', new THREE.Vector3(0, 0, 1), 0x0a84ff],
      ];
      for (const [name, dir, hex] of axes) {
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.15, hex, 0.055, 0.035);
        arrow.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (m) {
            for (const one of Array.isArray(m) ? m : [m]) {
              one.depthTest = false;
              one.transparent = true;
            }
          }
        });
        arrow.renderOrder = 999;
        const tag = label(name, hex);
        tag.position.copy(dir).multiplyScalar(0.2);
        tag.renderOrder = 1000;
        probe.add(arrow, tag);
      }
      watchGroup.add(probe);
    }

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
      visible: false,
      x: 0,
      y: 0,
      wristPx: 0,
      // The arm axis in scene pixels. The watch and both occluder proxies are
      // driven from this single frame, so the proxy can never drift a frame
      // behind the watch and make the occlusion crawl along the silhouette.
      axis: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 1, 0),
      normal: new THREE.Vector3(0, 0, 1),
      // The measured wrist twist, kept purely for the debug readout now that
      // the watch is held facing the camera.
      far: false,
      // True once a metric 3D frame has been accepted, which is what switches
      // the watch from the pinned camera facing pose to real wrist rotation.
      metric3d: false,
    };
    // The palm frame rebuilt from the metric hand each detection. +y runs along
    // the forearm, +x is the outward palm normal the dial faces, and +z spans
    // the knuckles. Keeping it as a real orthonormal frame, rather than a pair
    // of screen angles, is what gives the roll a direction and a full range
    // instead of the symmetric sin(theta) the 2D landmarks can only produce.
    const wArm = new THREE.Vector3();
    const wAcross = new THREE.Vector3();
    const wNormal = new THREE.Vector3();
    // Locked once, on the first metric frame, so the watch keeps the side of
    // the wrist that was facing the lens when tracking engaged. Re-deriving the
    // sign every frame would flip the watch end over end as the roll passed
    // through zero.
    const roll = { decided: false, sign: 1, ref: new THREE.Vector3(0, 0, 1), refCross: new THREE.Vector3(1, 0, 0), deg: 0 };
    // The wrist frame is rebuilt from the 3D landmarks every frame: +x runs
    // along the forearm, +z is the outward face of the watch. Handing the model
    // a full basis instead of two screen-space angles is what lets a
    // palm-to-back flip swing the watch right around the arm.
    const vUp = new THREE.Vector3();
    const vRad = new THREE.Vector3();
    const vOut = new THREE.Vector3();
    const vX = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const side = { sign: 1, decided: true, palm: 0 };
    const anchor = new THREE.Vector3();
    const armDir = new THREE.Vector3(0, 1, 0);
    const wristNormal = new THREE.Vector3(0, 0, 1);
    const faceDir = new THREE.Vector3(0, 0, 1);
    const across = new THREE.Vector3(1, 0, 0);
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
      // Built as a list and measured, so lines can never be laid over each other
      // and the panel always fits whatever is in it.
      const lines = [
        `engine ${diag.state}   video ${d.vw}x${d.vh}   gl ${glFrames}fr`,
        `hands ${diag.hands}   wrist ${Math.round(diag.wristPx)}px   roll ${
          pose.metric3d ? `${roll.deg.toFixed(0)}deg 3D` : 'PINNED'
        }`,
        `palmN  ${wristNormal.x.toFixed(2)}  ${wristNormal.y.toFixed(2)}  ${wristNormal.z.toFixed(2)}`,
        `armD   ${armDir.x.toFixed(2)}  ${armDir.y.toFixed(2)}  ${armDir.z.toFixed(2)}`,
        `align ${alignRef.current.quat.w === 1 && !alignRef.current.offset.lengthSq() ? 'NONE (seller has not aligned this)' : 'saved'}`,
        `wristW ${Math.round(pose.wristPx)}px   off ${alignRef.current.offset.x.toFixed(2)} ${alignRef.current.offset.y.toFixed(2)} ${alignRef.current.offset.z.toFixed(2)}   x${alignRef.current.scale.toFixed(2)}`,
        ...(AXES ? ['probe: X red  Y green  Z blue'] : []),
        diag.err ? `ERR ${diag.err.slice(0, 40)}` : `result ${age >= 0 ? `${age}ms` : 'never'}   send ${diag.sendMs}ms`,
      ];
      const size = Math.max(11, Math.min(15, Math.round(w / 34)));
      const lh = size + 5;
      ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const pad = 8;
      const boxW = Math.min(w - 16, Math.ceil(ctx.measureText(lines.reduce((a, l) => (l.length > a.length ? l : a), '')).width) + pad * 2);
      const boxH = lines.length * lh + pad * 2 - 4;
      ctx.fillStyle = 'rgba(8, 8, 16, 0.82)';
      ctx.fillRect(8, 8, boxW, boxH);
      ctx.strokeStyle = 'rgba(77, 208, 225, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(8.5, 8.5, boxW - 1, boxH - 1);
      lines.forEach((line, i) => {
        // The two numbers that decide the bug are called out so they are not
        // lost in the noise on a small screen.
        ctx.fillStyle = line.startsWith('palmN') ? '#ffd740' : line.startsWith('armD') ? '#4dd0e1' : '#e8e8f0';
        ctx.fillText(line, 8 + pad, 8 + pad + lh * i + size);
      });
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

            // Landmarks arrive with x scaled by image width and y by image
            // height, so x is multiplied by the aspect ratio to put all three
            // axes into the single unit MediaPipe uses for z.
            const d = getDims();
            const aspect = Math.max(d.vw, 1) / Math.max(d.vh, 1);
            const lx = (i: number) => lmOut[i].x * aspect;
            const ly = (i: number) => lmOut[i].y;
            const lz = (i: number) => {
              const z = lmOut[i].z;
              // If a build of the tracker ever omits depth, fall back to zero so
              // the watch stays on the wrist instead of vanishing on a NaN.
              return typeof z === 'number' && Number.isFinite(z) ? z : 0;
            };

            // Landmark depth grows away from the lens while the ortho scene's
            // depth grows toward it, and landmark y grows downward while scene y
            // grows up, so the frame is built directly in scene space. z is
            // normalised against image width like x is, so it takes the same
            // aspect correction to land in a shared unit.
            vUp.set(lx(9) - lx(0), -(ly(9) - ly(0)), -(lz(9) - lz(0)) * aspect);
            vRad.set(lx(5) - lx(17), -(ly(5) - ly(17)), -(lz(5) - lz(17)) * aspect);
            vOut.crossVectors(vUp, vRad);
            if (vOut.lengthSq() < 1e-8) {
              lost();
              return;
            }
            vOut.normalize();
            side.palm = vOut.z;

            // Decide once which side of the wrist the watch sits on, assuming
            // it is the side facing the lens when tracking first locks. Deciding
            // once and then following the frame continuously avoids re-deriving
            // the sign every frame, which would make the watch spin.
            if (!side.decided) {
              side.decided = true;
              side.sign = vOut.z > 0 ? 1 : -1;
            }

            vX.copy(vUp).normalize();
            vZ.copy(vOut).multiplyScalar(side.sign).projectOnPlane(vX);
            if (vZ.lengthSq() < 1e-8) {
              lost();
              return;
            }
            vZ.normalize();
            pose.dir.copy(vX);
            pose.normal.copy(vZ);
            pose.metric3d = false;

            // Prefer the metric reconstruction for the orientation. The frame
            // is a real right handed orthonormal basis, so the angle of the palm
            // normal around the forearm is a signed angle over the full circle,
            // which is exactly what the image landmarks could not supply: their
            // cross product only recovers sin(theta), the same value for an
            // equal roll either way. Position still comes from the 2D landmarks
            // above, which track accurately.
            const wl = results.multiHandWorldLandmarks?.[0];
            if (wl && wl.length >= 14) {
              // Metric hand space is x right, y down and z away from the lens,
              // while the scene is y up and z toward it, so y and z flip. Only
              // directions matter here, the metre scale is irrelevant.
              const wx = (i: number) => wl[i].x;
              const wy = (i: number) => -wl[i].y;
              const wz = (i: number) => -wl[i].z;
              wArm.set(wx(9) - wx(0), wy(9) - wy(0), wz(9) - wz(0));
              // Index knuckle to ring knuckle, across the palm.
              wAcross.set(wx(13) - wx(5), wy(13) - wy(5), wz(13) - wz(5));
              if (wArm.lengthSq() > 1e-8 && wAcross.lengthSq() > 1e-8) {
                wArm.normalize();
                wAcross.normalize();
                wNormal.crossVectors(wArm, wAcross);
                if (wNormal.lengthSq() > 1e-8) {
                  wNormal.normalize();
                  if (!roll.decided) {
                    roll.decided = true;
                    // Keep whichever side of the wrist faced the lens at the
                    // moment tracking engaged, so the watch does not jump to
                    // the other side of the arm.
                    roll.sign = wNormal.dot(CAM_DIR) >= 0 ? 1 : -1;
                    roll.ref.copy(wNormal);
                    roll.refCross.crossVectors(wArm, wNormal).normalize();
                  }
                  wNormal.multiplyScalar(roll.sign);
                  // Re-orthogonalise so the basis stays exactly orthonormal
                  // after the sign flip and after any landmark noise.
                  wAcross.crossVectors(wNormal, wArm);
                  if (wAcross.lengthSq() > 1e-8) {
                    wAcross.normalize();
                    wNormal.crossVectors(wArm, wAcross).normalize();
                    pose.dir.copy(wArm);
                    pose.normal.copy(wNormal);
                    pose.metric3d = true;
                    roll.deg =
                      (Math.atan2(wNormal.dot(roll.refCross), wNormal.dot(roll.ref)) * 180) / Math.PI;
                  }
                }
              }
            }
            pose.axis.set(pose.x, -pose.y, -0.5);
            pose.far = vZ.z < 0;
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
        // The material the buyer picked, and nothing after it. This used to be
        // followed by a pass that nulled every texture and repainted each part
        // from a guess based on its name, which made this renderer disagree with
        // the 3D viewer and the native AR view about what the product looks
        // like. Three renderers, one material path.
        //
        // The name-based guess was also unsalvageable rather than merely
        // imprecise. It looked for names like "band", "dial" and "crown" to
        // decide which colour went where, and the models here are exported with
        // obfuscated names: in pulse-smartwatch.glb not one node, mesh or
        // material name out of 33 materials matches any of those patterns. So
        // every part fell through to the same fallback, the whole watch came out
        // one flat colour, and the eight textured materials lost their maps.
        //
        // If a look over a camera feed ever needs adjusting, change it in
        // lib/modelMaterials.ts so all three renderers change together.
        applyProductMaterials(fresh, materials, material, modelMaterials);
        const box = new THREE.Box3().setFromObject(fresh);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.maxDim = Math.max(size.x, size.y, size.z) || 1;
        fresh.position.set(-center.x, -center.y, -center.z);
        fresh.quaternion.identity();
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
            wristNormal.lerp(pose.normal, 0.45).normalize();

            if (pose.metric3d) {
              // The wrist frame, and nothing else. This maps the canonical frame
              // (+X up the forearm, +Y around the wrist, +Z out of the back of the
              // hand) onto the camera, and says nothing whatsoever about the
              // model. The palm normal is the direction the back of the hand
              // faces, so the watch rolls with the wrist and shows its back once
              // the hand turns over.
              //
              // Right handed by construction: the third column has to satisfy
              // x cross y = z, so the middle column is the palm normal crossed
              // with the arm rather than the other way round, which would give
              // determinant -1, a mirror, and make the derived quaternion drift.
              faceDir.copy(wristNormal);
              // Re-orthogonalise so the dial stays square to the forearm.
              faceDir.addScaledVector(armDir, -faceDir.dot(armDir));
              if (faceDir.lengthSq() < 1e-8) {
                faceDir.copy(CAM_DIR);
              }
              faceDir.normalize();
              across.crossVectors(faceDir, armDir);
              if (across.lengthSq() < 1e-8) {
                across.set(-armDir.y, armDir.x, 0);
              }
              across.normalize();
              poseBasis.makeBasis(armDir, across, faceDir);
            } else {
              // No metric hand this frame, so hold the back of the wrist to the
              // lens rather than guessing a twist out of the 2D landmarks. Keeps
              // the watch usable if a build of the tracker omits the
              // reconstruction. Same frame, a flat normal.
              faceDir.copy(CAM_DIR).addScaledVector(armDir, -CAM_DIR.dot(armDir));
              if (faceDir.lengthSq() < 1e-8) {
                faceDir.copy(wristNormal);
              }
              faceDir.normalize();
              across.crossVectors(faceDir, armDir);
              if (across.lengthSq() < 1e-8) {
                across.set(-armDir.y, armDir.x, 0);
              }
              across.normalize();
              poseBasis.makeBasis(armDir, across, faceDir);
            }
            // Wrist frame first, then the seller's alignment inside it. That order
            // is the whole point: the alignment is expressed in the canonical
            // frame, so the frame is applied outside it and the model's own axes
            // never enter the calculation.
            watchQuat.setFromRotationMatrix(poseBasis).multiply(alignRef.current.quat);
            watchGroup.quaternion.slerp(watchQuat, 0.35);

            // The seller's offset, in wrist widths, so one alignment fits any hand.
            // Rotated by the final orientation, because "just off the skin" is a
            // statement about the watch, not about the world.
            watchGroup.position
              .copy(anchor)
              .addScaledVector(alignRef.current.offset.clone().applyQuaternion(watchQuat), pose.wristPx);

            const pxPerModelWidth = ((WATCH_WIDTH_FACTOR * pose.wristPx) / model.maxDim) * alignRef.current.scale;
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