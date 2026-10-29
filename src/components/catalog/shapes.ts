// Generadores de nubes de puntos 3D (coordenadas normalizadas, radio ~1).
export type ShapeName =
    | 'galaxy'
    | 'moon'
    | 'papers'
    | 'database'
    | 'bars'
    | 'brain'
    | 'mirror'
    | 'terrain'
    | 'globe'
    | 'shield'
    | 'layers'
    | 'text70'
    | 'atom'
    | 'spiral'
    | 'gears'
    | 'logo'
    | 'dna'
    | 'brand';

export interface Shape {
    pts: Float32Array;
    /** Gira continuamente; las formas planas solo oscilan para no verse de canto. */
    spin: boolean;
    tilt: number;
    spinSpeed?: number;
}

export interface Mask {
    /** Pares x,y normalizados a [-1, 1] sobre la dimensión mayor. */
    xy: Float32Array;
    w: Float32Array;
    count: number;
}

type Rng = () => number;

export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TAU = Math.PI * 2;

function gauss(r: Rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function unitVec(r: Rng): [number, number, number] {
    const z = r() * 2 - 1;
    const a = r() * TAU;
    const s = Math.sqrt(1 - z * z);
    return [Math.cos(a) * s, Math.sin(a) * s, z];
}

function rotate(x: number, y: number, z: number, ax: number, ay: number, az: number): [number, number, number] {
    let c = Math.cos(ax);
    let s = Math.sin(ax);
    [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(ay);
    s = Math.sin(ay);
    [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(az);
    s = Math.sin(az);
    [x, y] = [x * c - y * s, x * s + y * c];
    return [x, y, z];
}

/** Punto aleatorio sobre la superficie de una caja; con `edges` se ajusta a las aristas. */
function boxPoint(r: Rng, w: number, h: number, d: number, edges: boolean): [number, number, number] {
    const p = [(r() - 0.5) * w, (r() - 0.5) * h, (r() - 0.5) * d];
    const half = [w / 2, h / 2, d / 2];
    const axes = [0, 1, 2].sort(() => r() - 0.5);
    const snap = edges ? 2 : 1;
    for (let k = 0; k < snap; k++) {
        const a = axes[k];
        p[a] = r() < 0.5 ? -half[a] : half[a];
    }
    return [p[0], p[1], p[2]];
}

// ---------- Máscaras 2D (imágenes y texto) ----------

function maskFromCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): Mask {
    const data = ctx.getImageData(0, 0, w, h).data;
    const xy: number[] = [];
    const wt: number[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const a = data[(y * w + x) * 4 + 3];
            if (a > 24) {
                xy.push(x, y);
                wt.push(a / 255);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const half = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    const out = new Float32Array(xy.length);
    for (let i = 0; i < xy.length; i += 2) {
        out[i] = (xy[i] - cx) / half;
        out[i + 1] = -(xy[i + 1] - cy) / half;
    }
    return { xy: out, w: new Float32Array(wt), count: wt.length };
}

function makeCanvas(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c.getContext('2d', { willReadFrequently: true })!;
}

export async function maskFromImage(src: string, size = 360): Promise<Mask | null> {
    try {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        await img.decode();
        const ratio = img.naturalWidth / img.naturalHeight || 1;
        const w = ratio >= 1 ? size : Math.round(size * ratio);
        const h = ratio >= 1 ? Math.round(size / ratio) : size;
        const ctx = makeCanvas(w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const m = maskFromCanvas(ctx, w, h);
        return m.count ? m : null;
    } catch {
        return null;
    }
}

export async function maskFromText(text: string, font: string): Promise<Mask> {
    try {
        await document.fonts.load(font);
    } catch {
        /* se usa la fuente de respaldo */
    }
    const w = 1400;
    const h = 380;
    const ctx = makeCanvas(w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.fillText(text, w / 2, h / 2);
    return maskFromCanvas(ctx, w, h);
}

export function shieldMask(): Mask {
    const w = 300;
    const h = 340;
    const ctx = makeCanvas(w, h);
    const shield = new Path2D('M150 12 L272 58 C272 170 238 262 150 326 C62 262 28 170 28 58 Z');
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill(shield);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.stroke(shield);
    // Candado interior.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(150, 150, 34, Math.PI, 0);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.fillRect(104, 160, 92, 74);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(150, 150, 34, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(110, 162, 80, 66);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(150, 188, 9, 0, TAU);
    ctx.fill();
    ctx.fillRect(146, 190, 8, 22);
    return maskFromCanvas(ctx, w, h);
}

/** Muestreo ponderado por alfa con volumen en forma de lente. */
function fromMask(mask: Mask, n: number, r: Rng, scale: number, depth: number): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        let k = 0;
        for (let tries = 0; tries < 12; tries++) {
            k = (r() * mask.count) | 0;
            if (r() < mask.w[k]) break;
        }
        const x = (mask.xy[k * 2] + (r() - 0.5) * 0.012) * scale;
        const y = (mask.xy[k * 2 + 1] + (r() - 0.5) * 0.012) * scale;
        const lens = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (scale * scale * 1.3)));
        out[i * 3] = x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = (r() < 0.5 ? -1 : 1) * lens * depth * Math.pow(r(), 0.35);
    }
    return out;
}

// ---------- Formas procedurales ----------

type Gen = (n: number, r: Rng) => Float32Array;

function build(n: number, r: Rng, fn: (i: number, r: Rng) => [number, number, number]) {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const [x, y, z] = fn(i, r);
        out[i * 3] = x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = z;
    }
    return out;
}

const galaxy: Gen = (n, r) =>
    build(n, r, (i) => {
        const arm = i % 3;
        const d = Math.pow(r(), 0.7) * 1.7;
        const a = (arm * TAU) / 3 + d * 2.3 + gauss(r) * 0.28 / (d + 0.35);
        return [Math.cos(a) * d, gauss(r) * 0.07 * (1.8 - d), Math.sin(a) * d];
    });

const papers: Gen = (n, r) => {
    const sheets = Array.from({ length: 7 }, (_, k) => {
        const a = (k / 7) * TAU + r();
        return {
            c: [Math.cos(a) * (0.35 + r() * 0.5), (r() - 0.5) * 0.9, Math.sin(a) * (0.3 + r() * 0.4)],
            rot: [(r() - 0.5) * 1.1, (r() - 0.5) * 1.6, (r() - 0.5) * 0.8],
        };
    });
    return build(n, r, (i) => {
        const s = sheets[i % sheets.length];
        let u = r();
        let v = r();
        const mode = r();
        if (mode < 0.38) u = Math.round(u * 5) / 5;
        else if (mode < 0.8) v = Math.round(v * 12) / 12;
        const [x, y, z] = rotate((u - 0.5) * 0.62, (v - 0.5) * 0.84, 0, s.rot[0], s.rot[1], s.rot[2]);
        return [x + s.c[0], y + s.c[1], z + s.c[2]];
    });
};

const database: Gen = (n, r) =>
    build(n, r, (i) => {
        const level = i % 3;
        const cy = (level - 1) * 0.74;
        const a = r() * TAU;
        const R = 0.82;
        const m = r();
        if (m < 0.5) {
            const y = r() < 0.55 ? (Math.round(r() * 3) / 3 - 0.5) * 0.4 : (r() - 0.5) * 0.4;
            return [Math.cos(a) * R, cy + y, Math.sin(a) * R];
        }
        if (m < 0.82) return [Math.cos(a) * R, cy + (r() < 0.5 ? 0.2 : -0.2), Math.sin(a) * R];
        const d = Math.sqrt(r()) * R;
        return [Math.cos(a) * d, cy + 0.2, Math.sin(a) * d];
    });

const bars: Gen = (n, r) => {
    const cols = 6;
    const rows = 3;
    const heights = Array.from({ length: cols * rows }, (_, k) => {
        const c = k % cols;
        return 0.3 + c * 0.25 + r() * 0.15;
    });
    return build(n, r, () => {
        if (r() < 0.14) {
            const x = (r() - 0.5) * 2.1;
            const z = (r() - 0.5) * 1.1;
            return r() < 0.5 ? [Math.round(x * 5) / 5, -0.9, z] : [x, -0.9, Math.round(z * 5) / 5];
        }
        const k = (r() * cols * rows) | 0;
        const c = k % cols;
        const row = (k / cols) | 0;
        const h = heights[k];
        const [x, y, z] = boxPoint(r, 0.2, h, 0.2, r() < 0.55);
        return [(c - (cols - 1) / 2) * 0.32 + x, -0.9 + h / 2 + y, (row - 1) * 0.32 + z];
    });
};

const brain: Gen = (n, r) =>
    build(n, r, () => {
        if (r() < 0.08) {
            const [ux, uy, uz] = unitVec(r);
            const d = Math.pow(r(), 0.7) * 0.7;
            return [ux * d * 0.9, uy * d * 0.7, uz * d * 1.1];
        }
        const [ux, uy, uz] = unitVec(r);
        // Pliegues (circunvoluciones) marcados sobre dos hemisferios separados.
        const fold =
            1 +
            0.11 * Math.sin(11 * ux + 6 * uy) * Math.cos(9 * uz + 4 * uy) +
            0.06 * Math.sin(19 * uy + 2) * Math.sin(15 * uz);
        let x = ux * fold * 0.78;
        let y = uy * fold * 0.78;
        const z = uz * fold * 1.12;
        x += Math.sign(x) * 0.1;
        if (y < -0.25) y = -0.25 + (y + 0.25) * 0.55;
        return [x, y + 0.08, z];
    });

const mirror: Gen = (n, r) =>
    build(n, r, () => {
        const m = r();
        if (m < 0.22) {
            const t = r();
            const strand = (r() * 5) | 0;
            const ph = strand * 1.25;
            return [
                -0.42 + t * 0.84,
                Math.sin(t * Math.PI * 2 + ph) * 0.12 + (strand - 2) * 0.16,
                Math.cos(t * Math.PI * 2 + ph) * 0.12,
            ];
        }
        const side = r() < 0.5 ? -1 : 1;
        let [x, y, z] = boxPoint(r, 0.62, 1.55, 0.62, r() < 0.45);
        if (r() < 0.35) {
            z = 0.31;
            y = (Math.round((y / 1.55 + 0.5) * 9) / 9 - 0.5) * 1.55;
            x *= 0.85;
        }
        return [side * 0.82 + x * side, y, z];
    });

const terrain: Gen = (n, r) =>
    build(n, r, () => {
        let x = (r() - 0.5) * 2.6;
        let z = (r() - 0.5) * 2;
        if (r() < 0.5) x = Math.round(x * 9) / 9;
        else z = Math.round(z * 7) / 7;
        const y =
            0.55 * Math.exp(-((x - 0.55) ** 2 + (z + 0.15) ** 2) * 2.4) +
            0.14 * Math.sin(x * 3.1) * Math.cos(z * 2.6) +
            0.18 * x -
            0.25;
        return [x, y, z];
    });

const globe: Gen = (n, r) => {
    const arcs = Array.from({ length: 9 }, () => [unitVec(r), unitVec(r)] as const);
    return build(n, r, () => {
        const m = r();
        if (m < 0.45) {
            const lat = (Math.round(r() * 10) / 10 - 0.5) * Math.PI * 0.92;
            const a = r() * TAU;
            return [Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)];
        }
        if (m < 0.72) {
            const lon = (Math.round(r() * 14) / 14) * TAU;
            const lat = (r() - 0.5) * Math.PI;
            return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        }
        if (m < 0.8) return unitVec(r);
        const [a, b] = arcs[(r() * arcs.length) | 0];
        const t = r();
        const x = a[0] * (1 - t) + b[0] * t;
        const y = a[1] * (1 - t) + b[1] * t;
        const z = a[2] * (1 - t) + b[2] * t;
        const len = Math.hypot(x, y, z) || 1;
        const h = 1 + 0.32 * Math.sin(Math.PI * t);
        return [(x / len) * h, (y / len) * h, (z / len) * h];
    });
};

