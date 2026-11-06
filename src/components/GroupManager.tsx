import React, { useState } from 'react';
import { Layers, Plus, Edit2, Trash2, Check, X, Loader2 } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { sortGroups, sortPools } from '../utils/calculations';
import { LoadingSpinner } from './LoadingSpinner';
import { confirmDialog, notifyError } from './Dialog';

type Draft =
  | { kind: 'add-group' }
  | { kind: 'add-pool'; groupId: string }
  | { kind: 'rename-group'; id: string }
  | { kind: 'rename-pool'; id: string };

const sameDraft = (a: Draft | null, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

export const GroupManager: React.FC = () => {
  const {
    groups, pools, teams, isLoading, isInitialized,
    addGroup, renameGroup, deleteGroup, addPool, renamePool, deletePool
  } = useTournamentStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (d: Draft, initial = '') => {
    setDraft(d);
    setValue(initial);
  };
  const close = () => {
    setDraft(null);
    setValue('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      close();
    } catch (error) {
      notifyError(error, 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const name = value.trim();
    if (!name || !draft) return;
    if (draft.kind === 'add-group') return run(() => addGroup(name));
    if (draft.kind === 'add-pool') return run(() => addPool(draft.groupId, name));
    if (draft.kind === 'rename-group') return run(() => renameGroup(draft.id, name));
    return run(() => renamePool(draft.id, name));
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (await confirmDialog({ title: 'Delete group?', message: `"${name}" and all its pools will be deleted.`, confirmText: 'Delete', tone: 'danger' })) run(() => deleteGroup(id));
  };

  const handleDeletePool = async (id: string, name: string) => {
    if (await confirmDialog({ title: 'Delete pool?', message: `"${name}" will be deleted.`, confirmText: 'Delete', tone: 'danger' })) run(() => deletePool(id));
  };

  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Groups..." />;
  }

  // Inline name editor used for add + rename of both groups and pools
  const nameInput = (placeholder: string, key?: string) => (
    <form
      key={key}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        aria-label="Save"
        className="p-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
      </button>
      <button
        type="button"
        onClick={close}
        disabled={busy}
        aria-label="Cancel"
        className="p-2.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        <X className="w-5 h-5" />
      </button>
    </form>
  );

  const IconButton = ({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`p-2.5 rounded-lg transition disabled:opacity-50 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-blue-600 hover:bg-blue-50'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="flex justify-between items-center gap-3 mb-2">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
          Groups & Pools
        </h2>
        {!sameDraft(draft, { kind: 'add-group' }) && (
          <button
            onClick={() => open({ kind: 'add-group' })}
            className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
            Add Group
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4 sm:mb-6">
        Teams are ranked within their pool. A group without pools is ranked as one table.
      </p>

      {sameDraft(draft, { kind: 'add-group' }) && (
        <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
          {nameInput('Group name, e.g. Group A - Mens')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sortGroups(groups).map(group => {
          const groupPools = sortPools(pools.filter(p => p.groupId === group.id));
          const groupTeamCount = teams.filter(t => t.groupId === group.id).length;
          const renamingGroup = sameDraft(draft, { kind: 'rename-group', id: group.id });
          const addingPool = sameDraft(draft, { kind: 'add-pool', groupId: group.id });

          return (
            <div key={group.id} className="border-2 border-gray-200 rounded-lg p-3 sm:p-4">
              {renamingGroup ? (
                nameInput('Group name')
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg text-gray-800 break-words">{group.name}</h3>
                    <p className="text-sm text-gray-500">
                      {groupTeamCount} team{groupTeamCount !== 1 ? 's' : ''} · {groupPools.length} pool{groupPools.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 -mr-2 -mt-1">
                    <IconButton label="Rename group" onClick={() => open({ kind: 'rename-group', id: group.id }, group.name)}>
                      <Edit2 className="w-5 h-5" />
                    </IconButton>
                    <IconButton label="Delete group" danger onClick={() => handleDeleteGroup(group.id, group.name)}>
                      <Trash2 className="w-5 h-5" />
                    </IconButton>
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-2">
                {groupPools.map(pool => {
                  const poolTeamCount = teams.filter(t => t.poolId === pool.id).length;
                  return sameDraft(draft, { kind: 'rename-pool', id: pool.id }) ? (
                    nameInput('Pool name', pool.id)
                  ) : (
                    <div key={pool.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg pl-3 pr-1 py-1">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800 break-words">{pool.name}</span>
                        <span className="text-sm text-gray-500 ml-2 whitespace-nowrap">
                          {poolTeamCount} team{poolTeamCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex flex-shrink-0">
                        <IconButton label="Rename pool" onClick={() => open({ kind: 'rename-pool', id: pool.id }, pool.name)}>
                          <Edit2 className="w-4 h-4" />
                        </IconButton>
                        <IconButton label="Delete pool" danger onClick={() => handleDeletePool(pool.id, pool.name)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}

                {groupPools.length === 0 && !addingPool && (
                  <p className="text-sm text-gray-500 italic">No pools: all teams in this group are ranked together.</p>
                )}

                {addingPool ? (
                  nameInput(`Pool name, e.g. Pool ${groupPools.length + 1}`)
                ) : (
                  <button
                    onClick={() => open({ kind: 'add-pool', groupId: group.id }, `Pool ${groupPools.length + 1}`)}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Pool
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {groups.length === 0 && !draft && (
        <div className="text-center py-12 text-gray-500">
          <Layers className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg">No groups yet</p>
          <p className="text-sm">Click "Add Group" to create your first group</p>
        </div>
      )}
    </div>
  );
};
