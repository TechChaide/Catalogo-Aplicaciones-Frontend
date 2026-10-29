'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Search } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export interface CatalogApp {
    codigo_aplicacion?: string;
    nombre_aplicacion: string;
    url: string | null;
    icono: string | null;
    area?: { codigo_area: number; nombre_area: string } | null;
}

interface AppTile {
    key: string;
    name: string;
    icono: string | null;
    url: string | null;
    live: boolean;
}

interface AreaRow {
    nombre: string;
    apps: AppTile[];
}

const SIN_AREA = 'Otras';
const COLS = 12;
const MIN_SPAN = 3;
const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
const displayName = (n: string) => n.replace(/^M\.\s*/i, '').trim();

function groupByArea(list: CatalogApp[]): AreaRow[] {
    const map = new Map<string, AreaRow>();
    for (const app of list) {
        const nombre = app.area?.nombre_area?.trim() || SIN_AREA;
        if (!map.has(nombre)) map.set(nombre, { nombre, apps: [] });
        map.get(nombre)!.apps.push({
            key: app.codigo_aplicacion ?? app.nombre_aplicacion,
            name: displayName(app.nombre_aplicacion),
            icono: app.icono,
            url: app.url,
            live: !!app.url,
        });
    }
    return [...map.values()]
        .map((r) => ({
            ...r,
            apps: r.apps.sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name, 'es')),
        }))
        .sort((a, b) => {
            if (a.nombre === SIN_AREA) return 1;
            if (b.nombre === SIN_AREA) return -1;
            return b.apps.length - a.apps.length || a.nombre.localeCompare(b.nombre, 'es');
        });
}

function bentoSpans(counts: number[]): number[] {
    const spans: number[] = [];
    let row: number[] = [];
    let used = 0;
    const close = () => {
        for (let k = 0; used < COLS && row.length; k++, used++) spans[row[k % row.length]]++;
        row = [];
        used = 0;
    };
    counts.forEach((c, i) => {
        let s = c >= 5 ? 6 : c >= 2 ? 4 : 3;
        if (used + s > COLS) {
            if (COLS - used >= MIN_SPAN) s = COLS - used;
            else close();
        }
        spans[i] = s;
        row.push(i);
        used += s;
        if (used === COLS) close();
    });
    close();
    return spans;
}

