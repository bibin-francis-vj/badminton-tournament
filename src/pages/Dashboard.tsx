import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeamManager } from '../components/TeamManager';
import { MatchScheduler } from '../components/MatchScheduler';
import { CourtAssignment } from '../components/CourtAssignment';
import { RefereeManager } from '../components/RefereeManager';
import { Statistics } from '../components/Statistics';
import { MatchApprovalPanel } from '../components/MatchApprovalPanel';
import { GroupManager } from '../components/GroupManager';
import { ResetDialog } from '../components/ResetDialog';
import { PredictionSettings } from '../components/PredictionSettings';
import { LayoutDashboard, Users, Calendar, MapPin, UserCheck, BarChart3, RotateCcw, LogOut, CheckSquare, Layers, Crown } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';

type Tab = 'groups' | 'teams' | 'matches' | 'courts' | 'referees' | 'stats' | 'approvals' | 'predictions';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('teams');
  const [showReset, setShowReset] = useState(false);
  const { matches } = useTournamentStore();
  const navigate = useNavigate();

  // Count pending approvals
  const pendingApprovalsCount = matches.filter(m => m.pendingApproval).length;

  const tabs = [
    { id: 'groups' as Tab, label: 'Groups & Pools', shortLabel: 'Groups', icon: Layers },
    { id: 'teams' as Tab, label: 'Team Management', shortLabel: 'Teams', icon: Users },
    { id: 'matches' as Tab, label: 'Match Scheduler', shortLabel: 'Matches', icon: Calendar },
    { id: 'referees' as Tab, label: 'Referee Management', shortLabel: 'Referees', icon: UserCheck },
    { id: 'courts' as Tab, label: 'Courts', shortLabel: 'Courts', icon: MapPin },
    { id: 'approvals' as Tab, label: 'Match Approvals', shortLabel: 'Approvals', icon: CheckSquare, badge: pendingApprovalsCount },
    { id: 'stats' as Tab, label: 'Statistics', shortLabel: 'Stats', icon: BarChart3 },
    { id: 'predictions' as Tab, label: 'Predictions', shortLabel: 'Predict', icon: Crown }
  ];

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-24 md:pb-0">
      {/* Header */}
      <div className="bg-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex justify-between items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-800 flex items-center gap-2">
                <LayoutDashboard className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
                <span className="truncate">Admin Dashboard</span>
              </h1>
              <p className="hidden sm:block text-gray-600 mt-1">Cubet Badminton Tournament · Season 2</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowReset(true)}
                aria-label="Reset tournament"
                title="Reset tournament"
                className="bg-red-600 text-white p-2.5 sm:px-4 sm:py-2 rounded-lg hover:bg-red-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                onClick={handleLogout}
                aria-label="Logout"
                title="Logout"
                className="bg-gray-600 text-white p-2.5 sm:px-4 sm:py-2 rounded-lg hover:bg-gray-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (tablet/desktop) */}
      <div className="hidden md:block bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition whitespace-nowrap relative ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'groups' && <GroupManager />}
        {activeTab === 'teams' && <TeamManager />}
        {activeTab === 'matches' && <MatchScheduler />}
        {activeTab === 'courts' && <CourtAssignment />}
        {activeTab === 'referees' && <RefereeManager />}
        {activeTab === 'approvals' && <MatchApprovalPanel />}
        {activeTab === 'stats' && <Statistics />}
        {activeTab === 'predictions' && <PredictionSettings />}
      </div>

      {/* Bottom Navigation (phones) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe">
        <div className="grid grid-cols-8">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 min-h-[60px] text-[10px] font-medium transition ${
                  isActive ? 'text-blue-600' : 'text-gray-500'
                }`}
              >
                {isActive && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-blue-600" />}
                <span className="relative">
                  <Icon className="w-6 h-6" />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-full px-0.5">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {showReset && <ResetDialog onClose={() => setShowReset(false)} />}
    </div>
  );
};
