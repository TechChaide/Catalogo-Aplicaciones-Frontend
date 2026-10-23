// Permisos de aplicaciones del usuario (contexto seguridades):
// Usuario → perfiles (tipo_usuario) → tipo_usuario_aplicacion → codigo_aplicacion.

import { tipoUsuarioAplicacionService } from '@/services/seguridades/tipoUsuarioAplicacion.service';

const KEY_APLICACIONES = 'aplicacionesUsuario';

export interface AccesosUsuario {
    /** Perfiles del usuario agrupados por código de aplicación (formato que espera useAuth). */
    appsByProfile: Record<string, any[]>;
    /** Códigos de aplicación a los que el usuario tiene acceso activo. */
    aplicaciones: string[];
}

const codigoPerfil = (perfil: any) =>
    perfil?.codigo_tipo_usuario || perfil?.codigoTipoUsuario || perfil?.tipo_usuario?.codigo_tipo_usuario || perfil?.codigo || perfil?.id;

/**
 * Consulta, por cada perfil, las aplicaciones asignadas y devuelve solo las activas.
 * Un perfil que falla no interrumpe a los demás.
 */
export async function resolverAccesos(perfiles: unknown): Promise<AccesosUsuario> {
    const lista: any[] = Array.isArray(perfiles) ? perfiles : [];
    const appsByProfile: Record<string, any[]> = {};

    await Promise.all(lista.map(async (perfil) => {
        const codigo = codigoPerfil(perfil);
        if (!codigo) return;
        try {
            const resp = await tipoUsuarioAplicacionService.getByCodigoTipoUsuario(String(codigo));
            const items: any[] = Array.isArray(resp?.data) ? resp.data : [];
            for (const item of items) {
                // Una asignación desactivada no da acceso.
                if (item?.estado && item.estado !== 'A') continue;
                const codigoApp = item?.codigo_aplicacion || item?.aplicacion?.codigo_aplicacion;
                if (!codigoApp) continue;
                if (!appsByProfile[codigoApp]) appsByProfile[codigoApp] = [];
                if (!appsByProfile[codigoApp].includes(perfil)) appsByProfile[codigoApp].push(perfil);
            }
        } catch (err) {
            console.error(`Error consultando aplicaciones del perfil ${codigo}:`, err);
        }
    }));

    return { appsByProfile, aplicaciones: Object.keys(appsByProfile) };
}

export function guardarAccesos({ appsByProfile, aplicaciones }: AccesosUsuario) {
    localStorage.setItem('appsByProfile', JSON.stringify(appsByProfile));
    localStorage.setItem(KEY_APLICACIONES, JSON.stringify(aplicaciones));
}

/** Aplicaciones guardadas en el login (respaldo si no se pueden recalcular). */
export function leerAplicacionesGuardadas(): string[] | null {
    try {
        const raw = localStorage.getItem(KEY_APLICACIONES);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}
