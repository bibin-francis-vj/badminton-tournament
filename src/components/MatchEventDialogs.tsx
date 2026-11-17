import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Loader2, MessageSquarePlus, Pause, Play, Sparkles, X } from 'lucide-react';
import type { Match } from '../types';
import { MOMENT_KINDS, PAUSE_REASONS, momentKind } from '../utils/matchEvents';
import { autoPath, toSaved, type Pt, type ShotPath } from '../utils/shotPath';
import { CourtDiagram, courtState } from './CourtDiagram';
import { ShotAnimation } from './ShotAnimation';

type Side = 'team1' | 'team2';

/** Bottom sheet on phones, centred card on bigger screens. Sits above the full-screen scoring view. */
const Sheet: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
  footer
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-[2px] p-2 sm:p-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full sm:max-w-lg ls:max-w-3xl max-h-[92dvh] flex flex-col rounded-3xl sm:rounded-2xl bg-white shadow-2xl animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 ls:pt-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">{title}</h2>
            {subtitle && <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 ls:py-3 space-y-4 ls:space-y-3">{children}</div>
        <div className="px-5 pb-5 ls:pb-3 pt-1">{footer}</div>
      </div>
    </div>,
    document.body
  );
};

const chip = (on: boolean, tone: 'sky' | 'amber' | 'slate' = 'slate') =>
  `flex items-center gap-1.5 rounded-xl px-3 py-2.5 ls:py-2 text-sm font-semibold ring-1 transition active:scale-95 text-left ${
    on
      ? tone === 'sky'
        ? 'bg-sky-600 text-white ring-sky-600'
        : tone === 'amber'
          ? 'bg-amber-400 text-slate-900 ring-amber-400'
          : 'bg-slate-900 text-white ring-slate-900'
      : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-400'
  }`;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{children}</div>
);

const NoteField: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }> = ({
  value,
  onChange,
  placeholder,
  autoFocus
}) => (
  <div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value.slice(0, 300))}
      placeholder={placeholder}
      rows={2}
      autoFocus={autoFocus}
      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
    />
    <div className="text-right text-[11px] text-slate-400">{value.length}/300</div>
  </div>
);

