/**
 * Hand-written WebGL2 renderer for NxN cubes. Rounded plastic cubies, inset
 * rounded stickers, two-light Blinn-Phong shading. Renders on demand.
 */
import { axisRotation, fromMat3, ident, invert, lookAt, mul, perspective, translation, transformPoint, type M4 } from './mat';
import type { CubeModel } from './model';
import type { Move } from '../cube/alg';

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uEye;
uniform vec3 uKey;
uniform vec3 uFill;
uniform float uSpec;
uniform float uShine;
uniform float uAmbient;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vWorld);
  float d = max(dot(n, uKey), 0.0) * 0.5 + max(dot(n, uFill), 0.0) * 0.2 + max(n.y, 0.0) * 0.06;
  vec3 h = normalize(uKey + v);
  float s = pow(max(dot(n, h), 0.0), uShine) * uSpec;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.06;
  vec3 c = uColor * (uAmbient + d) + vec3(s + rim);
  // soft shoulder so white stickers keep some shading instead of clipping
  c = c / (1.0 + max(c - 0.85, 0.0) * 1.6);
  outColor = vec4(c, 1.0);
}`;

interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
}

function roundedBox(radius: number, seg: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const inner = 0.5 - radius;
  for (let f = 0; f < 6; f++) {
    const axis = f >> 1;
    const sign = f & 1 ? -1 : 1;
    const ua = (axis + 1) % 3;
    const va = (axis + 2) % 3;
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      for (let j = 0; j <= seg; j++) {
        const p = [0, 0, 0];
        p[axis] = 0.5 * sign;
        p[ua] = -0.5 + i / seg;
        p[va] = -0.5 + j / seg;
        const c = p.map((x) => Math.max(-inner, Math.min(inner, x)));
        const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        const n = d.map((x) => x / l);
        pos.push(c[0] + n[0] * radius, c[1] + n[1] * radius, c[2] + n[2] * radius);
        nor.push(n[0], n[1], n[2]);
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j;
        const b = a + seg + 1;
        if (sign > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  return { pos, nor, idx };
}

function roundedRect(size: number, radius: number, seg: number) {
  const pos: number[] = [0, 0, 0];
  const nor: number[] = [0, 0, 1];
  const idx: number[] = [];
  const h = size / 2 - radius;
  const corners: [number, number, number][] = [
    [h, h, 0], [-h, h, Math.PI / 2], [-h, -h, Math.PI], [h, -h, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      pos.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 0);
      nor.push(0, 0, 1);
    }
  }
  const ring = (pos.length / 3) - 1;
  for (let i = 1; i <= ring; i++) idx.push(0, i, i === ring ? 1 : i + 1);
  return { pos, nor, idx };
}

/** Rotation taking +z to a face normal. */
function faceFrame(n: [number, number, number]): M4 {
  if (n[2] === 1) return ident();
  if (n[2] === -1) return axisRotation(1, Math.PI);
  if (n[0] === 1) return axisRotation(1, Math.PI / 2);
  if (n[0] === -1) return axisRotation(1, -Math.PI / 2);
  if (n[1] === 1) return axisRotation(0, -Math.PI / 2);
  return axisRotation(0, Math.PI / 2);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export interface Anim {
  move: Move;
  angle: number; // right-handed radians about +axis
}

export interface View {
  yaw: number;
  pitch: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private body: Mesh;
  private plate: Mesh;
  private proj: M4 = ident();
  private view: M4 = ident();
  private eye = [0, 0, 10];
  width = 1;
  height = 1;
  dark = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.prog = this.program(VS, FS);
    for (const name of ['uProj', 'uView', 'uModel', 'uColor', 'uEye', 'uKey', 'uFill', 'uSpec', 'uShine', 'uAmbient']) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    const box = roundedBox(0.11, 7);
    this.body = this.mesh(box.pos, box.nor, box.idx);
    const rect = roundedRect(1, 0.14, 6);
    this.plate = this.mesh(rect.pos, rect.nor, rect.idx);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private mesh(pos: number[], nor: number[], idx: number[]): Mesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = cssW;
    this.height = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  private camera(n: number, v: View) {
    const dist = n * 3.35 + 2.2;
    const cp = Math.cos(v.pitch);
    this.eye = [dist * cp * Math.sin(v.yaw), dist * Math.sin(v.pitch), dist * cp * Math.cos(v.yaw)];
    this.view = lookAt(this.eye, [0, -0.04 * n, 0], [0, 1, 0]);
    // Portrait screens: keep the horizontal field at least 30°, so the cube fits the width
    // instead of overflowing it (picking uses this same matrix, so drags stay accurate).
    const fov = (30 * Math.PI) / 180;
    const aspect = this.width / this.height;
    const fovY = aspect >= 1 ? fov : 2 * Math.atan(Math.tan(fov / 2) / aspect);
    this.proj = perspective(fovY, aspect, 0.1, 200);
  }

  draw(model: CubeModel, anim: Anim | null, v: View, colors: [number, number, number][], stickerless: boolean) {
    const gl = this.gl;
    const n = model.n;
    this.camera(n, v);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.u.uView, false, this.view);
    gl.uniform3fv(this.u.uEye, this.eye);
    // lights follow the camera so the visible faces are always lit nicely
    const inv = invert(this.view)!;
    const toWorld = (d: number[]) => {
      const x = inv[0] * d[0] + inv[4] * d[1] + inv[8] * d[2];
      const y = inv[1] * d[0] + inv[5] * d[1] + inv[9] * d[2];
      const z = inv[2] * d[0] + inv[6] * d[1] + inv[10] * d[2];
      const l = Math.hypot(x, y, z);
      return [x / l, y / l, z / l];
    };
    gl.uniform3fv(this.u.uKey, toWorld([-0.32, 0.55, 0.77]));
    gl.uniform3fv(this.u.uFill, toWorld([0.75, 0.05, 0.66]));

    const animRot = anim ? axisRotation(anim.move.axis, anim.angle) : null;
    const gap = stickerless ? 0.995 : 0.975;
    const plastic: [number, number, number] = this.dark ? [0.07, 0.07, 0.075] : [0.085, 0.085, 0.09];
    const scale = new Float32Array(16);
    scale[0] = scale[5] = scale[10] = gap;
    scale[15] = 1;

    for (const c of model.cubies) {
      let m = mul(translation(c.pos[0] / 2, c.pos[1] / 2, c.pos[2] / 2), fromMat3(c.rot));
      if (animRot && model.inMove(c, anim!.move)) m = mul(animRot, m);
      // body
      gl.uniformMatrix4fv(this.u.uModel, false, mul(m, scale));
      if (stickerless) {
        gl.uniform3fv(this.u.uColor, [0.05, 0.05, 0.05]);
      } else {
        gl.uniform3fv(this.u.uColor, plastic);
      }
      gl.uniform1f(this.u.uSpec, 0.35);
      gl.uniform1f(this.u.uShine, 60);
      gl.uniform1f(this.u.uAmbient, 0.55);
      gl.bindVertexArray(this.body.vao);
      gl.drawElements(gl.TRIANGLES, this.body.count, gl.UNSIGNED_SHORT, 0);
      // stickers
      gl.bindVertexArray(this.plate.vao);
      gl.uniform1f(this.u.uSpec, stickerless ? 0.18 : 0.12);
      gl.uniform1f(this.u.uShine, 90);
      gl.uniform1f(this.u.uAmbient, 0.5);
      for (const s of c.stickers) {
        const sz = stickerless ? 0.965 : 0.86;
        const plate = mul(faceFrame(s.n), mul(translation(0, 0, (gap / 2) + 0.0025), scaleXY(sz)));
        gl.uniformMatrix4fv(this.u.uModel, false, mul(m, plate));
        gl.uniform3fv(this.u.uColor, colors[s.face]);
        gl.drawElements(gl.TRIANGLES, this.plate.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  /** Ray-cast against the (resting) cube: hit point and face axis/sign. */
  pick(n: number, x: number, y: number): { p: number[]; axis: number; sign: number } | null {
    const vp = mul(this.proj, this.view);
    const inv = invert(vp);
    if (!inv) return null;
    const ndcX = (x / this.width) * 2 - 1;
    const ndcY = 1 - (y / this.height) * 2;
    const a = transformPoint(inv, [ndcX, ndcY, -1]);
    const b = transformPoint(inv, [ndcX, ndcY, 1]);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const h = n / 2;
    let tmin = -Infinity;
    let tmax = Infinity;
    let axis = -1;
    let sign = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (a[i] < -h || a[i] > h) return null;
        continue;
      }
      let t1 = (-h - a[i]) / d[i];
      let t2 = (h - a[i]) / d[i];
      let s1 = -1;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        s1 = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = i;
        sign = s1;
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (axis < 0 || tmin < 0) return null;
    return { p: [a[0] + d[0] * tmin, a[1] + d[1] * tmin, a[2] + d[2] * tmin], axis, sign };
  }

  /** World point → CSS pixels. */
  project(p: number[]): [number, number] {
    const q = transformPoint(mul(this.proj, this.view), p);
    return [((q[0] + 1) / 2) * this.width, ((1 - q[1]) / 2) * this.height];
  }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function scaleXY(s: number): M4 {
  const m = ident();
  m[0] = s;
  m[5] = s;
  return m;
}
