'use client';

import { Camera, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { scramble, subtleScramble } from '@/components/catalog/scramble';
import { authService } from '@/services/seguridades/auth.service';
import { guardarAccesos, resolverAccesos } from '@/lib/permisos';
import { environment } from '@/environments/environments.prod';
import { toast } from '@/hooks/use-toast';
import { CameraModal } from '@/components/camera-modal';
import { Atmosphere } from '@/components/catalog/atmosphere';
import { ParticleField } from '@/components/catalog/particle-field';
import '@/components/catalog/catalog.css';

const initialState = {
  success: false,
  message: '',
};

const AUTH_LAYOUT = { y: -0.06, scale: 0.9, alpha: 0.85 } as const;

export default function LoginPage() {
    const fieldRef = useRef<ParticleField | null>(null);
    const [state, setState] = useState(initialState);
    const [pending, setPending] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [usuario, setUsuario] = useState('');
    const [loginType, setLoginType] = useState<'password' | 'facial' | null>(null);
    const [showCameraModal, setShowCameraModal] = useState(false);

    // Expresiones regulares para detectar tipo de login
    // nombre.apellido con opcionalmente números al final (requerir al menos un nombre antes del punto)
    const patternPassword = /^[a-z]+(?:\.[a-z]+)\d*$/i;
    // 1 a 4 números -> validación facial (documento corto)
    const patternFacial = /^\d{1,4}$/;
    // 5 o más números -> contraseña basada en documento largo
    const patternPasswordNumbers = /^\d{5,}$/;

    const detectLoginType = (value: string) => {
        setUsuario(value);
        // DEBUG: ver coincidencias (remover cuando esté validado)
        // console.debug('detectLoginType', value, { password: patternPassword.test(value), passwordNumbers: patternPasswordNumbers.test(value), facial: patternFacial.test(value) });

        if (patternPassword.test(value)) {
            setLoginType('password');
        } else if (patternPasswordNumbers.test(value)) {
            // Más de 4 números → contraseña
            setLoginType('password');
        } else if (patternFacial.test(value)) {
            // 1-4 números → validación facial
            setLoginType('facial');
        } else {
            setLoginType(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        // Si es validación facial, abrir modal de cámara
        if (loginType === 'facial') {
            setShowCameraModal(true);
            return;
        }

        // Login por contraseña (default si no es facial)
        setPending(true);
        setState(initialState);
        try {
            const formData = new FormData(e.currentTarget);
            const password = formData.get('password') as string;
            
            if (!password) {
                setState({ 
                    success: false, 
                    message: 'Por favor, ingrese su contraseña.' 
                });
                setPending(false);
                return;
            }
            
            const response = await authService.loginCentral({ email: usuario, password });

            // Con httpOnly cookies, el token está en la cookie (no en el body)
            // Solo verificamos que user y perfiles existan
            const layered = (obj: any, keys: string[]): any => keys.reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
            const user     = layered(response, ['user'])     || layered(response, ['data', 'user'])     || layered(response, ['data', 'data', 'user']);
            const perfiles = layered(response, ['perfiles']) || layered(response, ['data', 'perfiles']) || layered(response, ['data', 'data', 'perfiles']);
            const message  = layered(response, ['message'])  || layered(response, ['data', 'message']);

            if (user && perfiles) {
                try {
                    // Guardar datos preliminares
                    if (user) localStorage.setItem('user', JSON.stringify(user));
                    if (perfiles) localStorage.setItem('perfiles', JSON.stringify(perfiles));

                    // Permisos: todas las aplicaciones activas de sus perfiles (no solo las de environment).
                    const accesos = await resolverAccesos(perfiles);
                    if (!accesos.aplicaciones.length) {
                        setState({ success: false, message: 'No tienes aplicaciones asignadas. Solicítalas a Tecnología.' });
                        setPending(false);
                        return;
                    }
                    guardarAccesos(accesos);

                    // Navegar al dashboard
                    const basePath = ((window as any).__NEXT_DATA__?.basePath || process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
                    window.location.href = `${basePath}/dashboard`;
                    console.log('✓ Login por contraseña exitoso');
                    console.log('Aplicaciones del usuario:', accesos.aplicaciones);
                    toast({
                        title: '¡Bienvenido!',
                        description: 'Has iniciado sesión exitosamente.',
                    });
                    return;
                } catch (validErr) {
                    setState({ success: false, message: 'Error validando acceso a la aplicación.' });
                    setPending(false);
                    return;
                }
            } else {
                // Si el backend dijo login successful pero no envió user/perfiles, lo tratamos como error de formato.
                setState({
                    success: false,
                    message: message ? `Respuesta inválida del servidor: faltan datos de usuario. (${message})` : 'Credenciales incorrectas.',
                });
            }
        } catch (error) {
            const errorMessage =
                typeof error === 'object' && error !== null && 'message' in error
                    ? (error as { message?: string }).message
                    : undefined;
            setState({ success: false, message: errorMessage || 'Error de autenticación.' });
        } finally {
            setPending(false);
        }
    };

    useEffect(() => {
        const root = document.querySelector('.cx-auth');
        if (!root) return;
        const onOver = (e: Event) => {
            const ev = e as PointerEvent;
            const t = ev.target as HTMLElement;
            const s = t.closest<HTMLElement>('[data-scramble-hover]');
            const from = (ev.relatedTarget as HTMLElement | null)?.closest?.('[data-scramble-hover]');
            if (!s || s === from) return;
            if (s.dataset.scrambleSubtle !== undefined) {
                s.querySelectorAll<HTMLElement>('[data-text]').forEach((child) => {
                    if (child.dataset.text) scramble(child, child.dataset.text, 1.25, subtleScramble);
                });
                return;
            }
            if (s.dataset.text) scramble(s, s.dataset.text, 0.6);
        };
        root.addEventListener('pointerover', onOver);
        return () => root.removeEventListener('pointerover', onOver);
    }, []);

    const hint = loginType === 'password'
        ? 'Formato de usuario detectado'
        : loginType === 'facial'
            ? 'Validación facial detectada'
            : usuario
                ? 'Formato no válido'
                : 'Código de empleado o Nombre Usuario';

    return (
        <div className="cx cx-auth">
            <Atmosphere fieldRef={fieldRef} initialShape="moon" initialLayout={AUTH_LAYOUT} />
            <section className="cx-auth-copy">
                <span className="eyebrow" data-scramble-hover data-text="Tecnología - Chaide">Tecnología - Chaide</span>
                <h1 data-scramble-hover data-scramble-subtle>
                    <span data-text="Todas las apps de Chaide, en">Todas las apps de Chaide, en</span>{' '}
                    <span className="serif" data-text="un solo lugar.">un solo lugar.</span>
                </h1>
            </section>
            <form className="cx-auth-card cx-glow" onSubmit={handleSubmit}>
                <header>
                    <img src={`${environment.basePath}/img/Chide.svg`} alt="" width={42} height={42} />
                    <h2 data-scramble-hover data-text="Inicio de sesión">Inicio de sesión</h2>
                    <p className="cx-auth-lead" data-scramble-hover data-text="Catálogo de aplicaciones">Catálogo de aplicaciones</p>
                </header>
                <div className="cx-auth-field">
                    <label htmlFor="usuario" data-scramble-hover data-text="Usuario">Usuario</label>
                    <input
                        id="usuario"
                        name="usuario"
                        value={usuario}
                        onChange={(e) => detectLoginType(e.target.value)}
                        required
                        autoComplete="username"
                    />
                    <p className={`cx-auth-hint${loginType ? ' is-ok' : usuario ? ' is-bad' : ''}`}>{hint}</p>
                </div>
                {loginType === 'password' && (
                    <div className="cx-auth-field">
                        <label htmlFor="password" data-scramble-hover data-text="Contraseña">Contraseña</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Ingrese su contraseña"
                                required
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                tabIndex={-1}
                                className="cx-auth-eye"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                )}
                {state && !state.success && state.message && (
                    <div className="cx-auth-error" role="alert">
                        <AlertTriangle size={16} />
                        <span>{state.message}</span>
                    </div>
                )}
                {loginType === 'facial' && (
                    <button type="submit" className="cx-auth-submit" disabled={pending}>
                        <Camera size={16} />
                        <span data-scramble-hover data-text={pending ? 'Validando...' : 'Validación facial'}>
                            {pending ? 'Validando...' : 'Validación facial'}
                        </span>
                    </button>
                )}
                {loginType === 'password' && (
                    <button type="submit" className="cx-auth-submit" disabled={pending}>
                        <span data-scramble-hover data-text={pending ? 'Ingresando...' : 'Ingresar'}>
                            {pending ? 'Ingresando...' : 'Ingresar'}
                        </span>
                    </button>
                )}
            </form>

                {/* Modal de Validación Facial */}
                <CameraModal
                    isOpen={showCameraModal}
                    onClose={() => setShowCameraModal(false)}
                    employee={usuario ? { CODIGO: usuario, NOMBRE: usuario } : null}
                    onValidationComplete={async (result) => {
                        if (result.status === 'approved') {
                            setShowCameraModal(false);
                            
                            // Construir contraseña como objeto JSON
                            const codigo = result.empleado?.codigo || usuario;
                            const nombre = result.empleado?.nombre || '';
                            const departamento = result.empleado?.departamento || '';
                            const centro = result.empleado?.centro || '1000';
                            
                            const passwordObj = {
                                CODIGO: codigo,
                                NOMBRE: nombre,
                                DEPARTAMENTO: departamento,
                                CENTRO: centro
                            };
                            
                            console.log('✓ Validación facial exitosa');
                            console.log('Código:', codigo);
                            console.log('Password objeto:', passwordObj);
                            
                            toast({
                                title: 'Validación exitosa',
                                description: 'Ingresando al sistema...'
                            });

                            // Hacer login con loginCentral
                            setPending(true);
                            setState(initialState);
                            try {
                                console.log('Iniciando loginCentral con código:', codigo);
                                const response = await authService.loginCentral({ 
                                    email: codigo, 
                                    password: passwordObj 
                                });
                                
                                console.log('Respuesta del loginCentral:', response);

                                const layered = (obj: any, keys: string[]): any => keys.reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
                                const user = layered(response, ['user']) || layered(response, ['data', 'user']) || layered(response, ['data', 'data', 'user']);
                                const perfiles = layered(response, ['perfiles']) || layered(response, ['data', 'perfiles']) || layered(response, ['data', 'data', 'perfiles']);

                                console.log('User encontrado:', user);
                                console.log('Perfiles encontrados:', perfiles);

                                if (user && perfiles) {
                                    if (user) localStorage.setItem('user', JSON.stringify(user));
                                    if (perfiles) localStorage.setItem('perfiles', JSON.stringify(perfiles));

                                    // Permisos: todas las aplicaciones activas de sus perfiles (no solo las de environment).
                                    const accesos = await resolverAccesos(perfiles);
                                    const aplicacionesValidas = accesos.aplicaciones;
                                    console.log('Aplicaciones del usuario:', aplicacionesValidas);

                                    if (aplicacionesValidas.length > 0) {
                                        guardarAccesos(accesos);
                                        console.log('✓ Login facial exitoso - Datos guardados en localStorage');
                                        console.log('Aplicaciones válidas:', aplicacionesValidas);
                                        console.log('User:', user);
                                        // Redirigir al dashboard tras login facial exitoso
                                        const basePath = ((window as any).__NEXT_DATA__?.basePath || process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');
                                        window.location.href = `${basePath}/dashboard`;
                                        toast({
                                            title: 'Login exitoso',
                                            description: 'Acceso al dashboard completado'
                                        });
                                    } else {
                                        setState({ success: false, message: 'No tienes aplicaciones asignadas. Solicítalas a Tecnología.' });
                                    }
                                } else {
                                    console.error('No se encontró user o perfiles');
                                    setState({ success: false, message: 'Error al procesar la validación facial. User o perfiles no encontrados.' });
                                }
                            } catch (err) {
                                console.error('Error en login facial:', err);
                                setState({ success: false, message: 'Error al completar el login facial.' });
                            } finally {
                                setPending(false);
                            }
                        } else {
                            toast({
                                title: 'Validación fallida',
                                description: result.message || result.error,
                                variant: 'destructive'
                            });
                        }
                    }}
                />
        </div>
    );
}