/** Esfera holográfica: meridians, paralelos, núcleo y anillo HUD. */
const layers: Gen = (n, r) => {
    const R = 0.98;
    return build(n, r, () => {
        const m = r();
        if (m < 0.16) {
            const [x, y, z] = unitVec(r);
            const d = Math.pow(r(), 0.4) * 0.2;
            return [x * d, y * d, z * d];
        }
        if (m < 0.48) {
            const lat = ((Math.round(r() * 9) - 4) / 4) * 0.92;
            const a = r() * TAU;
            const rad = Math.cos(lat) * R;
            return [Math.cos(a) * rad, Math.sin(lat) * R, Math.sin(a) * rad];
        }
        if (m < 0.78) {
            const mer = (Math.round(r() * 12) / 12) * TAU;
            const t = (r() - 0.5) * Math.PI;
            const c = Math.cos(t);
            return [Math.cos(mer) * c * R, Math.sin(t) * R, Math.sin(mer) * c * R];
        }
        const a = r() * TAU;
        const rad = 1.18 + gauss(r) * 0.012;
        return [Math.cos(a) * rad, gauss(r) * 0.018, Math.sin(a) * rad];
    });
};

const atom: Gen = (n, r) => {
    const orbits = Array.from({ length: 6 }, (_, k) => ({
        R: 0.95 + (k % 3) * 0.14,
        rot: [(k / 6) * Math.PI + 0.3, (k * 1.1) % Math.PI, 0.2 * k],
    }));
    return build(n, r, (i) => {
        if (r() < 0.24) {
            const [x, y, z] = unitVec(r);
            const d = 0.32 * Math.pow(r(), 0.3);
            return [x * d, y * d, z * d];
        }
        const o = orbits[i % orbits.length];
        const a = r() * TAU;
        const th = gauss(r) * 0.012;
        return rotate(Math.cos(a) * (o.R + th), gauss(r) * 0.012, Math.sin(a) * (o.R + th), o.rot[0], o.rot[1], o.rot[2]);
    });
};

