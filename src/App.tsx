import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { HomePage } from './pages/HomePage';
import { RefereePanel } from './pages/RefereePanel';
import { LiveView } from './pages/LiveView';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { RefereeProtectedRoute } from './components/RefereeProtectedRoute';
import { useTournamentStore } from './store/tournamentStore';
import { LoadingSpinner } from './components/LoadingSpinner';
import { useRealtimeSubscriptions } from './hooks/useRealtimeSubscriptions';
import { DialogHost } from './components/Dialog';

function App() {
  const { initializeData, isLoading, isInitialized } = useTournamentStore();

  // Set up real-time subscriptions (replaces polling)
  useRealtimeSubscriptions();

  useEffect(() => {
    initializeData();
  }, [initializeData]);

  // Show full-screen loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner fullScreen size="xl" text="Loading Tournament Data..." />;
  }

  return (
    <BrowserRouter>
      <DialogHost />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        {/* Old referee sign-in address: now the Referee tab of the single login page */}
        <Route path="/referee" element={<Navigate to="/login?role=referee" replace />} />
        <Route path="/referee/login" element={<Navigate to="/login?role=referee" replace />} />
        <Route 
          path="/referee/panel" 
          element={
            <RefereeProtectedRoute>
              <RefereePanel />
            </RefereeProtectedRoute>
          } 
        />
        <Route path="/live" element={<LiveView />} />
        {/* Bracket is a tab of the live page now; keep the old address working */}
        <Route path="/live/bracket" element={<Navigate to="/live?tab=bracket" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
