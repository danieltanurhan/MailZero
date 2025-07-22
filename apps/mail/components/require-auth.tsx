import { useFirebaseSession as useSession } from '@/lib/useFirebaseSession';
import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  if (!session) {
    return <Navigate to={`/login?from=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
} 