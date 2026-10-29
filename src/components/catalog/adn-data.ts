// ADN de Chaide: esencia (propósito, misión, visión), valores y el ADN de la operación.
// Cada paso ocupa un tramo de la hélice y se pinta de blanco cuando el scroll llega a él.

export interface AdnCapitulo {
    key: string;
    nombre: string; // etiqueta corta del indicador de capítulos
    titulo: string;
    acento?: string; // parte del título en cursiva
    intro?: string;
}

export interface AdnStep {
    capitulo: number; // índice en ADN_CAPITULOS
    etiqueta?: string;
    titulo: string;
    destacado?: string;
    detalle?: string;
    icono?: string; // nombre de ícono de lucide-react
}

export const ADN_CAPITULOS: AdnCapitulo[] = [
    { key: 'esencia', nombre: 'Esencia', titulo: 'Nuestra', acento: 'Esencia' },
    { key: 'valores', nombre: 'Valores', titulo: 'Nuestros', acento: 'Valores' },
    { key: 'operacion', nombre: 'Pilares', titulo: 'Nuestros', acento: 'Pilares' },
];

export const ADN_STEPS: AdnStep[] = [
    { capitulo: 0, etiqueta: 'Misión', titulo: 'Superamos las expectativas de nuestros clientes con productos y servicios innovadores y de alta calidad, aplicando principios de sostenibilidad.' },
    { capitulo: 0, etiqueta: 'Visión', titulo: 'Generar bienestar a las personas y al planeta.' },
    { capitulo: 0, etiqueta: 'Propósito', titulo: 'Construimos un mundo mejor.' },

    { capitulo: 1, titulo: 'Excelencia' },
    { capitulo: 1, titulo: 'Integridad' },
    { capitulo: 1, titulo: 'Trabajo en equipo' },
    { capitulo: 1, titulo: 'Compromiso' },

    { capitulo: 2, icono: 'Gem', titulo: 'Calidad' },
    { capitulo: 2, icono: 'HeartHandshake', titulo: 'Experiencia del cliente' },
    { capitulo: 2, icono: 'Sprout', titulo: 'Sostenibilidad' },
    { capitulo: 2, icono: 'Sparkles', titulo: 'Innovación' },
];
