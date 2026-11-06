import React from 'react';
import { Navigate } from 'react-router-dom';

interface RefereeProtectedRouteProps {
  children: React.ReactNode;
}

export const RefereeProtectedRoute: React.FC<RefereeProtectedRouteProps> = ({ children }) => {
  const isAuthenticated = sessionStorage.getItem('refereeAuthenticated') === 'true';

  if (!isAuthenticated) {
    return <Navigate to="/login?role=referee" replace />;
  }

  return <>{children}</>;
};