const spiral: Gen = (n, r) =>
    build(n, r, (i) => {
        const strand = i % 5;
        const t = r();
        const a = t * TAU * 1.6 + (strand * TAU) / 5;
        const rad = 0.25 + t * 0.75;
        return [Math.cos(a) * rad + gauss(r) * 0.025, -1.15 + t * 2.3 + gauss(r) * 0.02, Math.sin(a) * rad + gauss(r) * 0.025];
    });

/** Doble hélice: dos hebras, puentes y polvo — el equivalente de la luna, en ADN. */
const dna: Gen = (n, r) => {
    const pairs = 24;
    const twist = 0.52;
    const rad = 0.58;
    const height = 2.35;
    return build(n, r, () => {
        const m = r();
        if (m < 0.58) {
            const t = r() * (pairs - 1);
            const strand = r() < 0.5 ? 0 : 1;
            const ang = t * twist + strand * Math.PI;
            const jr = gauss(r) * 0.04;
            return [
                Math.cos(ang) * (rad + jr),
                (t / (pairs - 1) - 0.5) * height + gauss(r) * 0.025,
                Math.sin(ang) * (rad + jr),
            ];
        }
        if (m < 0.86) {
            const i = (r() * pairs) | 0;
            const ang = i * twist;
            const u = r();
            const ax = Math.cos(ang) * rad;
            const az = Math.sin(ang) * rad;
            return [
                ax * (1 - 2 * u) + gauss(r) * 0.018,
                (i / (pairs - 1) - 0.5) * height + gauss(r) * 0.012,
                az * (1 - 2 * u) + gauss(r) * 0.018,
            ];
        }
        const t = r() * (pairs - 1);
        const ang = t * twist + r() * TAU;
        const d = rad * (1.2 + r() * 0.55);
        return [
            Math.cos(ang) * d,
            (t / (pairs - 1) - 0.5) * height * (0.65 + r() * 0.35),
            Math.sin(ang) * d,
        ];
    });
};

