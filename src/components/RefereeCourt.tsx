import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowUpDown, Flag, Loader2, Maximize2, Smartphone, Trophy, Undo2, X as CloseIcon } from 'lucide-react';
import type { Match } from '../types';
import { useTournamentStore } from '../store/tournamentStore';
import { gamePointFor, isDeuce, rightCourtPlayerId, setRuleFor, setWinnerOf } from '../utils/calculations';
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
  onUndo?: () => void;
  onEndSet?: () => void;
  onFinish?: () => void;
}

/**
 * Referee's court view: top-down doubles court with each team at its end, each player in their service court,
 * the server and receiver highlighted, scores, +1 buttons, and controls to swap ends, change the serving side
 * or swap a team's players.
 */
export const RefereeCourt: React.FC<Props> = ({ match, disabled, loading, onPoint, onUndo, onEndSet, onFinish }) => {
  const setMatchSetup = useTournamentStore(s => s.setMatchSetup);
  const [busy, setBusy] = useState(false);
  const [pops, setPops] = useState<{ id: number; end: End }[]>([]);
  const popId = useRef(0);

  /*
   * Full-screen "arena" scoring view. Uses the browser's full screen and turns the phone to landscape where
   * supported (Android); elsewhere (iPhone) it is a full-window overlay.
   */
  const [arenaOpen, setArenaOpen] = useState(false);
  const wentFullscreen = useRef(false);

  const leaveFullscreen = useCallback(() => {
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      /* not supported */
    }
    if (wentFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    wentFullscreen.current = false;
  }, []);

  const openArena = async () => {
    setArenaOpen(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        wentFullscreen.current = true;
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
      }
    } catch {
      /* full screen / rotation not allowed here: the overlay still works */
    }
  };

  const closeArena = useCallback(() => {
    setArenaOpen(false);
    leaveFullscreen();
  }, [leaveFullscreen]);

  useEffect(() => {
    if (!arenaOpen) return;
    // Freeze the page behind (body position:fixed also stops the touch scroll that overflow:hidden misses on phones)
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const prev = { htmlOverflow: html.style.overflow, body: body.getAttribute('style') ?? '' };
    html.style.overflow = 'hidden';
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
    // Leaving full screen with the phone's back gesture closes the arena too
    const onFsChange = () => {
      if (!document.fullscreenElement && wentFullscreen.current) {
        wentFullscreen.current = false;
        setArenaOpen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.setAttribute('style', prev.body);
      window.scrollTo(0, scrollY);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [arenaOpen]);

  // The match ends / this view goes away: leave full screen
  useEffect(() => () => leaveFullscreen(), [leaveFullscreen]);

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
  const live = match.status === 'live';

  // Set state under the BWF rules: won, game/match point, deuce, golden point
  const rule = setRuleFor(match);
  const setScore = { team1: score('team1'), team2: score('team2') };
  const setWonBy = setWinnerOf(setScore, rule);
  const gamePoint = gamePointFor(setScore, rule);
  const winsMatch = (key: Key) => (match.score?.[key] ?? 0) + 1 >= 2; // best of 3
  const golden = setScore.team1 === rule.cap - 1 && setScore.team2 === rule.cap - 1;
  const deuce = isDeuce(setScore, rule);
  const setOver = !!setWonBy && !disabled;
  const blocked = loading || busy || disabled || setOver;

  /** Game point / deuce / set won banner. */
  const statusBanner = (className = '') => {
    if (disabled) return null;
    if (setWonBy) {
      const endsMatch = winsMatch(setWonBy);
      return (
        <button
          onClick={onEndSet}
          className={`inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-slate-900 shadow-[0_0_24px_rgba(190,242,100,0.6)] ring-2 ring-white/60 ${className}`}
        >
          {match[setWonBy].name} won the {endsMatch ? 'match' : 'set'} · End {endsMatch ? 'match' : 'set'} ›
        </button>
      );
    }
    if (golden) {
      return (
        <span className={`inline-flex rounded-full bg-red-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] ring-2 ring-white/60 ${className}`}>
          {rule.cap - 1}-all · Next point wins
        </span>
      );
    }
    if (gamePoint) {
      return (
        <span className={`inline-flex rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.6)] ring-2 ring-white/60 ${className}`}>
          {winsMatch(gamePoint) ? 'Match' : 'Game'} point · {match[gamePoint].name}
        </span>
      );
    }
    if (deuce) {
      return (
        <span className={`inline-flex rounded-full bg-white/15 ring-1 ring-white/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-white ${className}`}>
          Deuce · win by 2
        </span>
      );
    }
    return null;
  };

  /** Score a point: haptic tap + floating "+1", then hand over to the panel. */
  const point = (end: End) => {
    if (blocked) return;
    navigator.vibrate?.(25);
    const id = ++popId.current;
    setPops(p => [...p, { id, end }]);
    window.setTimeout(() => setPops(p => p.filter(x => x.id !== id)), 750);
    onPoint(keyAt(end));
  };

  /** Top-down court. `big` = full-screen arena sizes. */
  const courtBoard = (big: boolean) => (
    <div
      className={`relative w-full aspect-[2/1] rounded-lg overflow-hidden [container-type:inline-size] bg-gradient-to-br from-emerald-600 to-emerald-800 ring-2 ring-white/80 ${
        big ? 'shadow-[0_0_60px_-10px_rgba(52,211,153,0.6)]' : 'shadow-inner'
      }`}
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
    </div>
  );

  /** "Gives serve from … to …" line. */
  const serveInfo = (className: string) => (
    <p className={className}>
      <span className="font-bold text-lime-300">{serverPlayer?.name}</span> serves from the{' '}
      <span className="font-semibold text-white">{serveFromRight ? 'right' : 'left'} court</span> to{' '}
      <span className="font-bold text-white">{receiverPlayer?.name}</span>
      <span className="text-slate-400"> · {score(server)} ({serveFromRight ? 'even' : 'odd'})</span>
    </p>
  );

  /** Floating "+1" over a button after a tap. */
  const popsFor = (end: End) =>
    pops.filter(p => p.end === end).map(p => (
      <span key={p.id} className="pointer-events-none absolute left-1/2 top-1/3 text-4xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-float-up">
        +1
      </span>
    ));

  /** Normal panel +1 button. */
  const panelPointButton = (end: End) => {
    const key = keyAt(end);
    return (
      <button
        key={end}
        onClick={() => point(end)}
        disabled={blocked}
        className={`relative min-w-0 rounded-xl py-4 px-2 font-extrabold text-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none flex flex-col items-center justify-center leading-tight ${
          end === 'left' ? 'bg-sky-500 hover:bg-sky-600 text-white ls:col-start-1' : 'bg-amber-400 hover:bg-amber-500 text-slate-900 ls:col-start-3'
        } ls:row-start-1`}
      >
        <span className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          +1 Point
        </span>
        <span className="mt-0.5 text-[11px] font-semibold opacity-85 truncate max-w-full ls:whitespace-normal ls:break-words">{match[key].name}</span>
        {popsFor(end)}
      </button>
    );
  };

  /** Full-screen arena +1 button: big, glowing, "pressable". */
  const arenaPointButton = (end: End) => {
    const key = keyAt(end);
    const serving = key === server;
    const left = end === 'left';
    return (
      <button
        key={end}
        onClick={() => point(end)}
        disabled={blocked}
        aria-label={`Point to ${match[key].name}`}
        className={`relative overflow-hidden rounded-3xl border-b-[6px] active:border-b-0 active:translate-y-[6px] transition-[transform,filter] duration-75 select-none touch-manipulation disabled:opacity-50 disabled:saturate-50 flex flex-col items-center justify-center gap-1 p-3 min-w-0 min-h-0 ${
          left
            ? 'bg-gradient-to-b from-sky-400 to-blue-600 border-blue-800 text-white shadow-[0_0_40px_-6px_rgba(56,189,248,0.75)]'
            : 'bg-gradient-to-b from-amber-300 to-orange-500 border-orange-700 text-slate-900 shadow-[0_0_40px_-6px_rgba(251,191,36,0.75)]'
        } landscape:w-[18%] landscape:max-w-[13rem] landscape:h-full portrait:flex-1`}
      >
        <span className="absolute inset-x-0 top-0 h-1/2 bg-white/15 rounded-t-3xl pointer-events-none" aria-hidden="true" />
        {serving && (
          <span className="flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-lime-300">
            <Shuttle className="w-3 h-3" /> Serve
          </span>
        )}
        {/* Running score only in portrait; in landscape it's already on the court */}
        <span key={score(key)} className="landscape:hidden text-5xl sm:text-6xl font-black tabular-nums leading-none drop-shadow animate-score-pop">
          {score(key)}
        </span>
        <span className="text-2xl landscape:text-5xl min-[700px]:landscape:text-6xl font-black leading-none drop-shadow">+1</span>
        <span className="text-xs font-bold leading-tight text-center break-words opacity-90 max-w-full">{match[key].name}</span>
        {popsFor(end)}
      </button>
    );
  };

  const hudStatus = statusBanner('min-w-0 max-w-full truncate block');
  const barBtn = 'h-11 rounded-xl border-b-4 active:border-b-0 active:translate-y-1 transition-transform duration-75 font-extrabold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 touch-manipulation';
  const hudBtn = 'w-10 h-10 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition disabled:opacity-40';

  const arena = (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden overscroll-none touch-none bg-slate-950 text-white select-none pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen scoring"
    >
      {/* Stadium glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.22),transparent_60%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-24 top-1/3 w-72 h-72 rounded-full bg-sky-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 top-1/3 w-72 h-72 rounded-full bg-amber-400/20 blur-3xl" aria-hidden="true" />

      {/* HUD */}
      <div className="relative flex items-center gap-2">
        <button onClick={closeArena} className={hudBtn} aria-label="Exit full screen">
          <CloseIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 sm:gap-3">
          {/* Game point / deuce / set won takes the place of the team names (they are on the buttons) */}
          {!(live && hudStatus) && (
            <span className="hidden sm:block min-w-0 truncate text-right text-xs sm:text-sm font-extrabold text-sky-300">{match[keyAt('left')].name}</span>
          )}
          <span className="flex-shrink-0 rounded-lg bg-white/10 ring-1 ring-white/15 px-2 py-1 text-sm font-black tabular-nums">
            {match.score?.[keyAt('left')] ?? 0}
            <span className="mx-1.5 text-[10px] font-bold uppercase tracking-widest text-lime-300">Set {match.currentSetNumber || 1}</span>
            {match.score?.[keyAt('right')] ?? 0}
          </span>
          {live && hudStatus ? (
            <div className="min-w-0 flex">{hudStatus}</div>
          ) : (
            <span className="hidden sm:block min-w-0 truncate text-xs sm:text-sm font-extrabold text-amber-300">{match[keyAt('right')].name}</span>
          )}
        </div>
        {live && (
          <>
            <button onClick={swapEnds} disabled={loading || busy} className={hudBtn} aria-label="Swap ends" title="Swap ends">
              <ArrowLeftRight className="w-5 h-5" />
            </button>
            <button onClick={changeServer} disabled={loading || busy} className={hudBtn} aria-label="Change server" title="Server">
              <Shuttle className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Play area: [+1] court [+1] in landscape, court then buttons in portrait */}
      <div className="relative flex-1 min-h-0 mt-2 flex landscape:flex-row portrait:flex-col items-stretch gap-3">
        <div className="portrait:hidden contents">{arenaPointButton('left')}</div>
        <div className="relative flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center [container-type:size]">
          {/* Court as big as fits: room below it for one row of swap buttons (2rem) and the serve line (1.25rem) */}
          <div style={{ width: 'min(100cqw, calc((100cqh - 3.75rem) * 2))' }}>
            {courtBoard(true)}
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(['left', 'right'] as End[]).map(end => (
                <button
                  key={end}
                  onClick={() => swapPlayers(keyAt(end))}
                  disabled={loading || busy || !live}
                  className={`${btn} h-8 py-0 whitespace-nowrap`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Swap<span className="hidden [@container(min-width:26rem)]:inline"> positions</span></span>
                </button>
              ))}
            </div>
            {serveInfo('mt-1 h-5 leading-5 text-center text-[11px] sm:text-xs text-slate-300 truncate')}
          </div>
        </div>
        <div className="portrait:hidden contents">{arenaPointButton('right')}</div>
        {/* Portrait: both buttons under the court, plus a rotate hint */}
        <div className="landscape:hidden flex flex-col gap-2 h-[38%]">
          <div className="flex-1 min-h-0 flex gap-3">
            {arenaPointButton('left')}
            {arenaPointButton('right')}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Smartphone className="w-3.5 h-3.5 rotate-90" /> Turn your phone sideways for the best view
          </p>
        </div>
      </div>

      {/* Match controls: Undo · End set · Finish match */}
      {live && (
        <div className="relative mt-2 grid grid-cols-3 gap-2 sm:gap-3">
          <button onClick={onUndo} disabled={!onUndo || loading || busy} className={`${barBtn} bg-yellow-400 border-yellow-600 text-slate-900`}>
            <Undo2 className="w-4 h-4" /> Undo
          </button>
          <button onClick={onEndSet} disabled={!onEndSet || loading || busy || disabled} className={`${barBtn} bg-orange-500 border-orange-700 text-white`}>
            <Flag className="w-4 h-4" /> End set
          </button>
          <button onClick={onFinish} disabled={!onFinish || loading || busy} className={`${barBtn} bg-red-600 border-red-800 text-white`}>
            <Trophy className="w-4 h-4" /> <span>Finish<span className="hidden sm:inline"> match</span></span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl bg-slate-900 p-3 sm:p-4 mb-4 sm:mb-6 shadow-lg">
      {/* Header + court setup controls */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-white">Set {match.currentSetNumber || 1}</h3>
        <div className="flex gap-2">
          {live && (
            <>
              <button onClick={swapEnds} disabled={busy || loading} className={btn}>
                <ArrowLeftRight className="w-4 h-4" />
                <span className="hidden min-[400px]:inline">Swap ends</span>
              </button>
              <button onClick={changeServer} disabled={busy || loading} className={btn}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuttle className="w-4 h-4" />}
                Server
              </button>
            </>
          )}
          <button onClick={openArena} className={`${btn} !bg-lime-300 !text-slate-900 hover:!bg-lime-200`} aria-label="Full screen">
            <Maximize2 className="w-4 h-4" />
            <span className="hidden min-[400px]:inline">Full screen</span>
          </button>
        </div>
      </div>

      {/* Team at each end */}
      <div className="grid grid-cols-2 gap-3 mb-1.5 ls:mx-[8.75rem]">
        {(['left', 'right'] as End[]).map(end => (
          <div key={end} className={end === 'left' ? 'text-left' : 'text-right'}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{end} end</div>
            <div className={`text-sm font-extrabold leading-tight break-words ${keyAt(end) === server ? 'text-lime-300' : 'text-white'}`}>
              {match[keyAt(end)].name}
            </div>
          </div>
        ))}
      </div>

      {/* Court, with the +1 buttons underneath (portrait) or either side (phone in landscape) */}
      <div className="grid grid-cols-2 gap-3 ls:grid-cols-[8rem_1fr_8rem]">
        <div className="col-span-2 ls:col-span-1 ls:col-start-2 ls:row-start-1">{courtBoard(false)}</div>
        {live && (['left', 'right'] as End[]).map(panelPointButton)}
      </div>

      {/* Game point / deuce / set won */}
      {live && statusBanner() && <div className="mt-2.5 flex justify-center">{statusBanner()}</div>}

      {/* Serve info */}
      {serveInfo('mt-2.5 text-center text-xs text-slate-300')}
      {atStart && live && (
        <p className="mt-1 text-center text-[11px] text-slate-400">
          Before the first point: swap ends, pick the serving side, and swap positions to choose who serves and receives first.
        </p>
      )}

      {live && (
        /* Swap a team's players between its service courts */
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(['left', 'right'] as End[]).map(end => (
            <button key={end} onClick={() => swapPlayers(keyAt(end))} disabled={busy || loading} className={btn}>
              <ArrowUpDown className="w-4 h-4" />
              Swap positions
            </button>
          ))}
        </div>
      )}

      {arenaOpen && createPortal(arena, document.body)}
    </div>
  );
};
