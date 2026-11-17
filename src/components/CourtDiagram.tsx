import React from 'react';
import type { Match } from '../types';
import { rightCourtPlayerId } from '../utils/calculations';

export type Key = 'team1' | 'team2';
export type End = 'left' | 'right';
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

/** Centre of a service court on the diagram, as 0–1 of the court's width / height. */
export const serviceCourtCenter = (end: End, rightCourt: boolean) => {
  const half = courtHalf(end, rightCourt);
  const x = (X.longService + X.shortService) / 2 / 100;
  return { x: end === 'left' ? x : 1 - x, y: half === 'top' ? 0.25 : 0.75 };
};

/** Front-court strip between the short service line and the net (used for the score). */
const frontStyle = (end: End): React.CSSProperties => ({
  left: end === 'left' ? `${X.shortService}%` : '50%',
  width: `${50 - X.shortService}%`,
  top: 0,
  bottom: 0
});

/** Shuttlecock glyph. */
export const Shuttle: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M7 3 L12 14 L17 3 Q12 1 7 3 Z" fill="#ffffff" />
    <path d="M9.5 3 L12 14 M14.5 3 L12 14" stroke="#cbd5e1" strokeWidth="0.8" />
    <circle cx="12" cy="17.5" r="4" fill="#facc15" />
  </svg>
);

/**
 * Who stands where right now: each team's end, each player's service court, the server and the receiver.
 * Rally scoring: the server serves from the right court on an even score, left on odd; the receiver stands diagonally.
 */
export const courtState = (match: Match) => {
  const endOf = (key: Key): End => {
    const team1End = match.team1Position || 'left';
    return key === 'team1' ? team1End : team1End === 'left' ? 'right' : 'left';
  };
  const keyAt = (end: End): Key => (endOf('team1') === end ? 'team1' : 'team2');
  const currentSet = match.sets?.find(s => s.setNumber === match.currentSetNumber);
  const score = (key: Key) => currentSet?.score[key] ?? 0;
  const server: Key = match.servingTeam || 'team1';
  const receiver: Key = server === 'team1' ? 'team2' : 'team1';
  const serveFromRight = score(server) % 2 === 0;

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

  return { endOf, keyAt, currentSet, score, server, receiver, serveFromRight, positions, serverPlayer, receiverPlayer };
};

/**
 * Top-down doubles court: each team at its end, each player in their service court, the server and receiver
 * highlighted, and the current set score in the front courts. `big` = full-screen sizes.
 */
export const CourtDiagram: React.FC<{ match: Match; big?: boolean; dimmed?: boolean; className?: string; children?: React.ReactNode }> = ({
  match,
  big = false,
  dimmed = false,
  className = '',
  children
}) => {
  const { keyAt, score, server, receiver, positions, serverPlayer, receiverPlayer } = courtState(match);

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

  return (
    <div
      className={`relative w-full aspect-[2/1] rounded-lg overflow-hidden [container-type:inline-size] bg-gradient-to-br from-emerald-600 to-emerald-800 ring-2 ring-white/80 transition ${
        big ? 'shadow-[0_0_60px_-10px_rgba(52,211,153,0.6)]' : 'shadow-inner'
      } ${dimmed ? 'saturate-50 brightness-75' : ''} ${className}`}
    >
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
            key={score(keyAt(end))}
            // Sized to the court width so two digits always fit between the service line and the net
            style={{ fontSize: '8cqw' }}
            className={`font-black leading-none tracking-tighter tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] animate-score-pop ${
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

      {/* Overlays: shot animation, drawing layer */}
      {children}
    </div>
  );
};
