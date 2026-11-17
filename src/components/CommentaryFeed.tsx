import React, { useState } from 'react';
import { MessageSquare, Play, Trash2 } from 'lucide-react';
import { clockTime, type CommentaryItem } from '../utils/matchEvents';

type Filter = 'all' | 'highlights';

interface Props {
  items: CommentaryItem[];
  /** Dark = on the live / full-screen views; light = referee panel. */
  dark?: boolean;
  /** Show only the newest n (with no filter tabs). */
  limit?: number;
  /** Referee: remove a moment / comment / pause entry added by mistake. */
  onRemove?: (item: CommentaryItem) => void;
  /** Viewers: replay a moment's shot on the court. */
  onReplay?: (item: CommentaryItem) => void;
  emptyText?: string;
  className?: string;
  /** Classes for the list's own box, e.g. a max height so the list scrolls by itself under the tabs */
  listClassName?: string;
}

/**
 * Live commentary, newest first: points with the running score, moments (a smash, a drop …), pauses, comments,
 * set and match results, each with the exact time. "Highlights" hides the plain points.
 */
export const CommentaryFeed: React.FC<Props> = ({ items, onReplay, dark = false, limit, onRemove, emptyText, className = '', listClassName = '' }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = limit ? items.filter(i => i.highlight).slice(0, limit) : filter === 'highlights' ? items.filter(i => i.highlight) : items;
  const highlightCount = items.filter(i => i.highlight).length;

  const t = dark
    ? {
        tabs: 'bg-white/5 ring-1 ring-white/10',
        tabOn: 'bg-white text-slate-900',
        tabOff: 'text-slate-300 hover:text-white',
        row: 'border-white/10',
        time: 'text-slate-400',
        title: 'text-white',
        detail: 'text-slate-300',
        divider: 'text-lime-300/90 bg-white/5',
        empty: 'text-slate-400 border-white/15',
        team1: 'bg-sky-400',
        team2: 'bg-amber-400',
        score: 'bg-white/10 text-white',
        remove: 'text-slate-500 hover:text-red-400'
      }
    : {
        tabs: 'bg-slate-100',
        tabOn: 'bg-white text-slate-900 shadow-sm',
        tabOff: 'text-slate-500 hover:text-slate-800',
        row: 'border-slate-100',
        time: 'text-slate-400',
        title: 'text-slate-900',
        detail: 'text-slate-600',
        divider: 'text-indigo-700 bg-indigo-50',
        empty: 'text-slate-500 border-slate-200',
        team1: 'bg-sky-500',
        team2: 'bg-amber-400',
        score: 'bg-slate-100 text-slate-800',
        remove: 'text-slate-300 hover:text-red-500'
      };

  const scoreText = (item: CommentaryItem) => {
    if (!item.score) return null;
    const lead = item.team && item.kind === 'point' ? item.team : null;
    return (
      <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums ${t.score}`}>
        <span className={lead === 'team1' ? 'underline decoration-2 underline-offset-2' : ''}>{item.score.team1}</span>–
        <span className={lead === 'team2' ? 'underline decoration-2 underline-offset-2' : ''}>{item.score.team2}</span>
      </span>
    );
  };

  // A "Set n" divider whenever the set changes going down the list
  let lastSet: number | undefined;

  return (
    <div className={className}>
      {!limit && (
        <div className={`flex gap-1 rounded-lg p-1 mb-3 ${t.tabs}`} role="tablist" aria-label="Commentary filter">
          {(
            [
              ['all', `Everything · ${items.length}`],
              ['highlights', `Highlights · ${highlightCount}`]
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${filter === id ? t.tabOn : t.tabOff}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className={`rounded-xl border border-dashed p-5 text-center text-sm ${t.empty}`}>
          <MessageSquare className="w-5 h-5 mx-auto mb-1.5 opacity-60" />
          {emptyText ?? 'Nothing yet. Points, moments and pauses show up here as they happen.'}
        </div>
      ) : (
        <ol className={`space-y-0 ${listClassName}`}>
          {shown.map(item => {
            const showDivider = !limit && item.setNumber != null && item.setNumber !== lastSet;
            if (item.setNumber != null) lastSet = item.setNumber;
            const isPoint = item.kind === 'point';
            return (
              <React.Fragment key={item.id}>
                {showDivider && (
                  <li className={`mt-2 mb-1 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-widest ${t.divider}`}>
                    Set {item.setNumber}
                  </li>
                )}
                <li className={`flex items-start gap-2.5 border-b last:border-0 py-2 ${t.row}`}>
                  <span className={`w-[4.25rem] flex-shrink-0 pt-0.5 text-[10px] font-semibold tabular-nums whitespace-nowrap ${t.time}`}>{clockTime(item.at)}</span>
                  {item.team && (
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.team === 'team1' ? t.team1 : t.team2}`} aria-hidden="true" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm leading-snug break-words ${t.title}`}>
                      {!isPoint && <span className="mr-1">{item.icon}</span>}
                      {item.title}
                    </div>
                    {item.detail && <div className={`text-xs mt-0.5 break-words ${t.detail}`}>{item.detail}</div>}
                  </div>
                  {onReplay && item.replay && (
                    <button
                      type="button"
                      onClick={() => onReplay(item)}
                      aria-label={`Replay ${item.title}`}
                      title="Replay on the court"
                      className={`flex-shrink-0 w-7 h-7 -my-0.5 rounded-full flex items-center justify-center transition active:scale-90 ${
                        dark ? 'bg-lime-300 text-slate-900 hover:bg-lime-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
                    </button>
                  )}
                  {scoreText(item)}
                  {onRemove && item.eventId && item.kind !== 'set_end' && item.kind !== 'match_end' && item.kind !== 'start' && (
                    <button
                      type="button"
                      onClick={() => onRemove(item)}
                      aria-label="Remove"
                      className={`p-1 -m-1 flex-shrink-0 rounded ${t.remove}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
};
