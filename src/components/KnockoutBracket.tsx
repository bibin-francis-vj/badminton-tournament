import React from 'react';
import { Trophy } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { getKnockout, sortPools } from '../utils/calculations';
import type { Match } from '../types';

/**
 * Knockout bracket for one group, drawn top-to-bottom like a classic tournament bracket turned on its side:
 *
 *   [Team A]   [Team B]     Semi-final 1
 *        └──┬──┘
 *      [Finalist 1]
 *          🏆              Final + champion
 *      [Finalist 2]
 *        ┌──┴──┐
 *   [Team C]   [Team D]     Semi-final 2
 */

type Slot = {
  name: string;
  placeholder: boolean;
  won: boolean; // won this match (completed)
  lost: boolean;
  match?: Match;
  side?: 'team1' | 'team2';
};

const LINE = 'border-white/25';

/** Slot for one team of a match (or a placeholder before the match exists). */
const slotOf = (match: Match | undefined, side: 'team1' | 'team2', placeholder: string): Slot => {
  if (!match) return { name: placeholder, placeholder: true, won: false, lost: false };
  const done = match.status === 'completed' && !!match.winner;
  const won = done && match.winner!.id === match[side].id;
  return { name: match[side].name, placeholder: false, won, lost: done && !won, match, side };
};

/** Set scores of a team in a match: finished sets, plus the current set (red) while live. */
const SetScores: React.FC<{ slot: Slot }> = ({ slot }) => {
  const { match, side } = slot;
  if (!match || !side || match.status === 'upcoming') return null;
  const other = side === 'team1' ? 'team2' : 'team1';
  const sets = match.sets.filter(s => s.score.team1 > 0 || s.score.team2 > 0);
  if (sets.length === 0) return null;
  return (
    <div className="mt-1 flex justify-center gap-1">
      {sets.map(s => {
        const current = match.status === 'live' && s.setNumber === match.currentSetNumber;
        const wonSet = !current && s.score[side] > s.score[other];
        return (
          <span
            key={s.setNumber}
            className={`min-w-[1.4rem] px-1 rounded text-[11px] leading-5 tabular-nums font-bold ${
              current ? 'bg-red-500 text-white' : wonSet ? 'bg-lime-300 text-slate-900' : 'bg-white/10 text-slate-300'
            }`}
          >
            {s.score[side]}
          </span>
        );
      })}
    </div>
  );
};

/** Outlined team box, like the reference bracket. */
const TeamBox: React.FC<{ slot: Slot }> = ({ slot }) => (
  <div
    className={`relative min-h-[3.25rem] flex flex-col justify-center rounded-lg border px-2.5 py-2 text-center ${
      slot.won
        ? 'border-lime-300 bg-lime-300/10 shadow-[0_0_14px_-4px_rgba(190,242,100,0.6)]'
        : slot.placeholder
          ? 'border-dashed border-white/25 bg-white/[0.03]'
          : 'border-white/35 bg-white/[0.06]'
    } ${slot.lost ? 'opacity-55' : ''}`}
  >
    {slot.won && <Trophy className="absolute -top-2 -right-2 w-4 h-4 text-yellow-300 drop-shadow" />}
    <div
      className={`text-[13px] leading-tight break-words ${
        slot.placeholder ? 'italic text-slate-400' : slot.won ? 'font-extrabold text-lime-200' : 'font-semibold text-white'
      }`}
    >
      {slot.name}
    </div>
    <SetScores slot={slot} />
  </div>
);

/** Caption for a semi-final: name, time/court and status. */
const MatchCaption: React.FC<{ title: string; match?: Match; court?: string }> = ({ title, match, court }) => {
  const extra = [match?.status === 'upcoming' ? match.scheduledTime : null, court].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
      <span>{title}</span>
      {extra && <span className="normal-case tracking-normal font-semibold text-slate-500">{extra}</span>}
      {match?.status === 'live' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-px text-[9px] tracking-wider text-white">
          <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
        </span>
      )}
      {match?.pendingApproval && <span className="normal-case tracking-normal text-orange-300">awaiting approval</span>}
    </div>
  );
};

