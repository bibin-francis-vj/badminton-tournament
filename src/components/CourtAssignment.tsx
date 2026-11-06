import React, { useState } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { UserCog, MapPin, ChevronUp, ChevronDown, X, Plus, Edit2, Trash2, Check, Loader2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { sortByName } from '../utils/calculations';
import { confirmDialog, notifyError } from './Dialog';

export const CourtAssignment: React.FC = () => {
  const { courts: unsortedCourts, matches, referees, assignMatchToCourt, assignRefereeToCourt, unassignMatchFromCourt, reorderCourtMatches, addCourt, renameCourt, deleteCourt, isLoading, isInitialized } = useTournamentStore();
  const courts = sortByName(unsortedCourts);

  // Court add/rename: editingCourtId is 'new' while adding
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtName, setCourtName] = useState('');
  const [busy, setBusy] = useState(false);

  const runCourtAction = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setEditingCourtId(null);
      setCourtName('');
    } catch (error) {
      notifyError(error, 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveCourt = () => {
    const name = courtName.trim();
    if (!name) return;
    if (editingCourtId === 'new') {
      return runCourtAction(() => addCourt({ id: `court-${Date.now()}`, name, refereeId: '', refereeName: 'Unassigned' }));
    }
    if (editingCourtId) return runCourtAction(() => renameCourt(editingCourtId, name));
  };

  const handleDeleteCourt = async (courtId: string, name: string) => {
    if (await confirmDialog({ title: `Delete ${name}?`, message: 'Its referee will be unassigned.', confirmText: 'Delete', tone: 'danger' })) {
      runCourtAction(() => deleteCourt(courtId));
    }
  };

  const courtNameForm = (placeholder: string) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveCourt();
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={courtName}
        onChange={(e) => setCourtName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button type="submit" disabled={busy || !courtName.trim()} aria-label="Save" className="p-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
      </button>
      <button type="button" onClick={() => setEditingCourtId(null)} disabled={busy} aria-label="Cancel" className="p-2.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50">
        <X className="w-5 h-5" />
      </button>
    </form>
  );

  const upcomingMatches = matches.filter(m => m.status === 'upcoming');

  const handleAssignMatch = async (courtId: string, matchId: string) => {
    if (!matchId) {
      return;
    }

    const match = matches.find(m => m.id === matchId);
    const court = courts.find(c => c.id === courtId);

    if (match && court) {
      if (await confirmDialog({ title: `Add to ${court.name}?`, message: `${match.team1.name} vs ${match.team2.name} will be added to the end of the court's queue.`, confirmText: 'Add match' })) {
        assignMatchToCourt(matchId, courtId);
      }
    }
  };

  const handleAssignReferee = async (courtId: string, refereeId: string) => {
    if (!refereeId) {
      return;
    }

    const referee = referees.find(r => r.id === refereeId);
    const court = courts.find(c => c.id === courtId);

    if (referee && court) {
      if (await confirmDialog({ title: 'Assign referee?', message: `${referee.name} will referee ${court.name}.`, confirmText: 'Assign' })) {
        assignRefereeToCourt(refereeId, courtId);
      }
    }
  };

  const handleRemoveMatch = async (matchId: string, matchName: string) => {
    if (await confirmDialog({ title: 'Remove from queue?', message: `${matchName} will be taken off this court. The match itself is kept.`, confirmText: 'Remove', tone: 'warning' })) {
      unassignMatchFromCourt(matchId);
    }
  };


  const handleReorderMatch = (courtId: string, matchId: string, direction: 'up' | 'down') => {
    reorderCourtMatches(courtId, matchId, direction);
  };

  // Show loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Courts..." />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex justify-between items-center gap-3 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <MapPin className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
          Courts
        </h2>
        {editingCourtId !== 'new' && (
          <button
            onClick={() => {
              setEditingCourtId('new');
              setCourtName(`Court ${courts.length + 1}`);
            }}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
            Add Court
          </button>
        )}
      </div>

      {editingCourtId === 'new' && (
        <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
          {courtNameForm('Court name, e.g. Court 3')}
        </div>
      )}

      {/* Referees List */}
      <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <UserCog className="w-5 h-5" />
          Referees
        </h3>

        <div className="flex flex-wrap gap-2">
          {referees.map(referee => (
            <div
              key={referee.id}
              className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
            >
              {referee.name}
              {referee.courtId && (
                <span className="ml-2 text-blue-600">
                  (Court {referee.courtId.replace('court-', '')})
                </span>
              )}
            </div>
          ))}
          {referees.length === 0 && (
            <p className="text-sm text-gray-500">No referees added yet</p>
          )}
        </div>
      </div>

      {/* Courts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {courts.map(court => (
          <div key={court.id} className="border-2 border-gray-200 rounded-lg p-3 sm:p-4">
            <div className="mb-4">
              {editingCourtId === court.id ? (
                <div className="mb-1">{courtNameForm('Court name')}</div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-gray-800 mb-1 break-words min-w-0">{court.name}</h3>
                  <div className="flex flex-shrink-0 -mr-2 -mt-2">
                    <button
                      onClick={() => {
                        setEditingCourtId(court.id);
                        setCourtName(court.name);
                      }}
                      disabled={busy}
                      aria-label="Rename court"
                      title="Rename court"
                      className="p-2.5 rounded-lg text-blue-600 hover:bg-blue-50 transition disabled:opacity-50"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCourt(court.id, court.name)}
                      disabled={busy}
                      aria-label="Delete court"
                      title="Delete court"
                      className="p-2.5 rounded-lg text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
              <div className="text-sm text-gray-600">
                Referee: <span className="font-medium">{court.refereeName}</span>
              </div>
            </div>

            {/* Assign Referee */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Assign Referee
              </label>
              <select
                value={court.refereeId}
                onChange={(e) => handleAssignReferee(court.id, e.target.value)}
                className="w-full px-3 py-2.5 md:px-2 md:py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Referee</option>
                {referees.map(referee => {
                  // Check if referee is already assigned to a different court
                  const isAssignedElsewhere = !!(referee.courtId && referee.courtId !== court.id);
                  return (
                    <option
                      key={referee.id}
                      value={referee.id}
                      disabled={isAssignedElsewhere}
                    >
                      {referee.name}
                      {isAssignedElsewhere ? ' (Assigned to another court)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Assigned Matches Queue */}
            {court.matches && court.matches.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="text-xs font-semibold text-gray-700">Assigned Matches ({court.matches.length})</div>
                {court.matches.map((match, index) => (
                  <div
                    key={match.id}
                    className={`p-2 rounded-lg border text-sm md:text-xs ${
                      match.status === 'live'
                        ? 'bg-green-50 border-green-300'
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex-1 min-w-[60%] break-words">
                        <span className={`font-semibold ${match.status === 'live' ? 'text-green-800' : 'text-gray-700'}`}>
                          {index + 1}. {match.scheduledTime && <span className="font-normal text-gray-500">{match.scheduledTime} · </span>}{match.team1.name} vs {match.team2.name}
                        </span>
                        {match.status === 'live' && (
                          <span className="ml-2 text-green-600 font-bold">
                            {match.score.team1} - {match.score.team2} 🔴
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                        <span className={`text-xs px-2 py-1 rounded ${
                          match.status === 'live'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-blue-200 text-blue-800'
                        }`}>
                          {match.status === 'live' ? 'LIVE' : 'QUEUED'}
                        </span>
                        {/* Reorder and Remove buttons - only show for queued matches */}
                        {match.status !== 'live' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleReorderMatch(court.id, match.id, 'up')}
                              disabled={index === 0 || (court.matches && court.matches[0].status === 'live' && index === 1)}
                              className="p-2 md:p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4 md:w-3 md:h-3" />
                            </button>
                            <button
                              onClick={() => handleReorderMatch(court.id, match.id, 'down')}
                              disabled={court.matches && index === court.matches.length - 1}
                              className="p-2 md:p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4 md:w-3 md:h-3" />
                            </button>
                            <button
                              onClick={() => handleRemoveMatch(match.id, `${match.team1.name} vs ${match.team2.name}`)}
                              className="p-2 md:p-1 rounded hover:bg-red-100 text-red-600"
                              title="Remove from queue"
                            >
                              <X className="w-4 h-4 md:w-3 md:h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Assign Match Dropdown - Always available */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">
                Assign Match
              </label>
              <select
                onChange={(e) => e.target.value && handleAssignMatch(court.id, e.target.value)}
                className="w-full px-3 py-2.5 md:px-2 md:py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value=""
              >
                <option value="">Select Match</option>
                {upcomingMatches.filter(m => !m.courtId).map(match => (
                  <option key={match.id} value={match.id}>
                    {match.scheduledTime ? `${match.scheduledTime} · ` : ''}{match.team1.name} vs {match.team2.name}
                  </option>
                ))}
              </select>
              {upcomingMatches.filter(m => !m.courtId).length === 0 && (
                <p className="text-xs text-gray-500 mt-2">No unassigned matches available</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
