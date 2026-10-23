'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { gsap } from 'gsap';

// Doble hélice de partículas con el isotipo de Chaide en los extremos de cada puente.
// Las partículas que aún no forman la cadena flotan dispersas como polvo; según
// `state.build` (0…1) vuelan a su lugar par a par, desde el centro hacia los extremos,
// mientras la hélice gira, y cada puente destella al cerrarse. La mezcla aditiva da el
// brillo de la referencia. Todo es continuo: ningún valor cambia de golpe entre frames.

export interface HelixState {
    build: number; // objetivo 0…1
    active: number; // tramo (valor/objetivo) resaltado, -1 ninguno
}

const PAIRS = 22;
const TWIST = 0.52; // radianes entre pares consecutivos
const WINDOW = 2.6; // pares que se construyen a la vez
const STRAND_PARTICLES = 1700; // por hebra
const RUNG_PARTICLES = 72; // por puente
const DUST = 260;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// Orden de construcción: del centro de la hélice hacia ambos extremos (0…PAIRS-1),
// para que se vea desde el primer instante y no empiece en un borde desvanecido.
const MID = (PAIRS - 1) / 2;
const orderOf = (t: number) => Math.abs(t - MID) * 2;

interface Particle {
    kind: 0 | 1 | 2; // hebra, puente, polvo
    strand: number;
    t: number; // posición a lo largo de la hélice (0…PAIRS-1)
    u: number; // posición a lo largo del puente (0…1)
    jr: number; jy: number; jz: number; // grosor de la cinta
    ox: number; oy: number; oz: number; // origen disperso (unidades de R)
    order: number; // cuándo se construye
    size: number;
    seed: number;
}