/**
 * Lines joining the two semi-final boxes to the finalist box.
 * The boxes sit in a 2-column grid with a 0.75rem gap, so their centres are at 25% / 75% (± gap/4).
 */
const Merge: React.FC<{ direction: 'down' | 'up' }> = ({ direction }) => (
  <div className="relative h-9" aria-hidden="true">
    <div
      className={`absolute h-1/2 border-x ${LINE} ${direction === 'down' ? 'top-0 border-b rounded-b-md' : 'bottom-0 border-t rounded-t-md'}`}
      style={{ left: 'calc(25% - 0.1875rem)', right: 'calc(25% - 0.1875rem)' }}
    />
    <div className={`absolute left-1/2 border-l ${LINE} ${direction === 'down' ? 'top-1/2 bottom-0' : 'top-0 bottom-1/2'}`} />
  </div>
);

const Stem: React.FC = () => <div className={`mx-auto h-4 w-0 border-l ${LINE}`} aria-hidden="true" />;

// Laurel branch: leaves placed along the curve M44 86 Q18 74 16 46, angled along its tangent
const BRANCH = { p0: [44, 86], p1: [18, 74], p2: [16, 46] } as const;
const LEAVES = [0.12, 0.28, 0.44, 0.6, 0.76, 0.92].map((t, i) => {
  const { p0, p1, p2 } = BRANCH;
  const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0];
  const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
  const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  const along = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const outward = i % 2 === 0 ? -28 : 28; // alternate leaves either side of the stem
  return { x, y, rot: along + outward };
});

/** Trophy with a laurel wreath and a glow, as in the reference. */
const TrophyEmblem: React.FC<{ won: boolean }> = ({ won }) => (
  <div className="relative mx-auto w-24 h-24" aria-hidden="true">
    <div className={`absolute inset-2 rounded-full blur-2xl ${won ? 'bg-yellow-400/50' : 'bg-fuchsia-500/45'}`} />
    <svg viewBox="0 0 100 100" className="relative w-full h-full">
      <defs>
        <linearGradient id="cup-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={won ? '#fde68a' : '#f0abfc'} />
          <stop offset="100%" stopColor={won ? '#f59e0b' : '#6366f1'} />
        </linearGradient>
      </defs>
      {[false, true].map(mirrored => (
        <g key={String(mirrored)} transform={mirrored ? 'translate(100 0) scale(-1 1)' : undefined}>
          <path d="M44 86 Q18 74 16 46" fill="none" stroke="url(#cup-gradient)" strokeWidth="2" strokeLinecap="round" />
          {LEAVES.map((l, i) => (
            <ellipse key={i} cx={l.x} cy={l.y} rx="3" ry="6.5" fill="url(#cup-gradient)" transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
          ))}
        </g>
      ))}
      <path d="M34 24 H66 V34 Q66 54 50 58 Q34 54 34 34 Z" fill="url(#cup-gradient)" />
      <path d="M34 28 Q24 28 25 38 Q26 46 36 47" fill="none" stroke="url(#cup-gradient)" strokeWidth="3" />
      <path d="M66 28 Q76 28 75 38 Q74 46 64 47" fill="none" stroke="url(#cup-gradient)" strokeWidth="3" />
      <rect x="47" y="58" width="6" height="9" fill="url(#cup-gradient)" />
      <rect x="39" y="67" width="22" height="6" rx="1.5" fill="url(#cup-gradient)" />
      <path d="M42 28 Q44 42 50 48" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  </div>
);

