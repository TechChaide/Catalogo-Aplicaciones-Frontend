'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { environment } from '@/environments/environments.prod';
import { guardarAccesos, leerAplicacionesGuardadas, resolverAccesos } from '@/lib/permisos';
import { ADN_CAPITULOS, ADN_STEPS } from '@/components/catalog/adn-data';
import { AppsByArea } from '@/components/catalog/apps-by-area';
import { Atmosphere } from '@/components/catalog/atmosphere';
import { ParticleField, type Layout } from '@/components/catalog/particle-field';
import { type ShapeName } from '@/components/catalog/shapes';
import { scramble } from '@/components/catalog/scramble';
import '@/components/catalog/catalog.css';

gsap.registerPlugin(ScrollTrigger);
// En iOS/Android la barra de direcciones cambia el alto al hacer scroll: no recalcular por eso (evita saltos en los pins).
ScrollTrigger.config({ ignoreMobileResize: true });

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const asset = (path: string) => `${environment.basePath}${path}`;

interface Area {
    codigo_area: number;
    nombre_area: string;
}

interface Aplicacion {
    codigo_aplicacion?: string;
    nombre_aplicacion: string;
    url: string | null;
    icono: string | null;
    estado: string;
    codigo_area?: number | null;
    area?: Area | null;
}

const LOADER_PHASES = ['Identidad', 'Permisos', 'Módulos', 'Catálogo'];
const NAV = [
    { id: 'adn', label: 'Nuestro ADN' },
    { id: 'aplicaciones', label: 'Aplicaciones' },
    { id: 'contacto', label: 'Contacto' },
] as const;

function readLayout(el: HTMLElement): Partial<Layout> {
    const n = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
    return {
        x: n(el.dataset.x, 0),
        y: n(el.dataset.y, 0),
        scale: n(el.dataset.scale, 1),
        alpha: n(el.dataset.alpha, 1),
    };
}

/** "M. Ensayos de Laboratorio" → "Ensayos de Laboratorio" */
function displayName(nombre: string) {
    return nombre.replace(/^M\.\s*/i, '').trim();
}

/**
 * Códigos de aplicación permitidos al usuario. Se recalculan con sus perfiles (así un permiso
 * nuevo o revocado se refleja sin volver a iniciar sesión); si no se puede, se usa lo guardado en el login.
 */
async function cargarPermisos(): Promise<string[]> {
    const guardadas = leerAplicacionesGuardadas() ?? [];
    try {
        const perfiles = JSON.parse(localStorage.getItem('perfiles') || 'null');
        if (!Array.isArray(perfiles) || !perfiles.length) return guardadas;
        const accesos = await resolverAccesos(perfiles);
        if (!accesos.aplicaciones.length) return guardadas; // la consulta falló o no hubo respuesta
        guardarAccesos(accesos);
        return accesos.aplicaciones;
    } catch {
        return guardadas;
    }
}