function makeParticles(scale: number): Particle[] {
    const ps: Particle[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const scatter = () => ({ ox: rnd(-3.2, 3.2), oy: rnd(-0.6, 0.6), oz: rnd(-1.5, 1.5) });

    for (let s = 0; s < 2; s++) {
        for (let k = 0; k < Math.round(STRAND_PARTICLES * scale); k++) {
            const t = Math.random() * (PAIRS - 1);
            ps.push({
                kind: 0, strand: s, t, u: 0,
                jr: gauss() * 0.07, jy: gauss() * 0.22, jz: gauss() * 0.07,
                ...scatter(), order: orderOf(t), size: rnd(0.6, 1.9), seed: Math.random() * 1000,
            });
        }
    }
    for (let i = 0; i < PAIRS; i++) {
        for (let k = 0; k < Math.round(RUNG_PARTICLES * scale); k++) {
            ps.push({
                kind: 1, strand: 0, t: i, u: Math.random(),
                jr: 0, jy: gauss() * 0.06, jz: gauss() * 0.03,
                ...scatter(), order: orderOf(i) + 0.8, size: rnd(0.5, 1.5), seed: Math.random() * 1000,
            });
        }
    }
    for (let k = 0; k < Math.round(DUST * scale); k++) {
        ps.push({
            kind: 2, strand: 0, t: 0, u: 0, jr: 0, jy: 0, jz: 0,
            ox: rnd(-4, 4), oy: rnd(-0.55, 0.55), oz: rnd(-1, 1), order: 0,
            size: Math.random() < 0.12 ? rnd(4, 11) : rnd(0.6, 1.6), seed: Math.random() * 1000,
        });
    }
    return ps;
}

export function AdnHelix({ state, src, groups }: { state: MutableRefObject<HelixState>; src: string; groups: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const img = new Image();
        img.src = src;
        // Teléfonos y equipos con pocos núcleos: menos partículas (más grandes, misma apariencia).
        const small = window.matchMedia('(max-width: 700px)').matches;
        const cores = navigator.hardwareConcurrency || 4;
        const scale = small || cores <= 4 ? 0.55 : 1;
        const particles = makeParticles(scale);

        // Sprite de brillo suave, reutilizado por cada partícula.
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 32;
        const sg = sprite.getContext('2d')!;
        const grad = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(235,244,255,0.85)');
        grad.addColorStop(1, 'rgba(200,225,255,0)');
        sg.fillStyle = grad;
        sg.fillRect(0, 0, 32, 32);

        let W = 0, H = 0, dpr = 1;
        const resize = () => {
            const r = canvas.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
            const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
            W = r.width; H = r.height;
            // Reasignar el tamaño borra el lienzo: solo cuando de verdad cambia, y se redibuja
            // en el acto (si no, ese frame se mostraría vacío: un parpadeo).
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
                return true;
            }
            return false;
        };
        resize();
        const ro = new ResizeObserver(() => { if (resize()) { last = performance.now(); tick(); } });
        ro.observe(canvas);

        let visible = true;
        const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px' });
        io.observe(canvas);

        let rot = 0;
        let build = reduce ? 1 : state.current.build;
        let last = performance.now();
        // Brillo de cada tramo, interpolado: el resaltado entra y sale sin saltos.
        const glow = new Float32Array(groups);
        const groupOf = (t: number) => Math.min(groups - 1, Math.floor((orderOf(t) / PAIRS) * groups));
        const smooth = (t: number) => { const c = clamp(t); return c * c * (3 - 2 * c); };

        function tick() {
            const now = performance.now();
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!visible || !W || !H) return;

            build = reduce ? 1 : build + (state.current.build - build) * (1 - Math.exp(-dt * 3));
            if (!reduce) rot += dt * 0.5;
            const time = now / 1000;
            const active = state.current.active;
            const follow = reduce ? 1 : 1 - Math.exp(-dt * 2.5);
            for (let g = 0; g < groups; g++) glow[g] += ((g === active ? 1 : 0) - glow[g]) * follow;
            const head = build * (PAIRS + WINDOW + 1);

            const cx = W / 2, cy = H / 2;
            const length = H * 0.86;
            const spacing = length / (PAIRS - 1);
            const R = Math.min(W * 0.26, H * 0.13, 150);
            const tilt = -0.18;
            const ct = Math.cos(tilt), st = Math.sin(tilt);
            // Proyección con ligera perspectiva y la hélice inclinada.
            const proj = (x: number, y: number, z: number) => {
                const k = 1 / (1 - z * 0.18);
                const px = x * k, py = y * k;
                return [cx + px * ct - py * st, cy + px * st + py * ct, k] as const;
            };

            // Desvanecido arriba y abajo, dentro del propio canvas (sin máscara CSS: en Chrome la
            // máscara sobre un elemento fijado puede recomponerse y dejar un frame en blanco).
            const band = H * 0.14;
            const edge = (sy: number) => smooth(sy / band) * smooth((H - sy) / band);

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);

            ctx.globalCompositeOperation = 'lighter';
            for (const p of particles) {
                let x: number, y: number, z: number, alpha: number, size = p.size;

                if (p.kind === 2) {
                    // Polvo y bokeh flotando.
                    x = (p.ox + Math.sin(time * 0.15 + p.seed) * 0.15) * R;
                    y = (p.oy + Math.sin(time * 0.1 + p.seed * 2) * 0.03) * length;
                    z = p.oz;
                    alpha = p.size > 3 ? 0.05 + 0.03 * Math.sin(time * 0.6 + p.seed) : 0.3;
                } else {
                    let tx: number, ty: number, tz: number;
                    if (p.kind === 0) {
                        const ang = p.t * TWIST + rot + p.strand * Math.PI;
                        const r = R * (1 + p.jr);
                        tx = Math.cos(ang) * r;
                        tz = Math.sin(ang) + p.jz;
                        ty = -length / 2 + p.t * spacing + p.jy * spacing;
                    } else {
                        const ang = p.t * TWIST + rot;
                        const ax = Math.cos(ang) * R, az = Math.sin(ang);
                        tx = ax + (-2 * ax) * p.u;
                        tz = az + (-2 * az) * p.u + p.jz;
                        ty = -length / 2 + p.t * spacing + p.jy * spacing;
                    }
                    const e = smooth((head - p.order) / WINDOW);
                    // Origen disperso que deriva lentamente.
                    const ox = (p.ox + Math.sin(time * 0.2 + p.seed) * 0.1) * R;
                    const oy = ty + p.oy * length * 0.5;
                    x = ox + (tx - ox) * e;
                    y = oy + (ty - oy) * e;
                    z = p.oz + (tz - p.oz) * e;
                    // Algunas partículas quedan orbitando la cadena; su órbita entra de forma gradual.
                    if (p.seed % 17 < 1) {
                        const loose = smooth((e - 0.7) / 0.3);
                        x += Math.sin(time * 0.8 + p.seed) * R * 0.25 * loose;
                        y += Math.cos(time * 0.6 + p.seed) * spacing * 0.6 * loose;
                    }
                    const g = glow[groupOf(p.t)] * e;
                    alpha = (0.1 + 0.8 * e) * (1 + 0.45 * g);
                    size *= 1 + 0.3 * g;
                    // Destello suave (campana) cuando el puente termina de cerrarse.
                    if (p.kind === 1 && !reduce) {
                        const x0 = head - p.order - WINDOW;
                        const spark = Math.exp(-(x0 * x0) / 0.5) * 0.6;
                        alpha += spark;
                        size *= 1 + spark;
                    }
                }

                const [sx, sy, k] = proj(x, y, z);
                const depth = (clamp(z, -1, 1) + 1) / 2;
                ctx.globalAlpha = clamp(alpha * (0.35 + 0.65 * depth) * edge(sy));
                const s = size * k * (scale < 1 ? 3.8 : 3.2);
                ctx.drawImage(sprite, sx - s / 2, sy - s / 2, s, s);
            }

            // Isotipos en una sola pasada ordenada por profundidad: sin cambios bruscos de capa.
            const logos: { x: number; y: number; d: number; s: number; a: number; spin: number; g: number }[] = [];
            for (let i = 0; i < PAIRS; i++) {
                const e = smooth((head - orderOf(i)) / WINDOW);
                if (e <= 0.001) continue;
                for (let s = 0; s < 2; s++) {
                    const ang = i * TWIST + rot + s * Math.PI;
                    const d = Math.sin(ang);
                    const fly = 1 - e;
                    const [x, y, k] = proj(Math.cos(ang) * R * (1 + fly * 2.2), -length / 2 + i * spacing + fly * 90, d);
                    logos.push({ x, y, d, s: R * 0.2 * k * (0.5 + 0.5 * e), a: e, spin: ang * 0.5, g: glow[groupOf(i)] });
                }
            }
            logos.sort((a, b) => a.d - b.d);
            const aspect = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 291 / 303;
            ctx.globalCompositeOperation = 'source-over';
            if (img.complete && img.naturalWidth) {
                for (const L of logos) {
                    // Los de atrás quedan más tenues y no tapan el brillo de adelante.
                    const depth = (L.d + 1) / 2;
                    ctx.globalAlpha = L.a * (0.18 + 0.82 * depth * depth) * edge(L.y);
                    ctx.save();
                    ctx.translate(L.x, L.y);
                    ctx.rotate(L.spin);
                    if (L.g > 0.02) { ctx.shadowColor = `rgba(255,255,255,${(0.9 * L.g).toFixed(3)})`; ctx.shadowBlur = 20 * L.g; }
                    ctx.drawImage(img, -L.s / 2, (-L.s * aspect) / 2, L.s, L.s * aspect);
                    ctx.restore();
                }
            }
            ctx.globalAlpha = 1;
        }

        gsap.ticker.add(tick);
        return () => { gsap.ticker.remove(tick); ro.disconnect(); io.disconnect(); };
    }, [src, groups, state]);

    return <canvas ref={canvasRef} className="adn-canvas" role="img" aria-label="Doble hélice de ADN formada por partículas y el isotipo de Chaide, que se construye mientras gira" />;
}
