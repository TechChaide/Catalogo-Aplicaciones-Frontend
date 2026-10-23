'use client';

import { AppCatalog } from '@/components/app-catalog';
import { ProtectedRoute } from '@/components/protected-route';
import { UserCard } from '@/components/user-card';

// Tras el login: el catálogo a pantalla completa (sin menú lateral) y la tarjeta del usuario flotante.
export default function DashboardPage() {
    return (
        <ProtectedRoute>
            <AppCatalog />
            <UserCard />
        </ProtectedRoute>
    );
}