/** Dos engranajes engranados (Industria 4.0): perfil dentado extruido, caras, cubo y rayos. */
const gears: Gen = (n, r) => {
    const G = [
        { cx: -0.36, cy: 0.12, R: 0.72, teeth: 14, phase: 0 },
        { cx: 0.7, cy: -0.43, R: 0.38, teeth: 8, phase: 0.5 },
    ];
    const toothH = 0.12;
    const th = 0.12;
    const profile = (a: number, g: (typeof G)[number]) => {
        const s = (((a / TAU) * g.teeth + g.phase) % 1 + 1) % 1;
        const t = s < 0.35 ? 1 : s < 0.5 ? (0.5 - s) / 0.15 : s < 0.85 ? 0 : (s - 0.85) / 0.15;
        return g.R + toothH * t;
    };
    return build(n, r, () => {
        const g = r() < 0.68 ? G[0] : G[1];
        const rin = g.R * 0.62;
        const hub = g.R * 0.2;
        const a = r() * TAU;
        const m = r();
        let rad: number;
        let z: number;
        if (m < 0.42) {
            rad = profile(a, g);
            z = (r() - 0.5) * 2 * th;
        } else if (m < 0.72) {
            rad = rin + (profile(a, g) - rin) * r();
            z = r() < 0.5 ? -th : th;
        } else if (m < 0.82) {
            rad = r() < 0.5 ? rin : hub;
            z = (r() - 0.5) * 2 * th;
        } else {
            const spoke = Math.round((a / TAU) * 5) / 5;
            const sa = spoke * TAU + gauss(r) * 0.035;
            rad = hub + (rin - hub) * r();
            return [g.cx + Math.cos(sa) * rad, g.cy + Math.sin(sa) * rad, (r() - 0.5) * th];
        }
        return [g.cx + Math.cos(a) * rad, g.cy + Math.sin(a) * rad, z];
    });
};