export const KnockoutBracket: React.FC<{ groupId: string }> = ({ groupId }) => {
  const { groups, pools, matches, courts } = useTournamentStore();
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;

  const courtName = (id?: string) => courts.find(c => c.id === id)?.name;
  const { semi1, semi2, final } = getKnockout(matches, groupId);
  const groupPools = sortPools(pools.filter(p => p.groupId === groupId));
  const twoPools = groupPools.length === 2;
  const seed = (poolIndex: 0 | 1, place: '1st' | '2nd') => (twoPools ? `${groupPools[poolIndex].name} · ${place}` : 'TBD');

  // Finalists: the final's teams once it exists, else the semi-final winners, else placeholders
  const finalist = (side: 'team1' | 'team2', semi: Match | undefined, label: string): Slot => {
    if (final) return slotOf(final, side, '');
    if (semi?.status === 'completed' && semi.winner) return { name: semi.winner.name, placeholder: false, won: false, lost: false };
    return { name: `Winner ${label}`, placeholder: true, won: false, lost: false };
  };
  const champion = final?.status === 'completed' ? final.winner?.name : undefined;
  const finalInfo = [final?.status === 'upcoming' ? final.scheduledTime : null, courtName(final?.courtId)].filter(Boolean).join(' · ');

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-3 py-6 sm:px-6 shadow-xl ring-1 ring-white/10">
      {/* Red / blue ambient glows, as in a classic bracket poster */}
      <div className="pointer-events-none absolute -top-24 -left-20 w-72 h-72 rounded-full bg-red-600/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 w-72 h-72 rounded-full bg-blue-600/35 blur-3xl" aria-hidden="true" />

      <div className="relative max-w-sm mx-auto">
        <h2 className="text-center text-white font-black uppercase tracking-[0.2em] text-sm">{group.name}</h2>
        {twoPools && (
          <p className="text-center text-[11px] text-slate-400 mt-1">
            {groupPools[0].name} 1st vs {groupPools[1].name} 2nd · {groupPools[0].name} 2nd vs {groupPools[1].name} 1st
          </p>
        )}

        {/* Semi-final 1 (top) */}
        <div className="mt-5">
          <MatchCaption title={semi1?.matchName || 'Semi-final 1'} match={semi1} court={courtName(semi1?.courtId)} />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <TeamBox slot={slotOf(semi1, 'team1', seed(0, '1st'))} />
            <TeamBox slot={slotOf(semi1, 'team2', seed(1, '2nd'))} />
          </div>
        </div>
        <Merge direction="down" />

        {/* Final: finalist 1 · trophy + champion · finalist 2 */}
        <div className="mx-auto w-2/3">
          <TeamBox slot={finalist('team1', semi1, 'SF1')} />
        </div>
        <Stem />
        <div className="text-center">
          <TrophyEmblem won={!!champion} />
          <div className="-mt-1 text-[11px] font-extrabold uppercase tracking-[0.25em] text-white">
            {final?.matchName || 'Final'}
            {final?.status === 'live' && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-px text-[9px] tracking-wider align-middle">
                <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> LIVE
              </span>
            )}
          </div>
          {finalInfo && <div className="text-[10px] text-slate-500">{finalInfo}</div>}
          <div
            className={`mt-2 inline-block max-w-full rounded-full px-4 py-1.5 text-xs break-words ${
              champion
                ? 'bg-gradient-to-r from-yellow-400 to-amber-300 text-slate-900 font-black shadow-[0_0_20px_-4px_rgba(250,204,21,0.7)]'
                : 'border border-white/15 text-slate-400 italic'
            }`}
          >
            {champion ? `🏆 Champion: ${champion}` : 'Champion to be decided'}
          </div>
        </div>
        <Stem />
        <div className="mx-auto w-2/3">
          <TeamBox slot={finalist('team2', semi2, 'SF2')} />
        </div>

        {/* Semi-final 2 (bottom) */}
        <Merge direction="up" />
        <div className="grid grid-cols-2 gap-3">
          <TeamBox slot={slotOf(semi2, 'team1', seed(0, '2nd'))} />
          <TeamBox slot={slotOf(semi2, 'team2', seed(1, '1st'))} />
        </div>
        <div className="mt-2">
          <MatchCaption title={semi2?.matchName || 'Semi-final 2'} match={semi2} court={courtName(semi2?.courtId)} />
        </div>
      </div>
    </div>
  );
};
