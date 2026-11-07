import React, { useState } from 'react';
import { ArrowLeftRight, ArrowUpDown, Loader2 } from 'lucide-react';
import type { Match } from '../types';
import { useTournamentStore } from '../store/tournamentStore';
import { rightCourtPlayerId } from '../utils/calculations';
import { confirmDialog, notifyError } from './Dialog';

type Key = 'team1' | 'team2';
type End = 'left' | 'right';
type Half = 'top' | 'bottom';

/*
 * Doubles court seen from above, net in the middle (court 13.4 m long, 6.1 m wide), as % of the court box:
 *   long service line (doubles) 0.76 m from the back → 5.7%  · short service line 1.98 m from the net → 35.2% / 64.8%
 *   singles sidelines 0.46 m in from the sides → 7.5% / 92.5%
 */
const X = { longService: 5.7, shortService: 35.2 };
const Y = { singles: 7.5 };

/**
 * Where a team's RIGHT / LEFT service court is on the diagram.
 * Facing the net from the left end your right hand is the bottom of the diagram; from the right end it is the top.
 */
const courtHalf = (end: End, rightCourt: boolean): Half =>
  end === 'left' ? (rightCourt ? 'bottom' : 'top') : (rightCourt ? 'top' : 'bottom');

const boxStyle = (end: End, half: Half): React.CSSProperties => ({
  left: `${end === 'left' ? X.longService : 100 - X.shortService}%`,
  width: `${X.shortService - X.longService}%`,
  top: half === 'top' ? '0%' : '50%',
  height: '50%'
});

/** Front-court strip between the short service line and the net (used for the score). */
const frontStyle = (end: End): React.CSSProperties => ({
  left: end === 'left' ? `${X.shortService}%` : '50%',
  width: `${50 - X.shortService}%`,
  top: 0,
  bottom: 0
});

/** Shuttlecock glyph. */
const Shuttle: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M7 3 L12 14 L17 3 Q12 1 7 3 Z" fill="#ffffff" />
    <path d="M9.5 3 L12 14 M14.5 3 L12 14" stroke="#cbd5e1" strokeWidth="0.8" />
    <circle cx="12" cy="17.5" r="4" fill="#facc15" />
  </svg>
);

interface Props {
  match: Match;
  disabled: boolean; // e.g. set locked
  loading: boolean;
  onPoint: (team: Key) => void;
}

/**
 * Referee's court view: top-down doubles court with each team at its end, each player in their service court,
 * the server and receiver highlighted, scores, +1 buttons, and controls to swap ends, change the serving side
 * or swap a team's players.
 */
