'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ArrowDown, ArrowRight, ArrowUpRight, Clock, Search } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { environment } from '@/environments/environments.prod';
import { guardarAccesos, leerAplicacionesGuardadas, resolverAccesos } from '@/lib/permisos';
import { AdnHelix, type HelixState } from '@/components/catalog/adn-helix';
import { ADN_CAPITULOS, ADN_STEPS } from '@/components/catalog/adn-data';
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

interface AreaGroup {
    key: string;
    nombre: string;
    letra: string;
    showLetter: boolean; // la letra se muestra solo en la primera área que la usa
    apps: Aplicacion[];
}

const SIN_AREA = 'Otras aplicaciones';
const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Índice alfabético: áreas A→Z (las apps sin área al final) y, dentro de cada una, apps A→Z. */
function groupByArea(list: Aplicacion[]): AreaGroup[] {
    const map = new Map<string, Omit<AreaGroup, 'showLetter'>>();
    for (const app of list) {
        const nombre = app.area?.nombre_area?.trim() || SIN_AREA;
        const key = app.area ? `area-${app.area.codigo_area}` : 'area-otras';
        if (!map.has(key)) {
            map.set(key, { key, nombre, letra: app.area ? fold(nombre).charAt(0).toUpperCase() : '#', apps: [] });
        }
        map.get(key)!.apps.push(app);
    }
    const groups = [...map.values()].sort((a, b) => {
        if (a.key === 'area-otras') return 1;
        if (b.key === 'area-otras') return -1;
        return byName(a.nombre, b.nombre);
    });
    return groups.map((g, i) => ({
        ...g,
        apps: [...g.apps].sort((a, b) => byName(displayName(a.nombre_aplicacion), displayName(b.nombre_aplicacion))),
        showLetter: i === 0 || groups[i - 1].letra !== g.letra,
    }));
}

// Paleta de marca: azul base Chaide y blanco.
const THEMES = {
    blue: { bg: '#0055b8', fg: '#ffffff', muted: 'rgba(255, 255, 255, .62)', line: 'rgba(255, 255, 255, .2)' },
    white: { bg: '#ffffff', fg: '#0055b8', muted: 'rgba(0, 85, 184, .55)', line: 'rgba(0, 85, 184, .14)' },
} as const;

/** "M. Ensayos de Laboratorio" → "Ensayos de Laboratorio" */
function displayName(nombre: string) {
    return nombre.replace(/^M\.\s*/i, '').trim();
}

function monogram(nombre: string) {
    const words = displayName(nombre).split(/\s+/).filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w));
    return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '');
}

