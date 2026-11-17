import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Pause, Radio, Share2, Smartphone, X } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import type { Match } from '../types';
import { matchLabel } from '../utils/calculations';
import { buildCommentary, formatDuration, momentKind, pauseReason, pauseStateOf, useMatchEvents, type CommentaryItem, type MatchEvent } from '../utils/matchEvents';
import { isShotPath, toDisplay, type ShotPath } from '../utils/shotPath';
import { ShotAnimation } from '../components/ShotAnimation';
import { CourtDiagram, Shuttle, courtState, type End } from '../components/CourtDiagram';
import { CommentaryFeed } from '../components/CommentaryFeed';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { notify } from '../components/Dialog';

type Side = 'team1' | 'team2';

/** Ticks every second while `on` (for the pause timer). */
const useNow = (on: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
};

const StatusBadge: React.FC<{ match: Match; paused: boolean }> = ({ match, paused }) =>
  match.status === 'live' ? (
    paused ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-slate-900">
        <Pause className="w-3 h-3" /> PAUSED
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
      </span>
    )
  ) : (
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
      {match.status === 'completed' ? 'FINISHED' : 'UPCOMING'}
    </span>
  );

/** Teams with set scores and the current set score (serving team in lime). */
const Scoreboard: React.FC<{ match: Match; compact?: boolean }> = ({ match, compact = false }) => {
  const live = match.status === 'live';
  const current = match.sets.find(s => s.setNumber === match.currentSetNumber);
  const sets = match.sets.filter(s => (s.winner || s.locked) && (live ? s.setNumber !== match.currentSetNumber : true));
  const row = (key: Side) => {
    const serving = live && match.servingTeam === key;
    const won = match.status === 'completed' && match.winner?.id === match[key].id;
    return (
      <div className={`flex items-center gap-3 ${compact ? 'py-1.5' : 'py-2.5'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${key === 'team1' ? 'bg-sky-400' : 'bg-amber-400'}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className={`font-bold leading-tight break-words ${won ? 'text-lime-300' : 'text-white'} ${compact ? 'text-sm' : ''}`}>
            {match[key].name} {won && '🏆'}
          </div>
          {!compact && match[key].players.map(p => p.name).join(' & ') !== match[key].name && (
            <div className="text-xs text-indigo-200/80 truncate">{match[key].players.map(p => p.name).join(' & ')}</div>
          )}
        </div>
        {serving && <Shuttle className="w-4 h-4 flex-shrink-0" />}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sets.map(s => (
            <span
              key={s.setNumber}
              title={`Set ${s.setNumber}`}
              className={`w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center tabular-nums ${
                s.winner === key ? 'bg-lime-300 text-slate-900' : 'bg-white/10 text-indigo-200'
              }`}
            >
              {s.score[key]}
            </span>
          ))}
          {live && (
            <span
              key={current?.score[key]}
              className={`w-12 text-right font-black tabular-nums animate-score-pop ${compact ? 'text-2xl' : 'text-4xl'} ${serving ? 'text-lime-300' : 'text-white'}`}
            >
              {current?.score[key] ?? 0}
            </span>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="divide-y divide-white/10">
      {row('team1')}
      {row('team2')}
    </div>
  );
};

/** Amber strip while the match is paused: why and for how long. */
const PausedBanner: React.FC<{ pause: MatchEvent; now: number }> = ({ pause, now }) => {
  const r = pauseReason(pause.kind);
  return (
    <div className="rounded-xl bg-amber-400/15 ring-1 ring-amber-300/60 px-3 py-2.5 flex items-start gap-2.5">
      <Pause className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-amber-200">
          Match paused · {r.icon} {r.label}
          <span className="ml-2 font-mono tabular-nums">{formatDuration(now - new Date(pause.at).getTime())}</span>
        </div>
        {pause.comment && <div className="text-xs text-amber-100/90 break-words mt-0.5">{pause.comment}</div>}
      </div>
    </div>
  );
};

type Shot = { key: number; path: ShotPath; kind: string | null; label: string };

/** The court from above with team names at each end and who serves to whom (plus a shot being replayed). */
const CourtPanel: React.FC<{
  match: Match;
  paused: boolean;
  big?: boolean;
  shot?: Shot | null;
  onShotDone?: () => void;
  onFullScreen?: () => void;
}> = ({ match, paused, big = false, shot, onShotDone, onFullScreen }) => {
  const [shake, setShake] = useState(0);
  const { keyAt, server, serverPlayer, receiverPlayer, serveFromRight } = courtState(match);
  return (
    <div>
      {onFullScreen && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-extrabold text-white tabular-nums">
            Set {match.currentSetNumber}
            <span className="ml-1.5 font-semibold text-slate-400">· Sets {match.score.team1}–{match.score.team2}</span>
          </span>
          <button
            onClick={onFullScreen}
            className="w-9 h-9 rounded-xl bg-lime-300 text-slate-900 hover:bg-lime-200 flex items-center justify-center transition"
            aria-label="Full screen"
            title="Full screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
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
      <div className={shake ? 'animate-court-shake' : ''} onAnimationEnd={e => e.target === e.currentTarget && setShake(0)}>
        <CourtDiagram match={match} big={big} dimmed={paused}>
          {shot && (
            <ShotAnimation
              key={shot.key}
              path={shot.path}
              kind={shot.kind}
              label={shot.label}
              onImpact={() => shot.kind === 'smash' && setShake(n => n + 1)}
              onDone={onShotDone}
            />
          )}
        </CourtDiagram>
      </div>
      <p className="mt-2 text-center text-xs text-slate-300">
        <span className="font-bold text-lime-300">{serverPlayer?.name}</span> serves from the {serveFromRight ? 'right' : 'left'} court to{' '}
        <span className="font-bold text-white">{receiverPlayer?.name}</span>
      </p>
    </div>
  );
};

/**
 * One match for viewers: score, the court with where each player stands and who serves, and the live commentary.
 * Full screen puts the court on the left and the commentary in a side panel on the right.
 */
export const MatchDetail: React.FC = () => {
  const { matchId } = useParams();
  const { matches, courts, groups, pools, isInitialized } = useTournamentStore();
  const match = matches.find(m => m.id === matchId);
  const { events, loaded } = useMatchEvents(matchId);
  const pause = match?.status === 'live' ? pauseStateOf(events) : null;
  const now = useNow(!!pause);

  /* Shot replays on the court: new moments play as they arrive; any moment can be replayed from the commentary */
  const [shot, setShot] = useState<Shot | null>(null);
  const courtRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const play = useCallback(
    (replay: NonNullable<CommentaryItem['replay']>) => {
      if (!match) return;
      setShot({ key: Date.now(), path: toDisplay(replay.path, match), kind: replay.kind, label: replay.label });
    },
    [match]
  );
  useEffect(() => {
    if (!loaded || !match) return;
    if (!seen.current) {
      seen.current = new Set(events.map(e => e.id)); // what was there on opening: don't replay the past
      return;
    }
    const fresh = events.filter(e => !seen.current!.has(e.id));
    fresh.forEach(e => seen.current!.add(e.id));
    const moment = [...fresh].reverse().find(e => e.type === 'moment' && isShotPath(e.path));
    if (moment && match.status === 'live') {
      const k = momentKind(moment.kind);
      play({ path: moment.path!, kind: moment.kind, label: `${k.icon} ${k.label} · ${moment.player_name || (moment.team ? match[moment.team].name : '')}` });
    }
  }, [events, loaded, match, play]);
  const replay = (item: CommentaryItem) => {
    if (!item.replay) return;
    // On a phone the court may be scrolled out of view: bring it back first
    const r = courtRef.current?.getBoundingClientRect();
    if (r && (r.bottom < 60 || r.top > window.innerHeight - 60)) courtRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    play(item.replay);
  };

  const [full, setFull] = useState(false);
  // Full screen: commentary side panel shown or hidden (remembered on this device)
  const [showComments, setShowComments] = useState(() => {
    try {
      return localStorage.getItem('matchView.comments') !== 'off';
    } catch {
      return true;
    }
  });
  const toggleComments = () =>
    setShowComments(on => {
      try {
        localStorage.setItem('matchView.comments', on ? 'off' : 'on');
      } catch {
        /* storage blocked: still toggles for this visit */
      }
      return !on;
    });
  const fullRef = useRef<HTMLDivElement>(null);
  const wentFullscreen = useRef(false);

  const openFull = async () => {
    setFull(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        wentFullscreen.current = true;
        // Turn the view sideways, like the referee's full screen (Android; iPhone doesn't allow it)
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
      }
    } catch {
      /* not allowed here (e.g. iPhone): the full-window view still works */
    }
  };

  const closeFull = useCallback(() => {
    setFull(false);
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
    } catch {
      /* not supported */
    }
    if (wentFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    wentFullscreen.current = false;
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFull();
    const onFs = () => {
      if (!document.fullscreenElement && wentFullscreen.current) {
        wentFullscreen.current = false;
        setFull(false);
      }
    };
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [full, closeFull]);

  useEffect(() => () => closeFull(), [closeFull]);

  if (!isInitialized) return <LoadingSpinner fullScreen size="xl" text="Loading match..." />;

  if (!match) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-bold">This match could not be found.</p>
        <Link to="/live" className="rounded-xl bg-lime-300 text-slate-900 px-4 py-2.5 font-bold">
          Back to live scores
        </Link>
      </div>
    );
  }

  const court = courts.find(c => c.id === match.courtId);
  const label = matchLabel(match, groups, pools);
  const live = match.status === 'live';
  const items = buildCommentary(match, events);

  const share = async () => {
    const url = window.location.href;
    const title = `${match.team1.name} vs ${match.team2.name}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: 'Follow this match live', url });
      } catch {
        /* dismissed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        notify('Share it with anyone to follow this match.', { tone: 'success', title: 'Link copied' });
      } catch {
        notify(url, { title: 'Share this link' });
      }
    }
  };

  const iconButton = 'w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-white flex-shrink-0';

  /* ------------------------------ Full screen: court left, commentary right ------------------------------ */
  if (full) {
    return (
      <div
        ref={fullRef}
        className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col landscape:flex-row overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
        role="dialog"
        aria-modal="true"
        aria-label="Full-screen match view"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(16,185,129,0.18),transparent_60%)]" aria-hidden="true" />

        {/* Main: score + court */}
        <section className="relative flex-1 min-w-0 min-h-0 flex flex-col p-3 sm:p-5 gap-3">
          <div className="flex items-center gap-3">
            <button onClick={closeFull} className={iconButton} aria-label="Exit full screen">
              <Minimize2 className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold truncate">
                {court?.name ?? 'Court'}
                {live && (
                  <span className="ml-2 text-xs font-bold text-slate-400 tabular-nums">
                    Set {match.currentSetNumber} · Sets {match.score.team1}–{match.score.team2}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-semibold text-lime-300 truncate">{label}</div>
            </div>
            <StatusBadge match={match} paused={!!pause} />
            <button
              onClick={toggleComments}
              className={iconButton}
              aria-pressed={showComments}
              aria-label={showComments ? 'Hide commentary' : 'Show commentary'}
              title={showComments ? 'Hide commentary' : 'Show commentary'}
            >
              {showComments ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
          {!live && (
            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4">
              <Scoreboard match={match} compact />
            </div>
          )}
          {pause && <PausedBanner pause={pause} now={now} />}
          {live ? (
            <div className="flex-1 min-h-0 flex items-center justify-center [container-type:size]">
              {/* As big as fits: room for the end labels (2.5rem) and the serve line (1.75rem) */}
              <div style={{ width: 'min(100cqw, calc((100cqh - 4.25rem) * 2))' }}>
                <CourtPanel match={match} paused={!!pause} big shot={shot} onShotDone={() => setShot(null)} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              {match.status === 'completed' ? `Final: ${match.winner?.name ?? ''} won` : 'This match has not started yet.'}
            </div>
          )}
          {live && (
            <p className="landscape:hidden flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Smartphone className="w-3.5 h-3.5 rotate-90" /> Turn your phone sideways for the best view
            </p>
          )}
        </section>

        {/* Side panel: commentary (about a third of the width in landscape, below the court in portrait); can be hidden */}
        {showComments && (
        <aside className="relative landscape:w-[32%] landscape:min-w-[17rem] landscape:max-w-[28rem] portrait:h-[42%] min-h-0 flex flex-col bg-slate-900/80 landscape:border-l portrait:border-t border-white/10">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 text-sm font-extrabold">
            <Radio className="w-4 h-4 text-red-400" /> <span className="flex-1">Live commentary</span>
            <button onClick={toggleComments} aria-label="Hide commentary" className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
            <CommentaryFeed items={items} dark onReplay={live ? replay : undefined} />
          </div>
        </aside>
        )}
      </div>
    );
  }

  /* ------------------------------ Normal page ------------------------------ */
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 w-64 h-64 rounded-full bg-lime-400/15 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-5xl mx-auto px-4 pt-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <Link to="/live" className="inline-flex items-center gap-1.5 text-sm text-indigo-200 hover:text-white py-1 -ml-1 px-1">
              <ArrowLeft className="w-4 h-4" /> Live scores
            </Link>
            <div className="flex gap-2">
              <button onClick={share} aria-label="Share" className={iconButton}>
                <Share2 className="w-5 h-5" />
              </button>
              <button onClick={openFull} className="h-10 rounded-xl bg-lime-300 text-slate-900 hover:bg-lime-200 px-3 flex items-center gap-1.5 text-sm font-extrabold transition">
                <Maximize2 className="w-4 h-4" /> Full screen
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-black leading-tight">{court?.name ?? 'Match'}</div>
              <div className="text-xs font-semibold text-lime-300 break-words">{label}</div>
            </div>
            <StatusBadge match={match} paused={!!pause} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 pb-10 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4 min-w-0">
          {/* Live: the score is on the court below, so no separate score card */}
          {!live && (
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 px-4 shadow-lg ring-1 ring-white/10">
              <Scoreboard match={match} />
            </div>
          )}
          {pause && (
            <div className="rounded-2xl bg-slate-900 p-1">
              <PausedBanner pause={pause} now={now} />
            </div>
          )}
          {live && (
            <div ref={courtRef} className="rounded-2xl bg-slate-900 p-3 sm:p-4 shadow-lg">
              <CourtPanel match={match} paused={!!pause} shot={shot} onShotDone={() => setShot(null)} onFullScreen={openFull} />
            </div>
          )}
        </div>

        <section className="rounded-2xl bg-white border border-slate-200 p-4 min-w-0">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-red-500" /> {live ? 'Live commentary' : 'Commentary'}
          </h2>
          <CommentaryFeed
            items={items}
            // About 12 rows tall, scrolling on its own
            listClassName="max-h-[30rem] overflow-y-auto overscroll-contain pr-1 -mr-1"
            onReplay={live ? replay : undefined}
            emptyText={match.status === 'upcoming' ? 'The commentary starts when the match does.' : undefined}
          />
        </section>
      </main>
    </div>
  );
};