function Glyph({ app }: { app: AppTile }) {
    const icono = (app.icono ?? '').trim().replace(/^google:/i, '');
    if (/^https?:\/\//i.test(icono)) return <img src={icono} alt="" />;
    const Lucide = icono ? (LucideIcons as unknown as Record<string, ComponentType<{ size?: number }>>)[icono] : null;
    if (Lucide) return <Lucide size={18} />;
    return <span className="material-symbols-rounded">{/^[a-z][a-z0-9_]*$/.test(icono) ? icono : 'auto_awesome'}</span>;
}

export function AppsByArea({
    apps,
    loading,
    error,
}: {
    apps: CatalogApp[];
    loading: boolean;
    error: string | null;
}) {
    const ref = useRef<HTMLElement>(null);
    const [query, setQuery] = useState('');
    const [onlyLive, setOnlyLive] = useState(false);
    const [year, setYear] = useState<number | null>(null);

    useEffect(() => {
        setYear(new Date().getFullYear());
    }, []);

    const filtered = useMemo(() => {
        const q = fold(query.trim().toLocaleLowerCase('es'));
        return apps.filter((a) => {
            if (onlyLive && !a.url) return false;
            if (!q) return true;
            const texto = `${displayName(a.nombre_aplicacion)} ${a.area?.nombre_area ?? ''}`;
            return fold(texto.toLocaleLowerCase('es')).includes(q);
        });
    }, [apps, query, onlyLive]);

    const rows = useMemo(() => (loading ? null : groupByArea(filtered)), [filtered, loading]);

    const stats = useMemo(() => {
        if (!rows) return null;
        const all = rows.flatMap((r) => r.apps);
        return {
            spans: bentoSpans(rows.map((r) => r.apps.length)),
            total: all.length,
            areas: rows.filter((r) => r.nombre !== SIN_AREA).length,
            live: all.filter((a) => a.live).length,
        };
    }, [rows]);

    useEffect(() => {
        const root = ref.current;
        if (!rows || !root) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const ctx = gsap.context(() => {
            if (reduce) return;
            ScrollTrigger.batch('.cx-bento-card', {
                start: 'top 90%',
                onEnter: (cards) => {
                    gsap.fromTo(
                        cards,
                        { clipPath: 'inset(100% 0% 0% 0% round 24px)', y: 40 },
                        { clipPath: 'inset(0% 0% 0% 0% round 24px)', y: 0, duration: 1.3, stagger: 0.08, ease: 'expo.out', clearProps: 'clipPath' },
                    );
                    cards.forEach((card, i) => {
                        gsap.fromTo(
                            card.querySelectorAll('.cx-tile'),
                            { opacity: 0, y: 14, scale: 0.94 },
                            { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.05, ease: 'expo.out', delay: 0.35 + i * 0.08 },
                        );
                        gsap.fromTo(
                            card.querySelector('.cx-bento-share i'),
                            { scaleX: 0 },
                            { scaleX: 1, duration: 1.6, ease: 'expo.out', delay: 0.5 + i * 0.08 },
                        );
                    });
                },
            });
            gsap.utils.toArray<HTMLElement>('[data-num]').forEach((el) => {
                const target = Number(el.dataset.num);
                const obj = { v: 0 };
                el.textContent = '0';
                gsap.to(obj, {
                    v: target,
                    duration: 2,
                    ease: 'expo.out',
                    scrollTrigger: { trigger: el, start: 'top 90%' },
                    onUpdate: () => {
                        el.textContent = String(Math.round(obj.v));
                    },
                });
            });
        }, root);
        ScrollTrigger.refresh();
        return () => ctx.revert();
    }, [rows]);

    const onGlow = (e: PointerEvent<HTMLElement>) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('.cx-glow');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };

    return (
        <section
            ref={ref}
            className="cx-apps"
            id="aplicaciones"
            data-shape="moon"
            data-x="0.26"
            data-y="0.02"
            data-scale="0.66"
            data-alpha="1"
            onPointerMove={onGlow}
        >
            <div className="cx-apps-head">
                <div>
                    <span className="cx-kicker">
                        <b>TI</b>{' '}
                        <span data-scramble-hover data-text={year ? `Catálogo · ${year}` : 'Catálogo'}>
                            Catálogo{year ? ` · ${year}` : ''}
                        </span>
                    </span>
                    <h2 className="cx-apps-title">
                        <span data-scramble-hover data-text="Tus aplicaciones">Tus aplicaciones</span>{' '}
                        <span className="serif" data-scramble-hover data-text="por área.">por área.</span>
                    </h2>
                    <p className="cx-lead">
                        Cada área de Chaide opera con sus propios módulos. Aquí están los que tienes asignados dentro del catálogo corporativo.
                    </p>
                </div>
                {stats && (
                    <dl className="cx-apps-stats">
                        <div>
                            <dt className="cx-label" data-scramble-hover data-text="Aplicaciones">Aplicaciones</dt>
                            <dd data-num={stats.total}>{stats.total}</dd>
                        </div>
                        <div>
                            <dt className="cx-label" data-scramble-hover data-text="Áreas impactadas">Áreas impactadas</dt>
                            <dd data-num={stats.areas}>{stats.areas}</dd>
                        </div>
                    </dl>
                )}
            </div>

            <div className="cx-tools">
                <label className="cx-search">
                    <Search size={16} />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar aplicación o área…"
                        aria-label="Buscar aplicación o área"
                    />
                </label>
                <button
                    className="cx-chip"
                    aria-pressed={onlyLive}
                    data-scramble-hover
                    data-text="Solo disponibles"
                    onClick={() => setOnlyLive((v) => !v)}
                >
                    Solo disponibles
                </button>
            </div>

            {error && <p className="cx-apps-msg is-error">{error}</p>}
            {loading && (
                <div className="cx-bento is-loading" aria-busy="true">
                    {[6, 6, 4, 4, 4].map((s, i) => (
                        <div key={i} className="cx-bento-skeleton" style={{ gridColumn: `span ${s}` }} />
                    ))}
                </div>
            )}

            {rows && rows.length > 0 && (
                <>
                    <div className="cx-bento">
                        {rows.map((r, i) => {
                            const span = stats!.spans[i];
                            const share = Math.round((r.apps.length / stats!.total) * 100);
                            return (
                                <article
                                    key={r.nombre}
                                    className={`cx-bento-card cx-glow${span >= 6 ? ' is-wide' : ''}`}
                                    style={{ gridColumn: `span ${span}` }}
                                >
                                    <header>
                                        <h3 data-scramble-hover data-text={r.nombre}>{r.nombre}</h3>
                                        <span className="cx-bento-count">{String(r.apps.length).padStart(2, '0')}</span>
                                    </header>
                                    <ul>
                                        {r.apps.map((a) => {
                                            const body = (
                                                <>
                                                    <span className="cx-tile-icon">
                                                        <Glyph app={a} />
                                                    </span>
                                                    <span className="cx-tile-name">{a.name}</span>
                                                    <span className="cx-tile-dot" aria-label={a.live ? 'En producción' : 'Próximamente'} />
                                                </>
                                            );
                                            return (
                                                <li key={a.key}>
                                                    {a.url ? (
                                                        <a
                                                            className="cx-tile is-live"
                                                            href={a.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            aria-label={`Abrir ${a.name} en una nueva pestaña`}
                                                        >
                                                            {body}
                                                        </a>
                                                    ) : (
                                                        <div className="cx-tile">{body}</div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    <footer className="cx-bento-share">
                                        <span>
                                            <i style={{ width: `${share}%` }} />
                                        </span>
                                        <small>{share}% del portafolio</small>
                                    </footer>
                                </article>
                            );
                        })}
                    </div>
                    <div className="cx-apps-legend">
                        <span>
                            <i className="is-live" /> En producción
                        </span>
                        <span>
                            <i /> Próximamente
                        </span>
                    </div>
                </>
            )}

            {!loading && !error && filtered.length === 0 && (
                <p className="cx-apps-msg">
                    {apps.length === 0
                        ? 'Aún no tienes aplicaciones asignadas. Solicítalas a Tecnología.'
                        : `No encontramos aplicaciones para “${query}”.`}
                </p>
            )}
        </section>
    );
}