/** "https://apps.chaide.com/ACInseguras/" → "apps.chaide.com/ACInseguras" */
function routeOf(url: string | null) {
    return url ? url.replace(/^https?:\/\//i, '').replace(/\/$/, '') : 'Sin ruta asignada';
}

function isImageUrl(value: string) {
    return /^https?:\/\//i.test(value) || /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(value);
}

function isMaterialSymbol(value: string) {
    return /^[a-z][a-z0-9_]*$/.test(value);
}

function AppGlyph({ app }: { app: Aplicacion }) {
    const icono = app.icono ?? '';
    if (icono && isImageUrl(icono)) return <img src={icono} alt="" />;
    const LucideIcon = icono ? (LucideIcons as Record<string, any>)[icono] : null;
    if (LucideIcon) return <LucideIcon />;
    if (icono && isMaterialSymbol(icono)) return <span className="material-symbols-rounded" style={{ fontSize: 48 }}>{icono}</span>;
    return <span>{monogram(app.nombre_aplicacion)}</span>;
}

function AppCard({ app, index }: { app: Aplicacion; index: number }) {
    const live = !!app.url;
    const name = displayName(app.nombre_aplicacion);
    const inner = (
        <>
            <div className="ap-media">
                <div className="ap-media-inner">
                    <img className="ap-moon" src={asset('/img/chaide-luna.svg')} alt="" />
                    <span className="ap-idx">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ap-status">{live ? 'Disponible' : 'Próximamente'}</span>
                    <div className="ap-icon"><AppGlyph app={app} /></div>
                </div>
                <div className="ap-go">
                    <span>{live ? 'Ir' : 'Pronto'}</span>
                    {live ? <ArrowRight size={14} /> : <Clock size={13} />}
                </div>
                <div className="ap-rvb" />
            </div>
            <div className="ap-meta">
                <span className="ap-meta-icon"><AppGlyph app={app} /></span>
                <span className="ap-text">
                    <span className="ap-name">{name}</span>
                    <span className="ap-route">{routeOf(app.url)}</span>
                </span>
                <span className="ap-arrow" aria-hidden="true"><ArrowRight size={14} /></span>
            </div>
        </>
    );
    return live ? (
        <a className="ap-card is-live" href={app.url!} target="_blank" rel="noopener noreferrer" aria-label={`Ir a ${name}`}>
            {inner}
        </a>
    ) : (
        <div className="ap-card is-soon" aria-disabled="true">
            {inner}
        </div>
    );
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

function useQuitoClock() {
    const [time, setTime] = useState('');
    useEffect(() => {
        const fmt = new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const update = () => setTime(fmt.format(new Date()));
        update();
        const id = window.setInterval(update, 1000);
        return () => window.clearInterval(id);
    }, []);
    return time;
}

const ADN_START = 0.14;

const MANIFESTO = 'Cada aplicación es una pieza de cómo trabajamos en Chaide: calidad, seguridad, producción y servicio, conectados.';

export function AppCatalog() {
    const [apps, setApps] = useState<Aplicacion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [onlyLive, setOnlyLive] = useState(false);
    const [showLoader, setShowLoader] = useState(true);

    const rootRef = useRef<HTMLDivElement>(null);
    const lenisRef = useRef<Lenis | null>(null);
    // La hélice arranca con los pares centrales ya formados: al entrar a la sección se ve el ADN.
    const helixState = useRef<HelixState>({ build: ADN_START, active: -1 });
    const readoutRef = useRef<HTMLSpanElement>(null);
    const adnItems = useRef<(HTMLLIElement | null)[]>([]);
    const adnPanels = useRef<(HTMLDivElement | null)[]>([]);
    const adnTabs = useRef<(HTMLLIElement | null)[]>([]);
    const time = useQuitoClock();

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

    const filtered = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');
        return apps.filter((a) => {
            if (onlyLive && !a.url) return false;
            if (!q) return true;
            // Coincide por nombre de la aplicación o de su área.
            const texto = `${displayName(a.nombre_aplicacion)} ${a.area?.nombre_area ?? ''}`;
            return fold(texto.toLocaleLowerCase('es')).includes(q);
        });
    }, [apps, query, onlyLive]);

    const liveCount = apps.filter((a) => a.url).length;
    const groups = useMemo(() => groupByArea(filtered), [filtered]);

    // ---------- Scroll suave (Lenis) sincronizado con GSAP ----------
    // Efecto de layout para que exista antes del loader, que detiene el scroll.
    useIsoLayoutEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
        lenisRef.current = lenis;
        lenis.on('scroll', ScrollTrigger.update);
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
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let seen = false;
        try { seen = sessionStorage.getItem('cx-intro') === '1'; } catch { /* almacenamiento no disponible */ }

        const ctx = gsap.context(() => {
            const intro = gsap.timeline({ paused: true });
            intro
                .from('.adn-head .mask > span', { yPercent: 115, duration: 1.3, stagger: 0.09, ease: 'expo.out' })
                // fromTo explícito + clearProps: estos elementos tienen transiciones CSS de opacidad y un .from
                // leería un valor intermedio en el doble montaje de React (quedaban invisibles).
                .fromTo('.adn-copy > :not(.adn-head), .adn-scroll', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.08, ease: 'expo.out', clearProps: 'opacity,transform' }, 0.3)
                .from('.adn-stage', { opacity: 0, scale: 0.94, duration: 1.8, ease: 'expo.out' }, 0)
                // fromTo explícito: la cabecera tiene transición CSS en transform y un .from leería un valor intermedio.
                .fromTo('.cx-header', { yPercent: -100 }, { yPercent: 0, duration: 1, ease: 'expo.out', clearProps: 'transform' }, 0.2);

            if (reduce || seen) {
                setShowLoader(false);
                intro.progress(reduce ? 1 : 0).play();
                return;
            }

            lenisRef.current?.stop();
            const counter = { v: 0 };
            gsap.timeline({
                onComplete: () => {
                    try { sessionStorage.setItem('cx-intro', '1'); } catch { /* almacenamiento no disponible */ }
                    setShowLoader(false);
                    lenisRef.current?.start();
                },
            })
                .to(counter, {
                    v: 100, duration: 2, ease: 'power2.inOut',
                    onUpdate: () => {
                        const el = document.querySelector('.cx-loader-count');
                        if (el) el.textContent = String(Math.round(counter.v)).padStart(3, '0');
                    },
                })
                .to('.cx-loader-logo', { clipPath: 'circle(75% at 50% 50%)', rotate: 0, scale: 1, duration: 1.5, ease: 'expo.inOut' }, 0.15)
                .to('.cx-loader-bar span', { scaleX: 1, duration: 2, ease: 'power2.inOut' }, 0)
                .to('.cx-loader-inner, .cx-loader-count', { y: -40, opacity: 0, duration: 0.6, ease: 'power3.in' }, '+=0.15')
                .to('.cx-loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.2')
                .add(() => { intro.play(); }, '-=0.75');
        }, rootRef);
        return () => ctx.revert();
    }, []);

    // ---------- Animaciones de scroll ----------
    useIsoLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const mm = gsap.matchMedia();

        const ctx = gsap.context(() => {
            // Cambio de color de fondo por sección.
            gsap.utils.toArray<HTMLElement>('[data-theme]').forEach((section) => {
                const theme = THEMES[section.dataset.theme as keyof typeof THEMES];
                ScrollTrigger.create({
                    trigger: section,
                    start: 'top 55%',
                    end: 'bottom 55%',
                    onToggle: (self) => {
                        if (!self.isActive) return;
                        root.style.setProperty('--bg', theme.bg);
                        root.style.setProperty('--fg', theme.fg);
                        root.style.setProperty('--muted', theme.muted);
                        root.style.setProperty('--line', theme.line);
                    },
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
            const bar = root.querySelector('.cx-progress');
            ScrollTrigger.create({
                start: 0,
                end: 'max',
                onUpdate: (self) => {
                    header?.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 240);
                    gsap.set(bar, { scaleX: self.progress });
                },
            });

            // ADN: sección fijada. El scroll (0…1) construye la hélice y recorre los 12 pasos:
            // el paso actual se pinta de blanco, los recorridos quedan nítidos y los pendientes atenuados.
            const setProgress = (p: number) => {
                const total = ADN_STEPS.length;
                const active = Math.min(total - 1, Math.floor(p * total));
                const capitulo = ADN_STEPS[active].capitulo;
                helixState.current.build = ADN_START + (1 - ADN_START) * p;
                helixState.current.active = active;
                adnItems.current.forEach((li, i) => {
                    li?.classList.toggle('is-built', i < active);
                    li?.classList.toggle('is-active', i === active);
                });
                adnPanels.current.forEach((panel, i) => panel?.classList.toggle('is-current', i === capitulo));
                root.querySelector('.adn-scroll')?.classList.toggle('is-hidden', p > 0.02);
                adnTabs.current.forEach((tab, i) => {
                    tab?.classList.toggle('is-current', i === capitulo);
                    tab?.classList.toggle('is-done', i < capitulo);
                });
                if (readoutRef.current) {
                    const pct = Math.round(helixState.current.build * 100);
                    readoutRef.current.textContent = `${String(active + 1).padStart(2, '0')} / ${total} · ${pct >= 100 ? 'ADN completo' : `Construyendo ADN ${pct} %`}`;
                }
            };
            setProgress(0);

            mm.add(
                { motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' },
                (c) => {
                    const { reduce } = c.conditions as { reduce: boolean };

                    if (reduce) {
                        // Sin animación: todos los capítulos visibles, uno debajo del otro.
                        root.querySelector('.adn-section')?.classList.add('is-static');
                        setProgress(1);
                        return;
                    }

                    ScrollTrigger.create({
                        trigger: '.adn-pin',
                        start: 'top top',
                        end: '+=520%', // 12 pasos: ~0,45 de pantalla por paso
                        pin: true,
                        // Sin anticipatePin: con el scroll suave de Lenis fijaba la sección antes de tiempo,
                        // la soltaba y la volvía a fijar (~65 ms), y la hélice "desaparecía" un instante.
                        refreshPriority: 1,
                        onUpdate: (self) => setProgress(gsap.utils.clamp(0, 1, (self.progress - 0.02) / 0.94)),
                    });

                    // Presentación (titular + manifiesto): entra al llegar, la luna gira con el scroll
                    // y las palabras del manifiesto se encienden.
                    gsap.from('.cx-hero h1 .mask > span', { yPercent: 115, duration: 1.3, stagger: 0.09, ease: 'expo.out', scrollTrigger: { trigger: '.cx-hero', start: 'top 70%' } });
                    gsap.from('.cx-hero-moon', { scale: 0.6, rotate: -120, opacity: 0, duration: 2, ease: 'expo.out', scrollTrigger: { trigger: '.cx-hero', start: 'top 70%' } });
                    // Giro con el scroll a la misma intensidad que tenía como portada (~50° por pantalla),
                    // con algo de inercia (scrub: 1.2) para que se sienta suave.
                    gsap.to('.cx-hero-moon img', {
                        rotate: () => 50 * ((document.querySelector('.cx-hero') as HTMLElement).offsetHeight / innerHeight + 1),
                        yPercent: 25, ease: 'none',
                        scrollTrigger: { trigger: '.cx-hero', start: 'top bottom', end: 'bottom top', scrub: 1.2, invalidateOnRefresh: true },
                    });
                    gsap.to('.cx-hero-manifesto .w', {
                        opacity: 1, stagger: 0.1, ease: 'none',
                        scrollTrigger: { trigger: '.cx-hero-manifesto', start: 'top 85%', end: 'bottom 50%', scrub: true },
                    });
                    gsap.from('.cx-hero-foot > *', { y: 24, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.cx-hero-foot', start: 'top 92%' } });
                    gsap.from('.cx-steps > div', { y: 30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.cx-steps', start: 'top 88%' } });

                    // Catálogo y footer.
                    gsap.from('.cx-apps-head .mask > span', { yPercent: 110, duration: 1.2, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.cx-apps', start: 'top 75%' } });
                    gsap.from('.cx-footer-word span', { yPercent: 100, duration: 1.4, stagger: 0.05, ease: 'expo.out', scrollTrigger: { trigger: '.cx-footer-word', start: 'top 95%' } });
                    gsap.from('.cx-footer-cta h3 .mask > span', { yPercent: 110, duration: 1.2, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.cx-footer', start: 'top 75%' } });
                },
            );
        }, root);

        return () => { mm.revert(); ctx.revert(); };
    }, []);

    // ---------- Tarjetas del catálogo: revelado por bloque (como mubien.com) ----------
    // Un bloque claro crece con resorte desde el centro, se desvanece y deja ver la
    // tarjeta, cuyo contenido se asienta; luego suben nombre y ruta, escalonados.
    useIsoLayoutEffect(() => {
        if (loading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!rootRef.current?.querySelector('.ap-card')) return; // sin apps asignadas: nada que animar
        const ctx = gsap.context(() => {
            gsap.set('.ap-rvb', { scale: 0, opacity: 1 });
            gsap.set('.ap-media-inner', { opacity: 0, scale: 1.18 });
            gsap.set('.ap-meta > *', { opacity: 0, y: 10 });
            ScrollTrigger.batch('.ap-card', {
                start: 'top 92%',
                once: true,
                onEnter: (batch) => {
                    batch.forEach((card, i) => {
                        const q = gsap.utils.selector(card);
                        gsap.timeline({ delay: i * 0.09 })
                            .to(q('.ap-rvb'), { scale: 1, duration: 0.85, ease: 'elastic.out(1, 0.8)' })
                            .set(q('.ap-media-inner'), { opacity: 1 }, '-=0.15')
                            .to(q('.ap-rvb'), { opacity: 0, duration: 0.35, ease: 'power2.out' }, '<')
                            .to(q('.ap-media-inner'), { scale: 1, duration: 1.4, ease: 'expo.out', clearProps: 'transform' }, '<')
                            .to(q('.ap-meta > *'), { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'expo.out' }, '<0.1');
                    });
                },
            });
        }, rootRef);
        ScrollTrigger.refresh();
        return () => ctx.revert();
    }, [loading, filtered]);

    // ---------- Barra índice: resalta el área visible y la mantiene a la vista ----------
    useIsoLayoutEffect(() => {
        if (loading) return;
        const bar = rootRef.current?.querySelector<HTMLElement>('.ax-index-track');
        const ctx = gsap.context(() => {
            gsap.utils.toArray<HTMLElement>('.ax-area').forEach((section) => {
                ScrollTrigger.create({
                    trigger: section,
                    start: 'top 45%',
                    end: 'bottom 45%',
                    onToggle: (self) => {
                        const chip = bar?.querySelector<HTMLElement>(`[data-area="${section.id}"]`);
                        chip?.classList.toggle('is-active', self.isActive);
                        if (self.isActive && bar && chip) {
                            bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
                        }
                    },
                });
            });
        }, rootRef);
        return () => ctx.revert();
    }, [loading, groups]);

    // ---------- Cursor y botones magnéticos ----------
    useEffect(() => {
        if (window.matchMedia('(pointer: coarse)').matches) return;
        const root = rootRef.current!;
        const ring = root.querySelector<HTMLElement>('.cx-cursor')!;
        const dot = root.querySelector<HTMLElement>('.cx-cursor-dot')!;
        const ringX = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
        const ringY = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
        const dotX = gsap.quickTo(dot, 'x', { duration: 0.08 });
        const dotY = gsap.quickTo(dot, 'y', { duration: 0.08 });

        const move = (e: PointerEvent) => {
            ringX(e.clientX); ringY(e.clientY); dotX(e.clientX); dotY(e.clientY);
        };
        const over = (e: PointerEvent) => {
            ring.classList.toggle('is-hover', !!(e.target as HTMLElement).closest('a, button, input'));
        };

        const magnets = root.querySelectorAll<HTMLElement>('.cx-magnetic');
        const magnetMove = (e: PointerEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.6, ease: 'power3' });
        };
        const magnetLeave = (e: PointerEvent) => gsap.to(e.currentTarget, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
        magnets.forEach((m) => { m.addEventListener('pointermove', magnetMove); m.addEventListener('pointerleave', magnetLeave); });

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerover', over);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerover', over);
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
        if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.6, offset });
        else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
    };

    const marqueeNames = apps.length ? apps.map((a) => displayName(a.nombre_aplicacion)) : ['Calidad', 'Seguridad', 'Producción', 'Servicio'];

    return (
        <div className="cx" ref={rootRef}>
            {showLoader && (
                <div className="cx-loader" aria-hidden="true">
                    <div className="cx-loader-inner">
                        <img className="cx-loader-logo" src={asset('/img/Chide.svg')} alt="Chaide" />
                        <div className="cx-loader-bar"><span /></div>
                        <div className="cx-loader-meta"><span>Preparando tu espacio</span><span>TI</span></div>
                    </div>
                    <div className="cx-loader-count">000</div>
                </div>
            )}

            <div className="cx-cursor" />
            <div className="cx-cursor-dot" />
            <div className="cx-progress" />
            <button className="cx-goapps" onClick={() => scrollTo('#aplicaciones')}>
                Ir a Aplicaciones <ArrowDown size={16} />
            </button>

            {/* Logo fijo en la esquina superior izquierda, siempre visible */}
            <button className="cx-logo" onClick={() => scrollTo('#adn')} aria-label="Chaide — ir al inicio">
                <img src={asset('/img/logo_chaide.svg')} alt="Chaide" />
            </button>

            <header className="cx-header">
                <nav className="cx-nav">
                    <button onClick={() => scrollTo('#adn')}>Nuestro ADN</button>
                    <button onClick={() => scrollTo('#aplicaciones')}>Aplicaciones</button>
                    <button onClick={() => scrollTo('#contacto')}>Contacto</button>
                </nav>
                <span className="cx-clock"><Clock size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: '-1px' }} />Quito {time}</span>
            </header>

            <main>
                {/* ---------- ADN Chaide ---------- */}
                <section className="adn-section" id="adn" data-theme="blue">
                    <div className="adn-pin">
                        <div className="adn-copy">
                            <span className="eyebrow">Quiénes somos</span>
                            <h2 className="adn-head">
                                <span className="mask"><span>El ADN</span></span>
                                <span className="mask"><span className="serif">de Chaide.</span></span>
                            </h2>
                            <ol className="adn-chapters" aria-label="Capítulos del ADN">
                                {ADN_CAPITULOS.map((c, i) => (
                                    <li key={c.key} ref={(el) => { adnTabs.current[i] = el; }}>
                                        <span>{String(i + 1).padStart(2, '0')}</span>{c.nombre}
                                    </li>
                                ))}
                            </ol>
                            <div className="adn-panels">
                                {ADN_CAPITULOS.map((c, ci) => (
                                    <div key={c.key} className={`adn-panel adn-panel--${c.key}`} ref={(el) => { adnPanels.current[ci] = el; }}>
                                        <h3 className="adn-panel-title">{c.titulo} <span className="serif">{c.acento}</span></h3>
                                        {c.intro && <p className="adn-intro">{c.intro}</p>}
                                        <ol className="adn-steps">
                                            {ADN_STEPS.map((step, i) => {
                                                if (step.capitulo !== ci) return null;
                                                const Icono = step.icono ? (LucideIcons as Record<string, any>)[step.icono] : null;
                                                return (
                                                    <li key={i} className="adn-step" ref={(el) => { adnItems.current[i] = el; }}>
                                                        {Icono && <span className="adn-step-icon" aria-hidden="true"><Icono size={18} /></span>}
                                                        <span className="adn-step-body">
                                                            {step.etiqueta && <span className="adn-step-label">{step.etiqueta}</span>}
                                                            <span className="adn-step-title">{step.titulo}</span>
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
                        </div>
                        <div className="adn-stage">
                            <AdnHelix state={helixState} src={asset('/img/Chide.svg')} groups={ADN_STEPS.length} />
                        </div>
                        <div className="cx-scroll adn-scroll" aria-hidden="true"><i /> Desplázate para explorar</div>
                        <span className="adn-readout" ref={readoutRef} aria-live="polite">01 / 12 · Construyendo ADN 14 %</span>
                    </div>
                </section>

                {/* ---------- Presentación: titular + manifiesto ---------- */}
                <section className="cx-hero" id="presentacion" data-theme="white">
                    <div className="cx-hero-glow" />
                    <div className="cx-hero-moon"><img src={asset('/img/chaide-luna.svg')} alt="" /></div>
                    <span className="eyebrow">Nuestra plataforma</span>
                    <h1>
                        <span className="mask"><span>Todas las apps</span></span>
                        <span className="mask"><span>de Chaide, en</span></span>
                        <span className="mask"><span className="serif">un solo lugar.</span></span>
                    </h1>
                    <p className="cx-hero-manifesto">{MANIFESTO.split(' ').map((w, i) => <span key={i} className="w">{w} </span>)}</p>
                    <div className="cx-steps">
                        <div>01 / 04<b>Encuentra</b>Busca entre todos tus módulos.</div>
                        <div>02 / 04<b>Explora</b>Conoce qué está disponible y qué viene.</div>
                        <div>03 / 04<b>Ingresa</b>Accede con tu usuario corporativo.</div>
                        <div>04 / 04<b>Trabaja</b>Calidad, seguridad y producción conectadas.</div>
                    </div>
                    <div className="cx-hero-foot">
                        <p>
                            Catálogo de aplicaciones corporativas.{' '}
                            {loading ? 'Cargando tus módulos…' : `Tienes ${apps.length} ${apps.length === 1 ? 'módulo asignado' : 'módulos asignados'}, ${liveCount} disponibles hoy.`}{' '}
                            Sueña con un mundo mejor.
                        </p>
                        <button className="cx-btn solid cx-magnetic" onClick={() => scrollTo('#aplicaciones')}>
                            Explorar aplicaciones <ArrowUpRight size={16} />
                        </button>
                    </div>
                </section>

                {/* ---------- Catálogo ---------- */}
                <section className="cx-apps" id="aplicaciones" data-theme="white">
                    <div className="cx-apps-head">
                        <div>
                            <span className="eyebrow">Índice por área</span>
                            <h2>
                                <span className="mask"><span>Aplicaciones<sup>{loading ? '' : filtered.length}</sup></span></span>
                            </h2>
                        </div>
                        <div className="cx-tools">
                            <label className="cx-search">
                                <Search size={16} />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aplicación o área…" aria-label="Buscar aplicación o área" />
                            </label>
                            <button className="cx-chip" aria-pressed={onlyLive} onClick={() => setOnlyLive((v) => !v)}>
                                Solo disponibles
                            </button>
                        </div>
                    </div>

                    {error && <div className="cx-error">{error}</div>}

                    {loading ? (
                        <div className="ap-grid">
                            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ap-skel" />)}
                        </div>
                    ) : (
                        <>
                            {/* Índice alfabético por área: fijo arriba mientras se recorre el catálogo */}
                            <nav className="ax-index" aria-label="Índice por área">
                                <div className="ax-index-track">
                                    {groups.map((g) => (
                                        <button key={g.key} data-area={g.key} onClick={() => scrollTo(`#${g.key}`, -150)}>
                                            {g.nombre}<small>{g.apps.length}</small>
                                        </button>
                                    ))}
                                </div>
                            </nav>

                            {groups.map((g) => (
                                <section key={g.key} id={g.key} className={`ax-area${g.showLetter ? ' has-letter' : ''}`} aria-labelledby={`${g.key}-titulo`}>
                                    <div className="ax-letter" aria-hidden="true">{g.showLetter ? g.letra : ''}</div>
                                    <div className="ax-body">
                                        <header className="ax-head">
                                            <h3 id={`${g.key}-titulo`}>{g.nombre}</h3>
                                            <span>{g.apps.length} {g.apps.length === 1 ? 'aplicación' : 'aplicaciones'}</span>
                                        </header>
                                        <div className="ap-grid">
                                            {g.apps.map((app, i) => <AppCard key={app.codigo_aplicacion ?? app.nombre_aplicacion} app={app} index={i} />)}
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </>
                    )}

                    {!loading && !error && filtered.length === 0 && (
                        <p className="cx-empty">
                            {apps.length === 0
                                ? 'Aún no tienes aplicaciones asignadas. Solicítalas a Tecnología.'
                                : `No encontramos aplicaciones para “${query}”.`}
                        </p>
                    )}
                </section>

                {/* ---------- Marquee ---------- */}
                <section className="cx-marquee" data-theme="blue" aria-hidden="true">
                    <div className="cx-marquee-track">
                        {[...marqueeNames, ...marqueeNames].map((n, i) => <span key={i}>{n}</span>)}
                    </div>
                </section>
            </main>

            {/* ---------- Footer ---------- */}
            <footer className="cx-footer" id="contacto" data-theme="blue">
                <div className="cx-footer-cta">
                    <span className="eyebrow">¿Necesitas acceso?</span>
                    <h3>
                        <span className="mask"><span>Solicítalo a</span></span>
                        <span className="mask"><span className="serif">Tecnología.</span></span>
                    </h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="cx-btn cx-magnetic" onClick={() => scrollTo('#adn')}>Volver arriba ↑</button>
                        <a className="cx-btn cx-magnetic" href="https://www.chaide.com/" target="_blank" rel="noopener noreferrer">chaide.com <ArrowUpRight size={16} /></a>
                    </div>
                </div>
                <p className="cx-footer-word" aria-label="Chaide">
                    {'CHAIDE'.split('').map((c, i) => <span key={i}>{c}</span>)}
                </p>
                <div className="cx-footer-bar">
                    <span>© {new Date().getFullYear()} Chaide · Sueña con un mundo mejor</span>
                    <span>Quito · {time}</span>
                    <span>Tecnologías de la Información</span>
                </div>
            </footer>
        </div>
    );
}
