'use client';

import { useAuth } from '@/hooks/use-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen" style={{ background: '#07080b', color: '#eef1f7' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#5aa2ff' }}></div>
          <p style={{ color: 'rgba(238,241,247,0.6)', letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 11 }}>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen" style={{ background: '#07080b', color: '#eef1f7' }}>
        <div className="flex flex-col items-center gap-4">
          <p style={{ color: '#ff8a8a' }}>Acceso no autorizado</p>
          <p style={{ color: 'rgba(238,241,247,0.6)' }}>Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}