const GLYPHS = '<>/\\[]{}—=+*#01░▒▓';
const SUBTLE_GLYPHS = '·–+*';
const running = new WeakMap<HTMLElement, number>();

export type ScrambleOptions = {
    /** 0–1: proporción de letras que parpadean dentro de la banda. */
    intensity?: number;
    glyphs?: string;
    /** 0–1: ancho de la ola que recorre el texto. Más bajo = más sutil. */
    band?: number;
    /** Si ya está animando, no reinicia. */
    hold?: boolean;
};

/** Disuelve el texto actual en glifos y lo reconstruye como `to`, de izquierda a derecha. */
export function scramble(el: HTMLElement, to: string, duration = 0.9, opts?: ScrambleOptions) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = to;
        return;
    }
    if (opts?.hold && running.has(el)) return;

    const from = el.textContent ?? '';
    const len = Math.max(from.length, to.length);
    const start = performance.now();
    const prev = running.get(el);
    if (prev) cancelAnimationFrame(prev);

    const glyphs = opts?.glyphs ?? GLYPHS;
    const intensity = opts?.intensity ?? 1;
    const band = opts?.band ?? 0.65;
    const wave = Boolean(opts);

    const frame = (now: number) => {
        const p = Math.min(1, (now - start) / (duration * 1000));
        let out = '';
        for (let i = 0; i < len; i++) {
            const target = to[i] ?? '';
            if (wave) {
                const at = len <= 1 ? 0 : i / (len - 1);
                const t0 = at * (1 - band);
                const t1 = t0 + band;
                if (p >= t1 || target === ' ') out += target;
                else if (p >= t0 && Math.random() < intensity) {
                    out += glyphs[(Math.random() * glyphs.length) | 0];
                } else out += from[i] ?? target;
            } else {
                const at = i / len;
                if (p >= 0.35 + at * 0.65) out += target;
                else if (p >= at * 0.4) out += target === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
                else out += from[i] ?? '';
            }
        }
        el.textContent = out;
        if (p < 1) running.set(el, requestAnimationFrame(frame));
        else {
            running.delete(el);
            el.textContent = to;
        }
    };
    running.set(el, requestAnimationFrame(frame));
}

export const subtleScramble = {
    intensity: 0.32,
    glyphs: SUBTLE_GLYPHS,
    band: 0.22,
    hold: true,
} as const;
