import React, { useState, useMemo } from 'react';
import { useTournamentStore } from '../store/tournamentStore';
import { Team, Player } from '../types';
import { Plus, Trash2, Edit2, Users, Loader2, Filter } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { sortGroups, sortPools, sortByName, teamGroupLabel, setDiffOf, pointDiffOf, signed } from '../utils/calculations';
import { confirmDialog, notify } from './Dialog';

const emptyForm = (groupId = '') => ({ name: '', groupId, poolId: '', player1Name: '', player2Name: '' });

export const TeamManager: React.FC = () => {
  const { teams, groups: unsortedGroups, pools, addTeam, updateTeam, deleteTeam, isLoading, isInitialized } = useTournamentStore();
  const groups = useMemo(() => sortGroups(unsortedGroups), [unsortedGroups]);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [formData, setFormData] = useState(emptyForm());

  const formPools = useMemo(
    () => sortPools(pools.filter(p => p.groupId === formData.groupId)),
    [pools, formData.groupId]
  );

  // Filter teams based on selected group, sorted by pool then name
  const filteredTeams = useMemo(() => {
    const list = selectedGroupFilter === 'all' ? teams : teams.filter(team => team.groupId === selectedGroupFilter);
    return sortByName(list).sort((a, b) =>
      teamGroupLabel(a, groups, pools).localeCompare(teamGroupLabel(b, groups, pools), undefined, { numeric: true })
    );
  }, [teams, selectedGroupFilter, groups, pools]);

  const teamCountByGroup = useMemo(() => {
    const counts: { [key: string]: number } = {};
    teams.forEach(team => {
      counts[team.groupId] = (counts[team.groupId] || 0) + 1;
    });
    return counts;
  }, [teams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.groupId) {
      notify('Please select a group for the team.', { tone: 'warning' });
      return;
    }
    if (formPools.length > 0 && !formData.poolId) {
      notify('Please select a pool for the team.', { tone: 'warning' });
      return;
    }
    setLoading(true);
    
    try {
      const poolId = formPools.length > 0 ? formData.poolId : null;
      const player1: Player = {
        id: `player-${Date.now()}-1`,
        name: formData.player1Name
      };
      
      const player2: Player = {
        id: `player-${Date.now()}-2`,
        name: formData.player2Name
      };

      if (editingTeamId) {
        const team = teams.find(t => t.id === editingTeamId);
        if (team) {
          if (await confirmDialog({ title: 'Save changes?', message: `Update team "${team.name}"?`, confirmText: 'Save' })) {
            await updateTeam(editingTeamId, {
              name: formData.name,
              groupId: formData.groupId,
              poolId,
              players: [player1, player2]
            });
            setEditingTeamId(null);
          } else {
            setLoading(false);
            return;
          }
        }
      } else {
        const newTeam: Team = {
          id: `team-${Date.now()}`,
          name: formData.name,
          players: [player1, player2],
          groupId: formData.groupId,
          poolId,
          stats: {
            matchesWon: 0,
            matchesLost: 0,
            points: 0
          }
        };
        await addTeam(newTeam);
      }

      setFormData(emptyForm(groups[0]?.id));
      setIsAddingTeam(false);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (team: Team) => {
    setFormData({
      name: team.name,
      groupId: team.groupId,
      poolId: team.poolId ?? '',
      player1Name: team.players[0]?.name || '',
      player2Name: team.players[1]?.name || ''
    });
    setEditingTeamId(team.id);
    setIsAddingTeam(true);
  };

  const handleCancel = () => {
    setFormData(emptyForm(groups[0]?.id));
    setIsAddingTeam(false);
    setEditingTeamId(null);
  };

  // Show loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Teams..." />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex justify-between items-center gap-3 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          Team Management
        </h2>
        {!isAddingTeam && (
          <button
            onClick={() => {
              if (groups.length === 0) {
                notify('Create a group first in the Groups tab, then add teams to it.', { tone: 'warning', title: 'No groups yet' });
                return;
              }
              setFormData(emptyForm(selectedGroupFilter !== 'all' ? selectedGroupFilter : groups[0].id));
              setIsAddingTeam(true);
            }}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
            Add Team
          </button>
        )}
      </div>

      {/* Group Filter */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-600" />
          <label className="text-sm font-medium text-gray-700">Filter by Group:</label>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button
            onClick={() => setSelectedGroupFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
              selectedGroupFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Groups ({teams.length})
          </button>
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => setSelectedGroupFilter(group.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
                selectedGroupFilter === group.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {group.name} ({teamCountByGroup[group.id] || 0})
            </button>
          ))}
        </div>
      </div>

      {isAddingTeam && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-blue-200">
          <h3 className="text-lg font-semibold mb-4">
            {editingTeamId ? 'Edit Team' : 'Add New Team'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter team name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group
              </label>
              <select
                required
                value={formData.groupId}
                onChange={(e) => setFormData({ ...formData, groupId: e.target.value, poolId: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {groups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            {formPools.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pool
                </label>
                <select
                  required
                  value={formData.poolId}
                  onChange={(e) => setFormData({ ...formData, poolId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select pool</option>
                  {formPools.map(pool => (
                    <option key={pool.id} value={pool.id}>{pool.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Player 1 Name
              </label>
              <input
                type="text"
                required
                value={formData.player1Name}
                onChange={(e) => setFormData({ ...formData, player1Name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter player 1 name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Player 2 Name
              </label>
              <input
                type="text"
                required
                value={formData.player2Name}
                onChange={(e) => setFormData({ ...formData, player2Name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter player 2 name"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-none justify-center bg-blue-600 text-white px-4 py-2.5 sm:py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTeamId ? 'Update Team' : 'Add Team'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 sm:flex-none bg-gray-300 text-gray-700 px-4 py-2.5 sm:py-2 rounded-md hover:bg-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeams.map(team => (
          <div key={team.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition">
            <div className="flex justify-between items-start mb-3">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-gray-800 break-words">{team.name}</h3>
                <span className="inline-block text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                  {teamGroupLabel(team, groups, pools)}
                </span>
              </div>
              <div className="flex gap-1 flex-shrink-0 -mr-2 -mt-2">
                <button
                  onClick={() => handleEdit(team)}
                  aria-label="Edit team"
                  className="p-2.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Delete team?', message: `"${team.name}" will be removed. This cannot be undone.`, confirmText: 'Delete', tone: 'danger' })) {
                      deleteTeam(team.id);
                    }
                  }}
                  aria-label="Delete team"
                  className="p-2.5 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-50 transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-600">👤 {team.players[0]?.name}</p>
              <p className="text-sm text-gray-600">👤 {team.players[1]?.name}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Wins: {team.stats.matchesWon}</span>
                <span>Losses: {team.stats.matchesLost}</span>
                <span>Sets {signed(setDiffOf(team))} · Pts {signed(pointDiffOf(team))}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTeams.length === 0 && !isAddingTeam && (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg">
            {selectedGroupFilter === 'all'
              ? 'No teams added yet'
              : `No teams in ${groups.find(g => g.id === selectedGroupFilter)?.name}`
            }
          </p>
          <p className="text-sm">
            {selectedGroupFilter === 'all'
              ? 'Click "Add Team" to create your first team'
              : 'Try selecting a different group or add a new team'
            }
          </p>
        </div>
      )}
    </div>
  );
};
