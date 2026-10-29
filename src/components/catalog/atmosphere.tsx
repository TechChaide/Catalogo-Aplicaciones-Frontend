'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { gsap } from 'gsap';
import { environment } from '@/environments/environments.prod';
import { ParticleField, type Layout } from './particle-field';
import { maskFromImage, maskFromText, shieldMask, type ShapeName } from './shapes';

const asset = (path: string) => `${environment.basePath}${path}`;
const DEFAULT_LAYOUT: Partial<Layout> = { scale: 1.35, alpha: 0.7 };

export function Atmosphere({
    fieldRef,
    initialShape = 'galaxy',
    initialLayout = DEFAULT_LAYOUT,
    htmlClass = 'cx-html',
}: {
    fieldRef: MutableRefObject<ParticleField | null>;
    initialShape?: ShapeName;
    initialLayout?: Partial<Layout>;
    htmlClass?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        document.documentElement.classList.add(htmlClass);
        return () => document.documentElement.classList.remove(htmlClass);
    }, [htmlClass]);

    useEffect(() => {
        const root = canvasRef.current?.parentElement;
        if (!root) return;
        const fine = window.matchMedia('(pointer: fine)').matches;
        const dot = root.querySelector<HTMLElement>('.cx-cursor-dot');
        const ring = root.querySelector<HTMLElement>('.cx-cursor-ring');
        const spot = root.querySelector<HTMLElement>('.cx-spot');
        if (!dot || !ring || !spot) return;

        const dotX = gsap.quickTo(dot, 'x', { duration: 0.08 });
        const dotY = gsap.quickTo(dot, 'y', { duration: 0.08 });
        const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
        const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
        const spotX = gsap.quickTo(spot, 'x', { duration: 1.2, ease: 'power3' });
        const spotY = gsap.quickTo(spot, 'y', { duration: 1.2, ease: 'power3' });

        const onMove = (e: PointerEvent) => {
            fieldRef.current?.setPointer(e.clientX, e.clientY);
            if (!fine) return;
            dotX(e.clientX); dotY(e.clientY);
            ringX(e.clientX); ringY(e.clientY);
            spotX(e.clientX); spotY(e.clientY);
            const card = (e.target as HTMLElement).closest?.<HTMLElement>('.cx-glow');
            if (card) {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            }
        };
        const onLeave = () => fieldRef.current?.clearPointer();
        const onOver = (e: PointerEvent) => {
            root.classList.toggle('cursor-hover', !!(e.target as HTMLElement).closest('a, button, input, [data-scramble-hover]'));
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        document.documentElement.addEventListener('pointerleave', onLeave);
        root.addEventListener('pointerover', onOver);
        return () => {
            window.removeEventListener('pointermove', onMove);
            document.documentElement.removeEventListener('pointerleave', onLeave);
            root.removeEventListener('pointerover', onOver);
        };
    }, [fieldRef]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let cancelled = false;
        let field: ParticleField | null = null;
        const tick = (_t: number, dt: number) => field?.render(dt / 1000);
        const onResize = () => field?.resize();

        (async () => {
            const [moon, logo, text70] = await Promise.all([
                maskFromImage(asset('/img/chaide-luna.svg'), 640),
                maskFromImage(asset('/img/logo_chaide.svg'), 560),
                maskFromText('CHAIDE', '600 260px "Inter Tight"'),
            ]);
            if (cancelled) return;
            const count = window.innerWidth < 900 ? 8000 : 18000;
            try {
                field = new ParticleField(canvas, { moon, logo, text70, shield: shieldMask() }, count);
            } catch {
                canvas.style.display = 'none';
                return;
            }
            fieldRef.current = field;
            field.resize();
            field.fade = 0.35;
            field.setShape(initialShape, initialLayout, 3);
            gsap.ticker.add(tick);
            window.addEventListener('resize', onResize);
        })();

        return () => {
            cancelled = true;
            gsap.ticker.remove(tick);
            window.removeEventListener('resize', onResize);
            field?.destroy();
            fieldRef.current = null;
        };
    }, [fieldRef, initialLayout, initialShape]);

    return (
        <>
            <canvas ref={canvasRef} className="cx-canvas" aria-hidden />
            <div className="cx-spot" aria-hidden />
            <div className="cx-vignette" aria-hidden />
            <div className="cx-grain" aria-hidden />
            <div className="cx-cursor-dot" aria-hidden />
            <div className="cx-cursor-ring" aria-hidden>
                <span />
            </div>
        </>
    );
}
