import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Share2, GitBranch, Trophy, Clock, ListOrdered, LayoutGrid, CheckCircle2, Info, X } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { getStandings, standingIdOf, matchLabel, sortStanding, standingHasPoolMatches, sortGroups, sortByName, setDiffOf, pointDiffOf, signed } from '../utils/calculations';
import type { Court, Match, Standing, Team } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { KnockoutBracket } from './KnockoutBracket';
import { notify } from './Dialog';

type Tab = 'courts' | 'standings' | 'results' | 'bracket';
const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'courts', label: 'Courts', icon: LayoutGrid },
  { id: 'standings', label: 'Standings', icon: ListOrdered },
  { id: 'results', label: 'Results', icon: CheckCircle2 },
  { id: 'bracket', label: 'Bracket', icon: GitBranch }
];

const playedSets = (m: Match) => m.sets.filter(s => s.score.team1 > 0 || s.score.team2 > 0);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>
);

/* ---------------------------------------------------------------------------------------------
 * Courts tab
 * -------------------------------------------------------------------------------------------*/

/** Big scoreboard for the match currently live on a court. */
const LiveCourtCard: React.FC<{ court: Court; match: Match; label: string }> = ({ court, match, label }) => {
  const current = match.sets.find(s => s.setNumber === match.currentSetNumber);
  const finishedSets = match.sets.filter(s => s.winner && s.setNumber !== match.currentSetNumber);

  const row = (key: 'team1' | 'team2') => {
    const serving = match.servingTeam === key;
    return (
      <div className="flex items-center gap-3 py-2.5">
        <div className="w-5 flex-shrink-0 flex justify-center">
          {serving && <span className="text-base" title="Serving" aria-label="Serving">🏸</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white leading-tight break-words">{match[key].name}</div>
          {/* Player names, unless the team is already named after them */}
          {match[key].players.map(p => p.name).join(' & ') !== match[key].name && (
            <div className="text-xs text-indigo-200/80 truncate">{match[key].players.map(p => p.name).join(' & ')}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {finishedSets.map(s => (
            <span
              key={s.setNumber}
              className={`w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center tabular-nums ${
                s.winner === key ? 'bg-lime-300 text-slate-900' : 'bg-white/10 text-indigo-200'
              }`}
              title={`Set ${s.setNumber}`}
            >
              {s.score[key]}
            </span>
          ))}
          <span className={`w-14 text-right text-4xl font-black tabular-nums ${serving ? 'text-lime-300' : 'text-white'}`}>
            {current?.score[key] ?? 0}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-lg ring-1 ring-white/10 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold tracking-wide">{court.name}</div>
          <div className="text-[11px] font-semibold text-lime-300 truncate">{label}</div>
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-extrabold tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
      </div>
      <div className="px-4 divide-y divide-white/10">
        {row('team1')}
        {row('team2')}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-black/20 text-[11px] text-indigo-200">
        <span>
          Set {match.currentSetNumber} · Sets {match.score.team1}–{match.score.team2}
        </span>
        {match.pendingApproval ? (
          <span className="font-semibold text-orange-300">Awaiting approval</span>
        ) : (
          court.refereeName && court.refereeName !== 'Unassigned' && <span className="truncate">Ref: {court.refereeName}</span>
        )}
      </div>
    </div>
  );
};

const UpNextRow: React.FC<{ match: Match; label: string; first?: boolean }> = ({ match, label, first }) => (
  <div className={`flex items-center gap-3 ${first ? '' : 'pt-2.5 mt-2.5 border-t border-slate-100'}`}>
    <div className="w-14 flex-shrink-0 text-center text-sm font-black text-slate-900 leading-tight">{match.scheduledTime ?? '—'}</div>
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-semibold text-indigo-700 truncate">{label}</div>
      <div className="text-sm font-semibold text-slate-900 leading-snug break-words">
        {match.team1.name} <span className="font-normal text-slate-400">vs</span> {match.team2.name}
      </div>
    </div>
  </div>
);

const CourtsTab: React.FC = () => {
  const { courts, matches, groups, pools } = useTournamentStore();
  const sortedCourts = sortByName(courts);

  if (sortedCourts.length === 0) return <EmptyState text="No courts have been set up yet." />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sortedCourts.map(court => {
        const live = matches.find(m => m.courtId === court.id && m.status === 'live');
        const queue = matches
          .filter(m => m.courtId === court.id && m.status === 'upcoming')
          .sort((a, b) => (a.queueOrder ?? 999) - (b.queueOrder ?? 999));
        const shownQueue = queue.slice(0, live ? 2 : 3);

        return (
          <section key={court.id} className="space-y-2">
            {live ? (
              <LiveCourtCard court={court} match={live} label={matchLabel(live, groups, pools)} />
            ) : (
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">{court.name}</div>
                  <div className="text-xs text-slate-500">{queue.length ? 'Waiting for the next match' : 'No matches queued'}</div>
                </div>
                <span className="rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold px-2.5 py-1">IDLE</span>
              </div>
            )}

            {shownQueue.length > 0 && (
              <div className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Up next
                  </span>
                  {queue.length > shownQueue.length && (
                    <span className="text-[11px] text-slate-400">+{queue.length - shownQueue.length} more</span>
                  )}
                </div>
                {shownQueue.map((m, i) => (
                  <UpNextRow key={m.id} match={m} label={matchLabel(m, groups, pools)} first={i === 0} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

/* ---------------------------------------------------------------------------------------------
 * Standings tab
 * -------------------------------------------------------------------------------------------*/

const StandingTable: React.FC<{ standing: Standing; teams: Team[]; qualifiers: number }> = ({ standing, teams, qualifiers }) => (
  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
      <h3 className="font-bold text-slate-900 break-words">{standing.name}</h3>
      {teams.some(t => t.standingRank != null) && (
        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex-shrink-0">Manual</span>
      )}
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-400">
          <th className="pl-4 py-2 text-left font-semibold w-8">#</th>
          <th className="py-2 text-left font-semibold">Team</th>
          <th className="py-2 text-center font-semibold w-7">P</th>
          <th className="py-2 text-center font-semibold w-7">W</th>
          <th className="py-2 text-center font-semibold w-7">L</th>
          <th className="py-2 text-center font-semibold w-11" title="Set difference">Sets</th>
          <th className="pr-4 py-2 text-right font-semibold w-12" title="Point difference">Pts</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team, i) => {
          const q = i < qualifiers;
          return (
            <tr key={team.id} className={`border-t border-slate-100 ${q ? 'bg-lime-50/70' : ''}`}>
              <td className={`relative pl-4 py-2.5 font-black tabular-nums ${q ? 'text-lime-700' : 'text-slate-400'}`}>
                {q && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-lime-400" />}
                {i + 1}
              </td>
              <td className="py-2.5 pr-2 font-semibold text-slate-900 leading-tight break-words">{team.name}</td>
              <td className="py-2.5 text-center tabular-nums text-slate-500">{team.stats.matchesWon + team.stats.matchesLost}</td>
              <td className="py-2.5 text-center tabular-nums font-semibold text-green-700">{team.stats.matchesWon}</td>
              <td className="py-2.5 text-center tabular-nums text-red-600">{team.stats.matchesLost}</td>
              <td className="py-2.5 text-center tabular-nums text-slate-600">{signed(setDiffOf(team))}</td>
              <td className="pr-4 py-2.5 text-right tabular-nums font-bold text-slate-900">{signed(pointDiffOf(team))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const RANKING_STEPS: { title: string; text: string }[] = [
  { title: 'Most wins', text: 'More wins = higher place.' },
  { title: 'Same wins?', text: 'The team that beat the other goes higher.' },
  { title: 'Still level?', text: 'Better Sets, then better Pts.' }
];

/** Bottom sheet (dialog on larger screens) explaining how the standings are ranked. */
const RankingInfoSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ranking-info-title"
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-3xl sm:rounded-2xl bg-white shadow-2xl p-5 sm:p-6 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="ranking-info-title" className="text-lg font-bold text-slate-900">How the standings work</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {RANKING_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="text-sm">
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="text-slate-600 mt-0.5">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 space-y-1">
          <p><b>P</b> played · <b>W</b> won · <b>L</b> lost</p>
          <p><b>Sets</b> sets won minus sets lost</p>
          <p><b>Pts</b> points won minus points lost</p>
        </div>

        <div className="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Example</p>
          <p className="mt-1">Team A beats Team B <b>21–15, 21–18</b></p>
          <p className="mt-1">Team A: Sets <b className="text-green-700">+2</b>, Pts <b className="text-green-700">+9</b> (6 + 3)</p>
          <p>Team B: Sets <b className="text-red-600">−2</b>, Pts <b className="text-red-600">−9</b></p>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-lime-300 mr-1.5 align-middle" />
          Top 2 of each pool go to the semi-finals.
        </p>

        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800 transition">
          Got it
        </button>
      </div>
    </div>
  );
};

const StandingsTab: React.FC<{ groupFilter: string }> = ({ groupFilter }) => {
  const { groups, pools, teams, matches } = useTournamentStore();
  const [showInfo, setShowInfo] = useState(false);
  const standings = getStandings(groups, pools).filter(
    s => (groupFilter === 'all' || s.groupId === groupFilter) && standingHasPoolMatches(s.id, matches)
  );

  if (standings.length === 0) {
    return <EmptyState text="No pool standings for this selection. Knockout-only groups appear in the Bracket." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-lime-300 flex-shrink-0" />
          Top two of each pool reach the semi-finals
        </p>
        <button
          onClick={() => setShowInfo(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-slate-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition"
        >
          <Info className="w-3.5 h-3.5" />
          How it's ranked
        </button>
      </div>
      {showInfo && <RankingInfoSheet onClose={() => setShowInfo(false)} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {standings.map(standing => (
          <StandingTable
            key={standing.id}
            standing={standing}
            teams={sortStanding(teams.filter(t => standingIdOf(t) === standing.id), matches)}
            qualifiers={pools.filter(p => p.groupId === standing.groupId).length === 2 ? 2 : 0}
          />
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------------------------
 * Results tab
 * -------------------------------------------------------------------------------------------*/

const ResultCard: React.FC<{ match: Match; label: string; court?: string }> = ({ match, label, court }) => {
  const sets = playedSets(match);
  const row = (key: 'team1' | 'team2') => {
    const other = key === 'team1' ? 'team2' : 'team1';
    const won = match.winner?.id === match[key].id;
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-5 flex-shrink-0">{won && <Trophy className="w-4 h-4 text-yellow-500" />}</div>
        <div className={`flex-1 min-w-0 leading-tight break-words ${won ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>
          {match[key].name}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {sets.map(s => (
            <span
              key={s.setNumber}
              className={`w-8 text-center text-sm tabular-nums rounded-md py-0.5 ${
                s.score[key] > s.score[other] ? 'bg-slate-900 text-white font-bold' : 'text-slate-500'
              }`}
            >
              {s.score[key]}
            </span>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 px-4 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
        <span className="font-semibold text-indigo-700 truncate">{label}</span>
        <span className="text-slate-400 flex-shrink-0">{[court, match.scheduledTime].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {row('team1')}
        {row('team2')}
      </div>
    </div>
  );
};

const ResultsTab: React.FC<{ groupFilter: string }> = ({ groupFilter }) => {
  const { matches, courts, groups, pools } = useTournamentStore();
  // Matches are loaded in play order, so reverse for newest first
  const completed = matches
    .filter(m => m.status === 'completed' && (groupFilter === 'all' || m.team1.groupId === groupFilter))
    .reverse();

  if (completed.length === 0) return <EmptyState text="No results yet. Finished matches will appear here." />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {completed.map(m => (
        <ResultCard key={m.id} match={m} label={matchLabel(m, groups, pools)} court={courts.find(c => c.id === m.courtId)?.name} />
      ))}
    </div>
  );
};

/* ---------------------------------------------------------------------------------------------
 * Page
 * -------------------------------------------------------------------------------------------*/

export const LiveScoreboard: React.FC = () => {
  const { matches, groups, refreshData, isLoading, isInitialized } = useTournamentStore();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'standings' || tabParam === 'results' || tabParam === 'bracket' ? tabParam : 'courts';
  const groupFilter = params.get('group') ?? 'all';

  const counts = useMemo(() => ({
    live: matches.filter(m => m.status === 'live').length,
    done: matches.filter(m => m.status === 'completed').length,
    total: matches.length
  }), [matches]);

  // Tab and group live in the URL so a shared link opens the same view
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Cubet Badminton Tournament – Live Scores', text: 'Follow the live scores!', url });
      } catch {
        /* share sheet dismissed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        notify('Share it with anyone to follow the live scores.', { tone: 'success', title: 'Link copied' });
      } catch {
        // Clipboard blocked (e.g. insecure context): show the link so it can be copied by hand
        notify(url, { title: 'Share this link' });
      }
    }
  };

  if (isLoading && !isInitialized) {
    return <LoadingSpinner fullScreen size="xl" text="Loading Live Scores..." />;
  }

  const sortedGroups = sortGroups(groups);
  // The bracket shows one group: the selected one, or the first group when "All groups" is selected
  const bracketGroupId = sortedGroups.some(g => g.id === groupFilter) ? groupFilter : sortedGroups[0]?.id;
  const iconButton = 'w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition';
  const tabClass = 'flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-lg py-1.5 sm:py-2 text-[11px] sm:text-sm font-bold transition';

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 w-64 h-64 rounded-full bg-lime-400/15 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto px-4 pt-4 pb-5">
          <div className="flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-200 hover:text-white py-1 -ml-1 px-1">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <div className="flex gap-2">
              <button onClick={() => refreshData()} aria-label="Refresh" className={iconButton}>
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={handleShare} aria-label="Share" className={iconButton}>
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-lime-300 whitespace-nowrap">Cubet Badminton · Season 2</div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Live Scores</h1>
            </div>
            <div className="flex gap-2 flex-shrink-0 text-center">
              <div className="rounded-xl bg-white/10 px-3 py-1.5">
                <div className="text-lg font-black tabular-nums leading-tight flex items-center justify-center gap-1.5">
                  {counts.live > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  {counts.live}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-indigo-200">Live</div>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-1.5">
                <div className="text-lg font-black tabular-nums leading-tight">{counts.done}/{counts.total}</div>
                <div className="text-[10px] uppercase tracking-wide text-indigo-200">Played</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Sticky tabs */}
      <nav className="sticky top-0 z-30 bg-slate-100/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setParam('tab', id === 'courts' ? null : id)}
                aria-pressed={tab === id}
                className={`${tabClass} ${tab === id ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Group filter (standings, results) / group picker (bracket: one group at a time) */}
          {tab !== 'courts' && sortedGroups.length > (tab === 'bracket' ? 0 : 1) && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-2.5">
              {(tab === 'bracket' ? sortedGroups : [{ id: 'all', name: 'All groups' }, ...sortedGroups]).map(g => (
                <button
                  key={g.id}
                  onClick={() => setParam('group', g.id === 'all' ? null : g.id)}
                  className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    (tab === 'bracket' ? bracketGroupId : groupFilter) === g.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-4 pb-10">
        {tab === 'courts' && <CourtsTab />}
        {tab === 'standings' && <StandingsTab groupFilter={groupFilter} />}
        {tab === 'results' && <ResultsTab groupFilter={groupFilter} />}
        {tab === 'bracket' &&
          (bracketGroupId ? <KnockoutBracket groupId={bracketGroupId} /> : <EmptyState text="No groups have been set up yet." />)}
      </main>
    </div>
  );
};