const SaveButton: React.FC<{ onClick: () => void; disabled: boolean; busy: boolean; children: React.ReactNode; className?: string }> = ({
  onClick,
  disabled,
  busy,
  children,
  className = 'bg-indigo-600 hover:bg-indigo-700 text-white'
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-extrabold transition disabled:opacity-40 ${className}`}
  >
    {busy && <Loader2 className="w-5 h-5 animate-spin" />}
    {children}
  </button>
);

/* ------------------------------------------------------------------------------------------- */

export interface MomentInput {
  team: Side;
  playerId: string | null;
  playerName: string | null;
  kind: string;
  comment: string;
  path: ShotPath; // saved coordinates (team 1 at the left end)
}

/**
 * The court to draw the shot on: drag from where it was hit to where it landed, or tap the two spots.
 * Until something is drawn, a suggested path (from the player to a fitting spot) is shown dashed and is what gets saved.
 */
const ShotDrawer: React.FC<{
  match: Match;
  team: Side;
  kind: string | null;
  label: string;
  drawn: ShotPath | null;
  suggested: ShotPath;
  onDraw: (path: ShotPath | null) => void;
}> = ({ match, team, kind, label, drawn, suggested, onDraw }) => {
  const layer = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<ShotPath | null>(null);
  const [tapFrom, setTapFrom] = useState<Pt | null>(null);
  const [preview, setPreview] = useState(0);
  const [shake, setShake] = useState(0);
  const dragging = useRef(false);
  const color = courtState(match).endOf(team) === 'left' ? '#38bdf8' : '#fbbf24';

  const pointAt = (e: React.PointerEvent): Pt => {
    const r = layer.current!.getBoundingClientRect();
    const clamp = (n: number) => Math.min(0.99, Math.max(0.01, n));
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    layer.current?.setPointerCapture(e.pointerId);
    dragging.current = true;
    setPreview(0);
    const p = pointAt(e);
    setDraft({ from: tapFrom ?? p, to: p });
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const p = pointAt(e);
    setDraft(d => (d ? { ...d, to: p } : d));
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const p = pointAt(e);
    const from = draft?.from ?? p;
    setDraft(null);
    if (Math.hypot((p.x - from.x) * 2, p.y - from.y) < 0.06) {
      // A tap: first tap = where it was hit, second tap = where it landed
      if (!tapFrom) return setTapFrom(p);
      setTapFrom(null);
      onDraw({ from: tapFrom, to: p });
      setPreview(n => n + 1);
      return;
    }
    setTapFrom(null);
    onDraw({ from, to: p });
    setPreview(n => n + 1); // play it straight away
  };

  const shown = draft ?? drawn;
  const line = (path: ShotPath, dashed: boolean) => (
    <g>
      <line
        x1={path.from.x * 200}
        y1={path.from.y * 100}
        x2={path.to.x * 200}
        y2={path.to.y * 100}
        stroke={dashed ? '#ffffff' : color}
        strokeOpacity={dashed ? 0.55 : 1}
        strokeWidth={dashed ? 0.8 : 1.3}
        strokeDasharray={dashed ? '2 1.6' : undefined}
        markerEnd={`url(#${dashed ? 'arrow-auto' : 'arrow-drawn'})`}
        strokeLinecap="round"
      />
      <circle cx={path.from.x * 200} cy={path.from.y * 100} r="1.6" fill={dashed ? '#ffffff' : color} fillOpacity={dashed ? 0.6 : 1} />
    </g>
  );

  const playing = preview > 0 ? (drawn ?? suggested) : null;

  return (
    <div className="rounded-2xl bg-slate-900 p-2.5 ls:max-w-md ls:mx-auto">
      <div className={shake ? 'animate-court-shake' : ''} onAnimationEnd={e => e.target === e.currentTarget && setShake(0)}>
        <CourtDiagram match={match}>
          <svg
            ref={layer}
            viewBox="0 0 200 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full z-20 cursor-crosshair touch-none select-none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              dragging.current = false;
              setDraft(null);
            }}
            role="img"
            aria-label="Draw the shot: drag from where it was hit to where it landed"
          >
            <defs>
              <marker id="arrow-drawn" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill={color} />
              </marker>
              <marker id="arrow-auto" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="#ffffff" fillOpacity="0.6" />
              </marker>
            </defs>
            {!playing && (shown ? line(shown, false) : !tapFrom && line(suggested, true))}
            {tapFrom && !draft && (
              <circle cx={tapFrom.x * 200} cy={tapFrom.y * 100} r="2.2" fill={color}>
                <animate attributeName="r" values="1.6;3;1.6" dur="1s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
          {playing && (
            <ShotAnimation
              key={preview}
              path={playing}
              kind={kind}
              label={label}
              onImpact={() => kind === 'smash' && setShake(n => n + 1)}
              onDone={() => setPreview(0)}
            />
          )}
        </CourtDiagram>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <p className="flex-1 min-w-0 text-[11px] leading-snug text-slate-300">
          {tapFrom
            ? 'Now tap where it landed.'
            : drawn
              ? 'Your line is saved with the moment.'
              : 'Drag from where it was hit to where it landed (or tap both). Dashed = automatic.'}
        </p>
        {drawn && (
          <button
            type="button"
            onClick={() => {
              onDraw(null);
              setPreview(0);
            }}
            className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20"
          >
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setPreview(n => n + 1)}
          className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-lime-300 px-2.5 py-1.5 text-xs font-extrabold text-slate-900 hover:bg-lime-200"
        >
          <Play className="w-3.5 h-3.5" fill="currentColor" /> Preview
        </button>
      </div>
    </div>
  );
};

/** Capture a moment for one team: who (a player or the pair), what (smash, drop …) and an optional note. */
export const MomentDialog: React.FC<{ match: Match; team: Side; onClose: () => void; onSave: (m: MomentInput) => Promise<void> }> = ({
  match,
  team,
  onClose,
  onSave
}) => {
  // Ready to save straight away: the first player and the first kind of moment are picked
  const [playerId, setPlayerId] = useState<string | null>(() => match[team].players[0]?.id ?? null);
  const [kind, setKind] = useState<string | null>(() => MOMENT_KINDS[0].id);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState<ShotPath | null>(null);
  const court = courtState(match);
  const tone = court.endOf(team) === 'left' ? 'sky' : 'amber';
  // Only the team that is serving can hit an ace, and only its current server
  const serving = court.server === team;
  const serverId = serving ? court.serverPlayer?.id ?? null : null;
  const kinds = MOMENT_KINDS.filter(m => m.id !== 'serve' || serving);
  // A long rally belongs to the pair; every other moment is one player's
  const teamMoment = kind === 'rally';
  const chooseKind = (id: string) => {
    setKind(id);
    if (id === 'serve') setPlayerId(serverId);
  };
  const missing = !kind ? 'Pick what happened' : !teamMoment && !playerId ? 'Pick who did it' : null;
  const picked = match[team].players.find(p => p.id === playerId);
  const player = teamMoment ? undefined : picked; // a long rally is saved for the pair
  const set = match.sets?.find(s => s.setNumber === match.currentSetNumber);
  // A fresh suggestion when the player or the kind of shot changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggested = useMemo(() => autoPath(match, team, kind === 'rally' ? null : playerId, kind), [match.id, team, playerId, kind]);
  const k = momentKind(kind);

  const save = async () => {
    if (!kind || missing) return;
    setBusy(true);
    try {
      await onSave({
        team,
        playerId: player?.id ?? null,
        playerName: player?.name ?? null,
        kind,
        comment: comment.trim(),
        path: toSaved(drawn ?? suggested, match)
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={
        <>
          <Sparkles className="w-5 h-5 text-indigo-600" /> Match moment
        </>
      }
      subtitle={
        <>
          <b className="text-slate-800">{match[team].name}</b> · Set {match.currentSetNumber} · {set?.score.team1 ?? 0}–{set?.score.team2 ?? 0}
        </>
      }
      onClose={onClose}
      footer={
        <SaveButton onClick={save} disabled={!!missing} busy={busy}>
          {missing ?? 'Save moment'}
        </SaveButton>
      }
    >
      <div className={teamMoment ? 'opacity-50' : ''}>
        <Label>{teamMoment ? 'Who · a long rally counts for the pair' : 'Who'}</Label>
        <div className="grid grid-cols-2 gap-2">
          {match[team].players.map(p => {
            // An ace can only be the player serving right now
            const locked = (kind === 'serve' && p.id !== serverId) || teamMoment;
            return (
              <button
                key={p.id}
                type="button"
                disabled={locked}
                onClick={() => setPlayerId(p.id)}
                className={`${chip(!teamMoment && playerId === p.id, tone)} disabled:opacity-35 disabled:cursor-not-allowed`}
              >
                {p.name}
                {kind === 'serve' && p.id === serverId && <span className="ml-auto text-[10px] font-black uppercase opacity-80">Serving</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <Label>What</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 ls:grid-cols-4 gap-2">
          {kinds.map(k => (
            <button key={k.id} type="button" onClick={() => chooseKind(k.id)} className={chip(kind === k.id)}>
              <span className="text-base leading-none">{k.icon}</span>
              <span className="min-w-0 truncate">{k.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Draw the shot (optional)</Label>
        <ShotDrawer
          match={match}
          team={team}
          kind={kind}
          label={`${k.icon} ${kind ? k.label : 'Shot'} · ${player?.name ?? match[team].name}`}
          drawn={drawn}
          suggested={suggested}
          onDraw={setDrawn}
        />
      </div>
      <div>
        <Label>Note (optional)</Label>
        <NoteField value={comment} onChange={setComment} placeholder={kind === 'other' ? 'What happened?' : 'e.g. Behind-the-back return'} />
      </div>
    </Sheet>
  );
};

/** Pause the match: why (injury, shuttle change …) and an optional note. Points are blocked until resumed. */
export const PauseDialog: React.FC<{ onClose: () => void; onSave: (reason: string, comment: string) => Promise<void> }> = ({ onClose, onSave }) => {
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await onSave(reason, comment.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={
        <>
          <Pause className="w-5 h-5 text-amber-500" /> Pause match
        </>
      }
      subtitle="Scoring stops until you resume. Everyone watching sees the match is paused."
      onClose={onClose}
      footer={
        <SaveButton onClick={save} disabled={!reason} busy={busy} className="bg-amber-400 hover:bg-amber-300 text-slate-900">
          <Pause className="w-5 h-5" /> {reason ? 'Pause match' : 'Pick a reason'}
        </SaveButton>
      }
    >
      <div>
        <Label>Reason</Label>
        <div className="grid grid-cols-2 ls:grid-cols-4 gap-2">
          {PAUSE_REASONS.map(r => (
            <button key={r.id} type="button" onClick={() => setReason(r.id)} className={chip(reason === r.id, 'amber')}>
              <span className="text-base leading-none">{r.icon}</span>
              <span className="min-w-0 truncate">{r.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Comment (optional)</Label>
        <NoteField value={comment} onChange={setComment} placeholder="e.g. Akhil twisted his ankle, physio on court" />
      </div>
    </Sheet>
  );
};

/** A free comment for the commentary (e.g. "Crowd on their feet!"). */
export const NoteDialog: React.FC<{ onClose: () => void; onSave: (comment: string) => Promise<void> }> = ({ onClose, onSave }) => {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await onSave(comment.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={
        <>
          <MessageSquarePlus className="w-5 h-5 text-indigo-600" /> Add comment
        </>
      }
      subtitle="Shows in the live commentary with the time."
      onClose={onClose}
      footer={
        <SaveButton onClick={save} disabled={!comment.trim()} busy={busy}>
          Post comment
        </SaveButton>
      }
    >
      <NoteField value={comment} onChange={setComment} placeholder="e.g. What a rally! Crowd on their feet" autoFocus />
    </Sheet>
  );
};
