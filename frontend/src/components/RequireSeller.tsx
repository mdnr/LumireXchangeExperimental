import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { ReactNode } from 'react';

export function RequireSeller({ children }: { children: ReactNode }) {
  const { user, token, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <div className="page container"><div className="spinner" role="status" /></div>;
  }

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user.roles.includes('Seller')) {
    return <Navigate to="/catalogue" replace />;
  }

  return <>{children}</>;
}