import { generateShape, mulberry32, type Masks, type Shape, type ShapeName } from './shapes';

export interface Layout {
    /** Desplazamiento en fracción del ancho/alto de la ventana. */
    x: number;
    y: number;
    scale: number;
    alpha: number;
}

const VS = `
attribute vec2 aPos;
attribute float aSize;
attribute float aAlpha;
attribute float aTint;
uniform vec2 uRes;
uniform float uDpr;
varying float vAlpha;
varying float vTint;
void main() {
    vec2 clip = (aPos / uRes) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = aSize * uDpr;
    vAlpha = aAlpha;
    vTint = aTint;
}`;

const FS = `
precision mediump float;
varying float vAlpha;
varying float vTint;
uniform vec3 uColA;
uniform vec3 uColB;
void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = 1.0 - smoothstep(0.0, 0.5, d);
    a = a * (0.35 + 0.65 * a) + step(d, 0.12) * 0.35;
    vec3 col = mix(uColA, uColB, vTint);
    gl_FragColor = vec4(col * a * vAlpha, a * vAlpha);
}`;

const STRIDE = 5;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class ParticleField {
    private gl: WebGLRenderingContext;
    private buffer: WebGLBuffer;
    private uRes: WebGLUniformLocation;
    private uDpr: WebGLUniformLocation;
    private data: Float32Array;

    private n: number;
    private stars: number;
    private cur: Float32Array;
    private from: Float32Array;
    private to: Float32Array;
    private noise: Float32Array;
    private delay: Float32Array;
    private phase: Float32Array;
    private size: Float32Array;
    private tint: Float32Array;
    private bright: Float32Array;
    private off: Float32Array;
    private star: Float32Array;

    private shapes = new Map<ShapeName, Shape>();
    private shapeName: ShapeName | null = null;
    private spin = true;
    private spinSpeed = 0.16;
    private tilt = 0.4;
    private tiltCur = 0.4;
    private morph = 1;
    private morphDur = 1.8;
    private burst = 0.55;

    private layout: Layout = { x: 0, y: 0, scale: 1, alpha: 1 };
    private target: Layout = { x: 0, y: 0, scale: 1, alpha: 1 };
    private rotY = 0;
    private time = 0;

    private w = 1;
    private h = 1;
    private dpr = 1;
    private mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, nx: 0, ny: 0, snx: 0, sny: 0 };
    private scroll = 0;
    private velocity = 0;
    /** Atenuación global (loader). */
    fade = 1;

    constructor(private canvas: HTMLCanvasElement, private masks: Masks, count: number) {
        const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
        if (!gl) throw new Error('WebGL no disponible');
        this.gl = gl;

        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        gl.useProgram(prog);

        this.n = count;
        this.stars = Math.round(count * 0.14);
        const total = this.n + this.stars;
        this.data = new Float32Array(total * STRIDE);
        this.buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

        const attr = (name: string, size: number, offset: number) => {
            const loc = gl.getAttribLocation(prog, name);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
        };
        attr('aPos', 2, 0);
        attr('aSize', 1, 2);
        attr('aAlpha', 1, 3);
        attr('aTint', 1, 4);

        this.uRes = gl.getUniformLocation(prog, 'uRes')!;
        this.uDpr = gl.getUniformLocation(prog, 'uDpr')!;
        gl.uniform3f(gl.getUniformLocation(prog, 'uColA'), 0.95, 0.97, 1.0);
        gl.uniform3f(gl.getUniformLocation(prog, 'uColB'), 0.42, 0.7, 1.0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.clearColor(0, 0, 0, 0);

        const r = mulberry32(42);
        const N = this.n;
        this.cur = new Float32Array(N * 3);
        this.from = new Float32Array(N * 3);
        this.to = new Float32Array(N * 3);
        this.noise = new Float32Array(N * 3);
        this.delay = new Float32Array(N);
        this.phase = new Float32Array(N);
        this.size = new Float32Array(N);
        this.tint = new Float32Array(N);
        this.bright = new Float32Array(N);
        this.off = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
            // Arranque disperso: las partículas convergen desde el espacio profundo.
            const a = r() * Math.PI * 2;
            const z = r() * 2 - 1;
            const d = 2.5 + r() * 3;
            const s = Math.sqrt(1 - z * z);
            this.cur[i * 3] = Math.cos(a) * s * d;
            this.cur[i * 3 + 1] = Math.sin(a) * s * d;
            this.cur[i * 3 + 2] = z * d - 2;
            const na = r() * Math.PI * 2;
            const nz = r() * 2 - 1;
            const ns = Math.sqrt(1 - nz * nz);
            const amp = 0.3 + r() * 0.9;
            this.noise[i * 3] = Math.cos(na) * ns * amp;
            this.noise[i * 3 + 1] = Math.sin(na) * ns * amp;
            this.noise[i * 3 + 2] = nz * amp;
            this.delay[i] = r();
            this.phase[i] = r() * Math.PI * 2;
            this.size[i] = 2.7 + Math.pow(r(), 2.2) * 4.4;
            this.tint[i] = r() < 0.18 ? 0.85 + r() * 0.15 : r() * 0.35;
            this.bright[i] = 0.62 + r() * 0.5;
        }
        this.to.set(this.cur);
        this.from.set(this.cur);

        this.star = new Float32Array(this.stars * 5);
        for (let i = 0; i < this.stars; i++) {
            const depth = 0.15 + Math.pow(r(), 2) * 0.85;
            this.star[i * 5] = r();
            this.star[i * 5 + 1] = r();
            this.star[i * 5 + 2] = depth;
            this.star[i * 5 + 3] = r() * Math.PI * 2;
            this.star[i * 5 + 4] = 0.4 + r() * 2;
        }
    }

    private getShape(name: ShapeName) {
        let s = this.shapes.get(name);
        if (!s) {
            s = generateShape(name, this.n, this.masks);
            this.shapes.set(name, s);
        }
        return s;
    }

    setShape(name: ShapeName, layout: Partial<Layout> = {}, duration = 1.8) {
        Object.assign(this.target, { x: 0, y: 0, scale: 1, alpha: 1 }, layout);
        if (name === this.shapeName) return;
        const shape = this.getShape(name);
        this.shapeName = name;
        this.from.set(this.cur);
        this.to.set(shape.pts);
        this.spin = shape.spin;
        this.spinSpeed = shape.spinSpeed ?? 0.16;
        this.tilt = shape.tilt;
        this.morph = 0;
        this.morphDur = duration;
    }

    setPointer(x: number, y: number) {
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.nx = (x / this.w) * 2 - 1;
        this.mouse.ny = (y / this.h) * 2 - 1;
    }

    clearPointer() {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
        this.mouse.nx = 0;
        this.mouse.ny = 0;
    }

    setScroll(y: number, velocity: number) {
        this.scroll = y;
        this.velocity = velocity;
    }

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.canvas.width = Math.round(this.w * this.dpr);
        this.canvas.height = Math.round(this.h * this.dpr);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.uniform2f(this.uRes, this.w, this.h);
        this.gl.uniform1f(this.uDpr, this.dpr);
    }

    render(dtSec: number) {
        const dt = Math.min(dtSec, 0.05);
        this.time += dt;
        const t = this.time;
        const { w, h, mouse } = this;
        const mobile = w < 900;

        // Suavizado de layout, rotación y puntero.
        const k = 1 - Math.exp(-dt * 2.6);
        const tl = this.target;
        const L = this.layout;
        // En móvil la forma se corre a la derecha y arriba (o abajo en el footer) para no tapar los textos.
        const mx = mobile ? (Math.abs(tl.x) > 0.02 ? 0.32 : 0.26) : tl.x;
        const my = mobile ? (tl.y > 0.12 ? 0.26 : -0.26) : tl.y;
        const ms = tl.scale * (mobile ? 0.48 : 1);
        const ma = tl.alpha * (mobile ? 0.55 : 1);
        L.x += (mx - L.x) * k;
        L.y += (my - L.y) * k;
        L.scale += (ms - L.scale) * k;
        L.alpha += (ma - L.alpha) * k;
        this.tiltCur += (this.tilt - this.tiltCur) * k;
        const km = 1 - Math.exp(-dt * 6);
        mouse.sx = mouse.x < -999 ? mouse.x : mouse.sx < -999 ? mouse.x : mouse.sx + (mouse.x - mouse.sx) * km;
        mouse.sy = mouse.y < -999 ? mouse.y : mouse.sy < -999 ? mouse.y : mouse.sy + (mouse.y - mouse.sy) * km;
        mouse.snx += (mouse.nx - mouse.snx) * km * 0.5;
        mouse.sny += (mouse.ny - mouse.sny) * km * 0.5;

        if (this.spin) this.rotY += dt * this.spinSpeed;
        else {
            const base = Math.round(this.rotY / (Math.PI * 2)) * Math.PI * 2;
            this.rotY += (base + Math.sin(t * 0.5) * 0.52 - this.rotY) * k;
        }
        const ry = this.rotY + mouse.snx * 0.45;
        const rx = this.tiltCur + mouse.sny * 0.22;
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cx = Math.cos(rx), sx = Math.sin(rx);

        this.morph = Math.min(1, this.morph + dt / this.morphDur);
        const m = this.morph;
        const vel = Math.max(-60, Math.min(60, this.velocity));
        const turbulence = this.burst + Math.min(Math.abs(vel) * 0.012, 0.35);

        const S = Math.min(w, h) * 0.36 * L.scale;
        const ox = w / 2 + L.x * w;
        const oy = h / 2 + L.y * h;
        const D = 4;
        const R = 120;
        const R2 = R * R;
        const data = this.data;
        const N = this.n;
        const { cur, from, to, noise, delay, phase, size, tint, bright, off } = this;
        const alphaBase = L.alpha * this.fade;

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            let x: number, y: number, z: number;
            if (m < 1) {
                const e = easeInOut(Math.min(1, Math.max(0, (m - delay[i] * 0.35) / 0.65)));
                const b = Math.sin(Math.PI * e) * turbulence;
                x = from[i3] + (to[i3] - from[i3]) * e + noise[i3] * b;
                y = from[i3 + 1] + (to[i3 + 1] - from[i3 + 1]) * e + noise[i3 + 1] * b;
                z = from[i3 + 2] + (to[i3 + 2] - from[i3 + 2]) * e + noise[i3 + 2] * b;
                cur[i3] = x;
                cur[i3 + 1] = y;
                cur[i3 + 2] = z;
            } else {
                x = to[i3];
                y = to[i3 + 1];
                z = to[i3 + 2];
                cur[i3] = x;
                cur[i3 + 1] = y;
                cur[i3 + 2] = z;
            }
            const ph = phase[i];
            x += Math.sin(t * 0.7 + ph) * 0.008;
            y += Math.cos(t * 0.6 + ph * 1.3) * 0.008 + vel * 0.0006 * noise[i3 + 1];
            z += Math.sin(t * 0.5 + ph * 0.7) * 0.008;

            const x1 = x * cy + z * sy;
            const z1 = -x * sy + z * cy;
            const y1 = y * cx - z1 * sx;
            const z2 = y * sx + z1 * cx;

            const p = D / (D - z2);
            let px = ox + x1 * p * S;
            let py = oy - y1 * p * S;

            // Repulsión del cursor con resorte: se disuelve al pasar y se reconstruye al salir.
            const o4 = i * 4;
            const dx = px - mouse.sx;
            const dy = py - mouse.sy;
            const d2 = dx * dx + dy * dy;
            let glow = 0;
            if (d2 < R2) {
                const d = Math.sqrt(d2) || 1;
                const f = 1 - d / R;
                glow = f;
                off[o4 + 2] += (dx / d) * f * f * 3.2;
                off[o4 + 3] += (dy / d) * f * f * 3.2;
            }
            off[o4 + 2] += -off[o4] * 0.05;
            off[o4 + 3] += -off[o4 + 1] * 0.05;
            off[o4 + 2] *= 0.87;
            off[o4 + 3] *= 0.87;
            off[o4] += off[o4 + 2];
            off[o4 + 1] += off[o4 + 3];
            px += off[o4];
            py += off[o4 + 1];

            const depth = Math.min(1.25, Math.max(0.3, (p - 0.6) * 2.1));
            const j = i * STRIDE;
            data[j] = px;
            data[j + 1] = py;
            data[j + 2] = size[i] * (0.55 + p * 0.45) * (0.85 + L.scale * 0.15);
            data[j + 3] = Math.min(1.4, bright[i] * depth + glow * 0.9) * alphaBase;
            data[j + 4] = Math.min(1, tint[i] + glow * 0.8);
        }

        // Polvo estelar con parallax por profundidad.
        const st = this.star;
        for (let i = 0; i < this.stars; i++) {
            const s5 = i * 5;
            const depth = st[s5 + 2];
            let yy = (st[s5 + 1] * h - this.scroll * depth * 0.12) % h;
            if (yy < 0) yy += h;
            const xx = st[s5] * w + mouse.snx * -12 * depth;
            const tw = 0.55 + 0.45 * Math.sin(t * st[s5 + 4] + st[s5 + 3]);
            const j = (N + i) * STRIDE;
            data[j] = xx;
            data[j + 1] = yy;
            data[j + 2] = 1.2 + depth * 2.6;
            data[j + 3] = (0.12 + depth * 0.5) * tw * Math.max(0.35, this.fade);
            data[j + 4] = depth > 0.8 ? 0.6 : 0.1;
        }

        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        gl.drawArrays(gl.POINTS, 0, N + this.stars);
    }

    destroy() {
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}