const GENERATORS: Partial<Record<ShapeName, Gen>> = { galaxy, papers, database, bars, brain, mirror, terrain, globe, layers, atom, spiral, gears, dna };

const META: Record<ShapeName, { spin: boolean; tilt: number }> = {
    galaxy: { spin: true, tilt: 0.55 },
    moon: { spin: false, tilt: 0.36, spinSpeed: 0.09 },
    papers: { spin: true, tilt: 0.15 },
    database: { spin: true, tilt: 0.38 },
    bars: { spin: true, tilt: 0.32 },
    brain: { spin: true, tilt: 0.12 },
    mirror: { spin: true, tilt: 0.22 },
    terrain: { spin: true, tilt: 0.42 },
    globe: { spin: true, tilt: 0.3 },
    shield: { spin: false, tilt: 0 },
    layers: { spin: true, tilt: 0.38, spinSpeed: 0.11 },
    text70: { spin: false, tilt: 0 },
    atom: { spin: true, tilt: 0.42, spinSpeed: 0.14 },
    spiral: { spin: true, tilt: 0.12 },
    gears: { spin: false, tilt: 0.25 },
    logo: { spin: false, tilt: 0 },
    dna: { spin: true, tilt: 0.2 },
    brand: { spin: false, tilt: 0.14 },
};

export interface Masks {
    moon: Mask | null;
    logo: Mask | null;
    text70: Mask;
    shield: Mask;
}

/** Creciente de la máscara, con un relleno extra en el interior del cuerpo. */
function moonFilled(mask: Mask, n: number, r: Rng): Float32Array {
    const pts = fromMask(mask, n, r, 1.12, 0.52);
    for (let i = 0; i < n; i++) {
        if (r() > 0.26) continue;
        let k = 0;
        for (let t = 0; t < 16; t++) {
            k = (r() * mask.count) | 0;
            if (mask.w[k] > 0.65) break;
        }
        const i3 = i * 3;
        const s = 0.88 + r() * 0.1;
        pts[i3] = mask.xy[k * 2] * 1.12 * s;
        pts[i3 + 1] = mask.xy[k * 2 + 1] * 1.12 * s;
        pts[i3 + 2] *= 0.75;
    }
    return pts;
}

function transformPts(pts: Float32Array, s: number, dx: number, dy: number) {
    for (let i = 0; i < pts.length; i += 3) {
        pts[i] = pts[i] * s + dx;
        pts[i + 1] = pts[i + 1] * s + dy;
        pts[i + 2] *= s;
    }
}

function concatPts(a: Float32Array, b: Float32Array) {
    const out = new Float32Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

/** Luna a la izquierda y CHAIDE a la derecha, con un poco de volumen. */
function moonAndWord(masks: Masks, n: number, r: Rng): Float32Array {
    const moonN = (n * 0.34) | 0;
    const moonPts = masks.moon ? fromMask(masks.moon, moonN, r, 1.12, 0.2) : crescent(moonN, r);
    const wordPts = fromMask(masks.text70, n - moonN, r, 1.38, 0.18);
    transformPts(moonPts, 0.6, -1.2, 0.02);
    transformPts(wordPts, 0.86, 0.6, 0);
    return concatPts(moonPts, wordPts);
}

/** Disco menos disco desplazado: respaldo si no carga la luna de Chaide. */
function crescent(n: number, r: Rng) {
    return build(n, r, () => {
        for (;;) {
            const x = (r() * 2 - 1) * 0.95;
            const y = (r() * 2 - 1) * 0.95;
            if (x * x + y * y < 0.9 && (x - 0.35) ** 2 + (y - 0.3) ** 2 > 0.45) return [x, y, (r() - 0.5) * 0.7];
        }
    });
}

export function generateShape(name: ShapeName, n: number, masks: Masks): Shape {
    const r = mulberry32(name.length * 7919 + name.charCodeAt(0) * 131);
    const meta = META[name];
    const gen = GENERATORS[name];
    let pts: Float32Array;
    if (gen) pts = gen(n, r);
    else if (name === 'moon') pts = masks.moon ? moonFilled(masks.moon, n, r) : crescent(n, r);
    else if (name === 'brand') pts = moonAndWord(masks, n, r);
    else if (name === 'logo') pts = masks.logo ? fromMask(masks.logo, n, r, 1.9, 0.08) : fromMask(masks.text70, n, r, 1.4, 0.08);
    else if (name === 'text70') pts = fromMask(masks.text70, n, r, 1.45, 0.12);
    else pts = fromMask(masks.shield, n, r, 1.05, 0.1);
    return { pts, ...meta };
}
