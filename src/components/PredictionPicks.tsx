import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTournamentStore } from '../store/tournamentStore';
import { sortByName, sortGroups } from '../utils/calculations';

interface Pick {
  user_id: string;
  group_id: string;
  team_id: string;
  user_name: string;
  updated_at: string;
}

type View = 'team' | 'person';

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Admin: every prediction, grouped by team (who backed each team) or by person (each person's picks). */
export const PredictionPicks: React.FC = () => {
  const { groups, teams } = useTournamentStore();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('team');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('predictions').select('user_id, group_id, team_id, user_name, updated_at');
    if (data) setPicks(data as Pick[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`admin-predictions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const sortedGroups = useMemo(() => sortGroups(groups), [groups]);
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? 'Unknown team';
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  /** One row per person, with their pick in each group. */
  const people = useMemo(() => {
    const map = new Map<string, { name: string; picks: Record<string, string>; last: string }>();
    for (const p of picks) {
      const row = map.get(p.user_id) ?? { name: p.user_name || 'Player', picks: {}, last: p.updated_at };
      row.picks[p.group_id] = p.team_id;
      if (p.updated_at > row.last) row.last = p.updated_at;
      map.set(p.user_id, row);
    }
    return [...map.entries()].map(([id, row]) => ({ id, ...row })).sort((a, b) => a.name.localeCompare(b.name));
  }, [picks]);

  const tabClass = (on: boolean) =>
    `flex-1 py-2 rounded-md text-sm font-semibold transition ${on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;

  return (
    <div className="rounded-xl ring-1 ring-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-800">Who picked what</h3>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> {people.length}
        </span>
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <button type="button" onClick={() => setView('team')} className={tabClass(view === 'team')}>
          By team
        </button>
        <button type="button" onClick={() => setView('person')} className={tabClass(view === 'person')}>
          By person
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a name"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {!loaded ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : picks.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">No picks yet.</p>
      ) : view === 'team' ? (
        <div className="space-y-4">
          {sortedGroups.map(group => {
            const groupPicks = picks.filter(p => p.group_id === group.id);
            const rows = sortByName(teams.filter(t => t.groupId === group.id))
              .map(team => ({
                team,
                names: groupPicks
                  .filter(p => p.team_id === team.id)
                  .map(p => p.user_name || 'Player')
                  .sort((a, b) => a.localeCompare(b))
              }))
              .sort((a, b) => b.names.length - a.names.length);
            return (
              <div key={group.id}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <h4 className="text-sm font-bold text-gray-800">{group.name}</h4>
                  <span className="text-xs text-gray-500">{groupPicks.length} picks</span>
                </div>
                <ul className="divide-y divide-gray-100 rounded-lg ring-1 ring-gray-200">
                  {rows.map(({ team, names }) => {
                    const shown = names.filter(matches);
                    return (
                      <li key={team.id} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-800">{team.name}</span>
                          <span
                            className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${
                              names.length ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {names.length}
                          </span>
                        </div>
                        {shown.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {shown.map((name, i) => (
                              <span key={`${name}-${i}`} className="text-xs rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg ring-1 ring-gray-200">
          {people.filter(p => matches(p.name)).map(person => (
            <li key={person.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-gray-900">{person.name}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{timeOf(person.last)}</span>
              </div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {sortedGroups.map(group => (
                  <React.Fragment key={group.id}>
                    <dt className="text-gray-500">{group.name}</dt>
                    <dd className={person.picks[group.id] ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}>
                      {person.picks[group.id] ? teamName(person.picks[group.id]) : 'No pick'}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