function useClock() {
    const [now, setNow] = useState('');
    useEffect(() => {
        const fmt = new Intl.DateTimeFormat('es-EC', {
            timeZone: 'America/Guayaquil',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        const update = () => setNow(fmt.format(new Date()).replace(',', ' ·'));
        update();
        const id = window.setInterval(update, 1000);
        return () => window.clearInterval(id);
    }, []);
    return now;
}

const MOON_LAYOUT = { x: 0.26, y: 0.02, scale: 0.66, alpha: 1 } as const;
const FOOTER_MOON = { x: 0.28, y: 0.28, scale: 0.66, alpha: 1 } as const;

export function AppCatalog() {
    const [apps, setApps] = useState<Aplicacion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showLoader, setShowLoader] = useState(true); // se oculta al terminar la intro; el nodo sigue en el DOM hasta display:none de GSAP

    const rootRef = useRef<HTMLDivElement>(null);
    const lenisRef = useRef<Lenis | null>(null);
    const fieldRef = useRef<ParticleField | null>(null);
    const shapeRef = useRef<{ ready: boolean; name: ShapeName; layout: Partial<Layout> }>({
        ready: false,
        name: 'moon',
        layout: MOON_LAYOUT,
    });
    const adnItems = useRef<(HTMLLIElement | null)[]>([]);
    const adnPanels = useRef<(HTMLDivElement | null)[]>([]);
    const adnTabs = useRef<(HTMLLIElement | null)[]>([]);
    const now = useClock();

    const applyShape = useCallback((name: ShapeName, layout: Partial<Layout>, duration?: number) => {
        const s = shapeRef.current;
        s.name = name;
        s.layout = layout;
        if (s.ready) fieldRef.current?.setShape(name, layout, duration);
    }, []);

    useEffect(() => {
        // Catálogo público + permisos del usuario, en paralelo. Solo se muestran las apps permitidas.
        const catalogo = fetch(`${environment.apiURL}/api/aplicacions/publicas`).then((res) => {
            if (!res.ok) throw new Error('Error al cargar el catálogo');
            return res.json();
        });
        catalogo
            .then(async (body) => {
                const activas = (body.data as Aplicacion[]).filter((a) => a.estado === 'A');
                const permitidas = new Set(await cargarPermisos());
                setApps(activas.filter((a) => a.codigo_aplicacion && permitidas.has(a.codigo_aplicacion)));
            })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    // ---------- Scroll suave (Lenis) sincronizado con GSAP ----------
    // Efecto de layout para que exista antes del loader, que detiene el scroll.
    useIsoLayoutEffect(() => {
        const onNative = () => fieldRef.current?.setScroll(window.scrollY, 0);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            window.addEventListener('scroll', onNative, { passive: true });
            return () => window.removeEventListener('scroll', onNative);
        }
        const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
        lenisRef.current = lenis;
        lenis.on('scroll', (l: Lenis) => {
            ScrollTrigger.update();
            fieldRef.current?.setScroll(l.scroll, l.velocity);
        });
        const raf = (t: number) => lenis.raf(t * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
        return () => {
            gsap.ticker.remove(raf);
            lenis.destroy();
            lenisRef.current = null;
        };
    }, []);

    // ---------- Loader + entrada de la primera sección (ADN) ----------
    useIsoLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let seen = false;
        try { seen = sessionStorage.getItem('cx-intro') === '1'; } catch { /* almacenamiento no disponible */ }

        const ctx = gsap.context(() => {
            const intro = gsap.timeline({ paused: true });
            intro
                .from('.adn-head .mask > span', { yPercent: 118, duration: 1.5, stagger: 0.1, ease: 'expo.out' })
                .fromTo('.adn-copy .eyebrow, .adn-panel, .adn-scroll', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, stagger: 0.06, ease: 'expo.out', clearProps: 'opacity,transform' }, 0.35)
                .fromTo('.cx-header', { yPercent: -100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'expo.out', clearProps: 'transform' }, 0.2);

            const finishLoader = () => {
                try { sessionStorage.setItem('cx-intro', '1'); } catch { /* almacenamiento no disponible */ }
                shapeRef.current.ready = true;
                const s = shapeRef.current;
                fieldRef.current?.setShape(s.name, s.layout, 2.8);
                if (fieldRef.current) gsap.to(fieldRef.current, { fade: 1, duration: 1.2 });
                root.classList.add('is-ready');
                setShowLoader(false);
                lenisRef.current?.start();
                intro.play();
            };

            if (reduce || seen) {
                gsap.set('.cx-loader', { display: 'none' });
                finishLoader();
                if (reduce) intro.progress(1);
                return;
            }

            lenisRef.current?.stop();
            const counter = { v: 0 };
            const countEl = root.querySelector<HTMLElement>('.cx-loader-count');
            const statusEl = root.querySelector<HTMLElement>('.cx-loader-status');
            let era = -1;
            gsap.timeline()
                .fromTo('.cx-loader > *', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'expo.out' })
                .to(counter, {
                    v: 100,
                    duration: 2.8,
                    ease: 'power2.inOut',
                    onUpdate: () => {
                        if (countEl) countEl.textContent = String(Math.round(counter.v)).padStart(3, '0');
                        const e = Math.min(3, Math.floor(counter.v / 25));
                        if (e !== era && statusEl) {
                            era = e;
                            scramble(statusEl, `Fase 0${e + 1} · ${LOADER_PHASES[e]}`, 0.6);
                        }
                        if (fieldRef.current) fieldRef.current.fade = 0.3 + (counter.v / 100) * 0.5;
                    },
                }, 0.2)
                .to('.cx-loader-bar span', { scaleX: 1, duration: 2.8, ease: 'power2.inOut' }, 0.2)
                .to('.cx-loader > *', { opacity: 0, y: -24, duration: 0.7, stagger: 0.05, ease: 'power3.in' }, '+=0.25')
                .add(finishLoader, '-=0.35')
                .set('.cx-loader', { display: 'none' });
        }, rootRef);
        return () => ctx.revert();
    }, []);

    // ---------- Animaciones de scroll ----------
    useIsoLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const mm = gsap.matchMedia();

        const ctx = gsap.context(() => {
            gsap.utils.toArray<HTMLElement>('[data-shape]').forEach((el) => {
                ScrollTrigger.create({
                    trigger: el,
                    start: 'top 55%',
                    end: 'bottom 55%',
                    onToggle: (self) => {
                        if (self.isActive) applyShape(el.dataset.shape as ShapeName, readLayout(el));
                    },
                });
            });

            NAV.forEach(({ id }) => {
                const link = root.querySelector(`[data-nav="${id}"]`);
                ScrollTrigger.create({
                    trigger: `#${id}`,
                    start: 'top 50%',
                    end: 'bottom 50%',
                    onToggle: (self) => link?.classList.toggle('is-active', self.isActive),
                });
            });

            // Botón flotante "Ir a Aplicaciones": visible solo mientras se recorre el ADN.
            ScrollTrigger.create({
                trigger: '.adn-section',
                start: 'top 40%',
                end: 'bottom 60%',
                toggleClass: { targets: '.cx-goapps', className: 'is-visible' },
            });

            // Cabecera que se oculta al bajar + barra de progreso.
            const header = root.querySelector('.cx-header');
            gsap.to('.cx-progress span', {
                scaleX: 1,
                ease: 'none',
                scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
            });
            ScrollTrigger.create({
                start: 0,
                end: 'max',
                onUpdate: (self) => {
                    const desktop = window.matchMedia('(min-width: 901px)').matches;
                    header?.classList.toggle('is-hidden', desktop && self.direction === 1 && self.scroll() > 240);
                },
            });

            const setProgress = (p: number) => {
                const total = ADN_STEPS.length;
                const active = Math.min(total - 1, Math.floor(p * total));
                const capitulo = ADN_STEPS[active].capitulo;
                adnItems.current.forEach((li, i) => {
                    li?.classList.toggle('is-built', i <= active);
                    li?.classList.toggle('is-active', i === active);
                });
                adnPanels.current.forEach((panel, i) => panel?.classList.toggle('is-current', i === capitulo));
                adnTabs.current.forEach((tab, i) => {
                    tab?.classList.toggle('is-current', i === capitulo);
                    tab?.classList.toggle('is-done', i < capitulo);
                });
            };
            setProgress(0);

            mm.add(
                { motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' },
                (c) => {
                    const { reduce } = c.conditions as { reduce: boolean };

                    if (reduce) {
                        root.querySelector('.adn-section')?.classList.add('is-static');
                        setProgress(1);
                    } else {
                        const build = { p: 0 };
                        gsap.to(build, {
                            p: 1,
                            duration: 5.5,
                            ease: 'power1.inOut',
                            onUpdate: () => setProgress(build.p),
                            onComplete: () => {
                                const cycle = { i: 0 };
                                gsap.to(cycle, {
                                    i: ADN_STEPS.length,
                                    duration: ADN_STEPS.length * 1.8,
                                    ease: 'none',
                                    repeat: -1,
                                    onUpdate: () => {
                                        const active = Math.min(ADN_STEPS.length - 1, Math.floor(cycle.i % ADN_STEPS.length));
                                        adnItems.current.forEach((li, i) => li?.classList.toggle('is-active', i === active));
                                        adnPanels.current.forEach((panel, i) => panel?.classList.toggle('is-current', i === ADN_STEPS[active].capitulo));
                                    },
                                });
                            },
                        });
                    }

                    gsap.utils.toArray<HTMLElement>('[data-scramble-in]').forEach((el) => {
                        ScrollTrigger.create({
                            trigger: el,
                            start: 'top 85%',
                            once: true,
                            onEnter: () => scramble(el, el.dataset.scrambleIn!, 1.3),
                        });
                    });

                    gsap.from('.cx-apps-title', { y: 28, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.cx-apps', start: 'top 75%' } });
                    gsap.from('.cx-footer-cta h3 .mask > span', { yPercent: 110, duration: 1.2, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.cx-footer', start: 'top 75%' } });
                },
            );
        }, root);

        document.fonts?.ready.then(() => ScrollTrigger.refresh());
        return () => { mm.revert(); ctx.revert(); };
    }, [applyShape]);

    // ---------- Scramble al pasar y botones magnéticos ----------
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const onOver = (e: PointerEvent) => {
            const t = e.target as HTMLElement;
            const s = t.closest<HTMLElement>('[data-scramble-hover]');
            const from = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-scramble-hover]');
            if (s && s !== from && s.dataset.text) scramble(s, s.dataset.text, 0.6);
        };
        const magnets = root.querySelectorAll<HTMLElement>('.cx-magnetic');
        const magnetMove = (e: PointerEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.6, ease: 'power3' });
        };
        const magnetLeave = (e: PointerEvent) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
        magnets.forEach((m) => { m.addEventListener('pointermove', magnetMove); m.addEventListener('pointerleave', magnetLeave); });
        root.addEventListener('pointerover', onOver);
        return () => {
            root.removeEventListener('pointerover', onOver);
            magnets.forEach((m) => { m.removeEventListener('pointermove', magnetMove); m.removeEventListener('pointerleave', magnetLeave); });
        };
    }, []);

    // ---------- Marquee que responde a la velocidad del scroll ----------
    useEffect(() => {
        const track = rootRef.current?.querySelector<HTMLElement>('.cx-marquee-track');
        if (!track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let x = 0;
        let skew = 0;
        const tick = (_t: number, dt: number) => {
            const v = lenisRef.current?.velocity ?? 0;
            const half = track.scrollWidth / 2;
            x -= (0.06 + Math.min(Math.abs(v) * 0.02, 0.6)) * dt * (v < -0.5 ? -1 : 1);
            if (x <= -half) x += half;
            if (x > 0) x -= half;
            skew += (gsap.utils.clamp(-8, 8, -v * 0.4) - skew) * 0.1;
            track.style.transform = `translate3d(${x}px,0,0) skewX(${skew}deg)`;
        };
        gsap.ticker.add(tick);
        return () => gsap.ticker.remove(tick);
    }, [apps]);

    const scrollTo = (selector: string, offset = 0) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return;
        if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.8, offset });
        else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
    };

    const marqueeNames = apps.length ? apps.map((a) => displayName(a.nombre_aplicacion)) : ['Calidad', 'Seguridad', 'Producción', 'Servicio'];

    return (
        <div className="cx" ref={rootRef} suppressHydrationWarning>
            <Atmosphere fieldRef={fieldRef} initialShape="moon" initialLayout={MOON_LAYOUT} />

            <div className="cx-loader" aria-hidden="true" style={showLoader ? undefined : { display: 'none' }}>
                    <div className="cx-loader-row">
                        <span className="cx-mono">Tecnología - Chaide</span>
                    </div>
                    <div className="cx-loader-row cx-loader-mid">
                        <span>Chaide</span>
                        <span>Catálogo de aplicaciones</span>
                    </div>
                    <div className="cx-loader-row">
                        <span className="cx-loader-count">000</span>
                        <div className="cx-loader-meta">
                            <span className="cx-loader-status">Inicializando</span>
                            <div className="cx-loader-bar"><span /></div>
                        </div>
                    </div>
            </div>

            <div className="cx-progress" aria-hidden><span /></div>
            <button className="cx-goapps" onClick={() => scrollTo('#aplicaciones')}>
                <span data-scramble-hover data-text="Ir a Aplicaciones">Ir a Aplicaciones</span> <ArrowDown size={16} />
            </button>

            <header className="cx-header">
                <button className="cx-logo" onClick={() => scrollTo('#adn')} aria-label="Chaide — ir al inicio">
                    <img src={asset('/img/chaide-luna.svg')} alt="" />
                    <span data-scramble-hover data-text="Chaide">Chaide</span>
                    <span className="cx-logo-sub">/ Catálogo</span>
                </button>
                <nav className="cx-nav">
                    {NAV.map((s, i) => (
                        <button key={s.id} data-nav={s.id} onClick={() => scrollTo(`#${s.id}`)}>
                            <span className="cx-mono">0{i + 1}</span>
                            <span data-scramble-hover data-text={s.label}>{s.label}</span>
                        </button>
                    ))}
                </nav>
                <span className="cx-clock">
                    <span className="cx-pulse" />
                    {now}
                </span>
            </header>

            <main className="cx-main">
                {/* ---------- ADN Chaide ---------- */}
                <section className="adn-section" id="adn" data-shape="moon" data-x="0.26" data-y="0.02" data-scale="0.66" data-alpha="1">
                    <div className="adn-pin">
                        <div className="adn-copy">
                            <span className="eyebrow" data-scramble-in="Nuestra Identidad" data-scramble-hover data-text="Nuestra Identidad">Nuestra Identidad</span>
                            <h2 className="adn-head">
                                <span className="mask"><span data-scramble-hover data-text="El ADN">El ADN</span></span>
                                <span className="mask"><span className="serif" data-scramble-hover data-text="de Chaide.">de Chaide.</span></span>
                            </h2>
                        </div>
                        <div className="adn-panels" aria-label="Capítulos del ADN">
                            {ADN_CAPITULOS.map((c, ci) => (
                                <div key={c.key} className={`adn-panel adn-panel--${c.key}`} ref={(el) => { adnPanels.current[ci] = el; adnTabs.current[ci] = el; }}>
                                    <h3 className="adn-panel-title">
                                        <span className="adn-panel-idx">{String(ci + 1).padStart(2, '0')}</span>
                                        <span data-scramble-hover data-text={c.titulo}>{c.titulo}</span>{' '}
                                        <span className="serif" data-scramble-hover data-text={c.acento}>{c.acento}</span>
                                    </h3>
                                    {c.intro && <p className="adn-intro">{c.intro}</p>}
                                    <ol className="adn-steps">
                                        {ADN_STEPS.map((step, i) => {
                                            if (step.capitulo !== ci) return null;
                                            const Icono = step.icono ? (LucideIcons as Record<string, any>)[step.icono] : null;
                                            return (
                                                <li key={i} className="adn-step" ref={(el) => { adnItems.current[i] = el; }}>
                                                    {Icono && <span className="adn-step-icon" aria-hidden="true"><Icono size={16} /></span>}
                                                    <span className="adn-step-body">
                                                        {step.etiqueta && <span className="adn-step-label" data-scramble-hover data-text={step.etiqueta}>{step.etiqueta}</span>}
                                                        <span className="adn-step-title" data-scramble-hover data-text={step.titulo}>{step.titulo}</span>
                                                        {(step.destacado || step.detalle) && (
                                                            <span className="adn-step-text">{step.destacado && <b>{step.destacado}</b>} {step.detalle}</span>
                                                        )}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </div>
                            ))}
                        </div>
                        <div className="cx-scroll adn-scroll" aria-hidden="true"><i /> Desliza</div>
                    </div>
                </section>

                <AppsByArea apps={apps} loading={loading} error={error} />

                {/* ---------- Marquee ---------- */}
                <section className="cx-marquee" data-shape="galaxy" data-scale="1.35" data-alpha="0.55" aria-hidden="true">
                    <div className="cx-marquee-track">
                        {[...marqueeNames, ...marqueeNames].map((n, i) => (
                            <span key={i}>
                                {n}
                                <img className="cx-marquee-moon" src={asset('/img/chaide-luna.svg')} alt="" />
                            </span>
                        ))}
                    </div>
                </section>
            </main>

            {/* ---------- Footer ---------- */}
            <footer className="cx-footer" id="contacto" data-shape="moon" data-x={FOOTER_MOON.x} data-y={FOOTER_MOON.y} data-scale={FOOTER_MOON.scale} data-alpha={FOOTER_MOON.alpha}>
                <div className="cx-footer-cta">
                    <span className="eyebrow" data-scramble-in="¿Necesitas acceso?" data-scramble-hover data-text="¿Necesitas acceso?">¿Necesitas acceso?</span>
                    <h3>
                        <span className="mask"><span data-scramble-hover data-text="Solicítalo a">Solicítalo a</span></span>
                        <span className="mask"><span className="serif" data-scramble-hover data-text="Tecnología.">Tecnología.</span></span>
                    </h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="cx-btn cx-magnetic" onClick={() => scrollTo('#adn')}>Volver arriba ↑</button>
                        <a className="cx-btn cx-magnetic" href="https://www.chaide.com/" target="_blank" rel="noopener noreferrer">chaide.com <ArrowUpRight size={16} /></a>
                    </div>
                </div>
                <div className="cx-footer-stage" aria-hidden="true" />
                <div className="cx-footer-bar">
                    <span>© {new Date().getFullYear()} Chaide · Sueña con un mundo mejor</span>
                    <span>{now}</span>
                    <span>Tecnologías de la Información</span>
                </div>
            </footer>
        </div>
    );
}
