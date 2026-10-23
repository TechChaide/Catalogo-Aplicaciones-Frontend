'use client';

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { serviciosService } from '@/services/seguridades/servicios.service';
import type { User } from '@/types/interfaces';

// Tarjeta flotante (esquina inferior derecha) con la información del usuario y el botón de salir.
// Misma lógica que el panel de usuario del antiguo menú lateral (dashboard/layout.tsx).
export function UserCard() {
    const [userInfo, setUserInfo] = useState<User | any>(null);
    const [fullName, setFullName] = useState<string>('');

    useEffect(() => {
        const loadUserData = async () => {
            try {
                // Cargar userInfo desde localStorage
                let userData: any = null;
                const userStr = localStorage.getItem('user');
                if (userStr) {
                    try { userData = JSON.parse(userStr); } catch { /* ignore */ }
                }

                // Si no hay objeto user, intentar decodificar el JWT como fallback
                if (!userData) {
                    const rawToken = localStorage.getItem('token');
                    const parts = rawToken?.split('.') ?? [];
                    if (parts.length >= 2) {
                        try {
                            userData = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                        } catch { /* ignore decode errors */ }
                    }
                }

                if (!userData) return;
                setUserInfo(userData);

                // Nombre completo desde serviciosService, según el tipo de usuario
                if (userData.condicion === 'Usuario Interno' && userData.codigo_empleado) {
                    try {
                        const response = await serviciosService.getInformacionUsuarioByCodigoEmpleado(userData.codigo_empleado);
                        if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
                            setFullName(response.data[0].NOMBRE || '');
                        }
                    } catch (err) {
                        console.warn('No se pudo cargar info de usuario interno:', err);
                    }
                } else if (userData.condicion === 'Usuario Externo' && userData.id_usuario) {
                    try {
                        const response = await serviciosService.getInformacionUsuarioExternoByIdentificacion(userData.id_usuario);
                        if (response?.data && typeof response.data === 'object') {
                            setFullName((response.data as any).nombres || '');
                        }
                    } catch (err) {
                        console.warn('No se pudo cargar info de usuario externo:', err);
                    }
                }
            } catch (error) {
                console.error('Error cargando datos del usuario:', error);
            }
        };

        loadUserData();
    }, []);

    const displayName: string = fullName || userInfo?.name || userInfo?.usuario || userInfo?.username || userInfo?.correo_usuario || userInfo?.email || userInfo?.sub || 'Usuario';
    const codigoEmpleado = userInfo?.codigo_empleado || userInfo?.employee_code || userInfo?.codigo || null;
    const avatarText = (displayName || '?').trim().charAt(0).toUpperCase();

    const handleLogout = () => {
        try {
            localStorage.clear(); // Eliminar todas las variables de sesión
        } catch (error) {
            console.error('Error al limpiar localStorage:', error);
        }
        const basePath = ((window as any).__NEXT_DATA__?.basePath || process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
        window.location.href = basePath ? `${basePath}/` : '/';
    };

    return (
        <aside className="uc" aria-label="Sesión del usuario">
            <span className="uc-avatar" aria-hidden="true">{avatarText}</span>
            <div className="uc-info">
                <p className="uc-name" title={displayName}>{displayName}</p>
                {codigoEmpleado && <p className="uc-meta" title={codigoEmpleado}>{codigoEmpleado}</p>}
                {userInfo?.condicion && <p className="uc-meta" title={userInfo.condicion}>{userInfo.condicion}</p>}
                {userInfo?.email && <p className="uc-meta uc-mail" title={userInfo.email}>{userInfo.email}</p>}
            </div>
            <button className="uc-logout" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut size={18} />
            </button>
        </aside>
    );
}