export const RefereeCourt: React.FC<Props> = ({ match, disabled, loading, onPoint }) => {
  const setMatchSetup = useTournamentStore(s => s.setMatchSetup);
  const [busy, setBusy] = useState(false);

  const endOf = (key: Key): End => {
    const team1End = match.team1Position || 'left';
    return key === 'team1' ? team1End : team1End === 'left' ? 'right' : 'left';
  };
  const keyAt = (end: End): Key => (endOf('team1') === end ? 'team1' : 'team2');

  const currentSet = match.sets?.find(s => s.setNumber === match.currentSetNumber);
  const score = (key: Key) => currentSet?.score[key] ?? 0;
  const server: Key = match.servingTeam || 'team1';
  const receiver: Key = server === 'team1' ? 'team2' : 'team1';
  // Server serves from the right court on an even score, left on odd; the receiver stands diagonally opposite
  const serveFromRight = score(server) % 2 === 0;
  const atStart = score('team1') === 0 && score('team2') === 0;

  /** Players of a team by service court. */
  const positions = (key: Key) => {
    const players = match[key].players;
    const rightId = rightCourtPlayerId(match, key);
    const right = players.find(p => p.id === rightId) ?? players[0];
    const left = players.find(p => p.id !== right?.id) ?? right;
    return { right, left };
  };
  const serverPlayer = serveFromRight ? positions(server).right : positions(server).left;
  const receiverPlayer = serveFromRight ? positions(receiver).right : positions(receiver).left;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notifyError(error, 'Could not update the court. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const swapEnds = async () => {
    if (await confirmDialog({
      title: 'Swap ends?',
      message: `${match[keyAt('left')].name} moves to the right end and ${match[keyAt('right')].name} to the left end.`,
      confirmText: 'Swap ends'
    })) run(() => setMatchSetup(match.id, { swapSides: true }));
  };

  const changeServer = async () => {
    if (await confirmDialog({
      title: 'Change serving side?',
      message: `${match[receiver].name} will serve${atStart ? ' first' : ''}.`,
      confirmText: 'Change'
    })) run(() => setMatchSetup(match.id, { servingTeam: receiver }));
  };

  const swapPlayers = async (key: Key) => {
    const { right, left } = positions(key);
    if (await confirmDialog({
      title: 'Swap positions?',
      message: `${right?.name} moves to the left service court and ${left?.name} to the right.`,
      confirmText: 'Swap'
    })) run(() => setMatchSetup(match.id, { swapPlayers: key }));
  };

  /** One service court with the player standing in it. */
  const serviceCourt = (end: End, rightCourt: boolean) => {
    const key = keyAt(end);
    const player = rightCourt ? positions(key).right : positions(key).left;
    const isServer = key === server && player?.id === serverPlayer?.id;
    const isReceiver = key === receiver && player?.id === receiverPlayer?.id;
    const half = courtHalf(end, rightCourt);
    return (
      <div
        key={`${end}-${rightCourt}`}
        className={`absolute flex flex-col items-center justify-center p-1 ${
          isServer ? 'bg-lime-300/35 ring-2 ring-inset ring-lime-300' : isReceiver ? 'bg-white/10 ring-2 ring-inset ring-white/70' : ''
        }`}
        style={boxStyle(end, half)}
      >
        <span
          className={`max-w-full rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs font-bold leading-tight text-center break-words shadow ${
            isServer ? 'bg-lime-300 text-slate-900' : isReceiver ? 'bg-white text-slate-900' : 'bg-slate-900/60 text-white'
          }`}
        >
          {player?.name ?? '—'}
        </span>
        {(isServer || isReceiver) && (
          <span className={`mt-0.5 flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider ${isServer ? 'text-lime-200' : 'text-white/90'}`}>
            {isServer && <Shuttle className="w-3 h-3 animate-bounce" />}
            {isServer ? 'Serving' : 'Receiving'}
          </span>
        )}
      </div>
    );
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-50 transition';

  return (
    <div className="rounded-2xl bg-slate-900 p-3 sm:p-4 mb-4 sm:mb-6 shadow-lg">
      {/* Header + court setup controls */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-white">Set {match.currentSetNumber || 1}</h3>
        {match.status === 'live' && (
          <div className="flex gap-2">
            <button onClick={swapEnds} disabled={busy || loading} className={btn}>
              <ArrowLeftRight className="w-4 h-4" />
              Swap ends
            </button>
            <button onClick={changeServer} disabled={busy || loading} className={btn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuttle className="w-4 h-4" />}
              Server
            </button>
          </div>
        )}
      </div>

      {/* Team at each end */}
      <div className="grid grid-cols-2 gap-3 mb-1.5">
        {(['left', 'right'] as End[]).map(end => (
          <div key={end} className={end === 'left' ? 'text-left' : 'text-right'}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{end} end</div>
            <div className={`text-sm font-extrabold leading-tight break-words ${keyAt(end) === server ? 'text-lime-300' : 'text-white'}`}>
              {match[keyAt(end)].name}
            </div>
          </div>
        ))}
      </div>

      {/* Court (top view) */}
      <div className="relative w-full aspect-[2/1] rounded-lg overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 ring-2 ring-white/80 shadow-inner">
        {/* Court lines */}
        <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <g stroke="rgba(255,255,255,0.85)" strokeWidth="0.45" vectorEffect="non-scaling-stroke" fill="none">
            <line x1="0" y1={Y.singles / 2} x2="100" y2={Y.singles / 2} />
            <line x1="0" y1={50 - Y.singles / 2} x2="100" y2={50 - Y.singles / 2} />
            <line x1={X.longService} y1="0" x2={X.longService} y2="50" />
            <line x1={100 - X.longService} y1="0" x2={100 - X.longService} y2="50" />
            <line x1={X.shortService} y1="0" x2={X.shortService} y2="50" />
            <line x1={100 - X.shortService} y1="0" x2={100 - X.shortService} y2="50" />
            <line x1="0" y1="25" x2={X.shortService} y2="25" />
            <line x1={100 - X.shortService} y1="25" x2="100" y2="25" />
          </g>
        </svg>

        {/* Players in their service courts */}
        {(['left', 'right'] as End[]).flatMap(end => [serviceCourt(end, true), serviceCourt(end, false)])}

        {/* Scores in the front court */}
        {(['left', 'right'] as End[]).map(end => (
          <div key={end} className="absolute flex items-center justify-center pointer-events-none" style={frontStyle(end)}>
            <span
              className={`text-3xl sm:text-5xl font-black tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${
                keyAt(end) === server ? 'text-lime-300' : 'text-white'
              }`}
            >
              {score(keyAt(end))}
            </span>
          </div>
        ))}

        {/* Net with posts */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-gradient-to-b from-slate-100 via-white to-slate-100 shadow-[0_0_8px_rgba(0,0,0,0.4)]" aria-hidden="true" />
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-slate-200 ring-2 ring-slate-500" aria-hidden="true" />
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-slate-200 ring-2 ring-slate-500" aria-hidden="true" />
      </div>

      {/* Serve info */}
      <p className="mt-2.5 text-center text-xs text-slate-300">
        <span className="font-bold text-lime-300">{serverPlayer?.name}</span> serves from the{' '}
        <span className="font-semibold text-white">{serveFromRight ? 'right' : 'left'} court</span> to{' '}
        <span className="font-bold text-white">{receiverPlayer?.name}</span>
        <span className="text-slate-400"> · {score(server)} ({serveFromRight ? 'even' : 'odd'})</span>
      </p>
      {atStart && match.status === 'live' && (
        <p className="mt-1 text-center text-[11px] text-slate-400">
          Before the first point: swap ends, pick the serving side, and swap positions to choose who serves and receives first.
        </p>
      )}

      {match.status === 'live' && (
        <>
          {/* Swap a team's players between its service courts */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(['left', 'right'] as End[]).map(end => (
              <button key={end} onClick={() => swapPlayers(keyAt(end))} disabled={busy || loading} className={btn}>
                <ArrowUpDown className="w-4 h-4" />
                Swap positions
              </button>
            ))}
          </div>

          {/* +1 buttons, one under each end */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(['left', 'right'] as End[]).map(end => {
              const key = keyAt(end);
              return (
                <button
                  key={end}
                  onClick={() => onPoint(key)}
                  disabled={loading || busy || disabled}
                  className={`min-w-0 rounded-xl py-4 px-2 font-extrabold text-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none flex flex-col items-center leading-tight ${
                    end === 'left' ? 'bg-sky-500 hover:bg-sky-600 text-white' : 'bg-amber-400 hover:bg-amber-500 text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    +1 Point
                  </span>
                  <span className="mt-0.5 text-[11px] font-semibold opacity-85 truncate max-w-full">{match[key].name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
