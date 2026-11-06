import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';

/**
 * App-wide replacement for window.alert / window.confirm.
 *
 *   if (await confirmDialog({ title: 'Delete team?', message: '…', confirmText: 'Delete', tone: 'danger' })) { … }
 *   await notify('Match scheduled', { tone: 'success' });
 *
 * <DialogHost /> is rendered once at the app root; requests are queued and shown one at a time.
 */

export type DialogTone = 'info' | 'success' | 'warning' | 'danger' | 'error';

interface DialogRequest {
  id: number;
  kind: 'confirm' | 'alert';
  title: string;
  message?: React.ReactNode;
  confirmText: string;
  cancelText: string;
  tone: DialogTone;
  resolve: (value: boolean) => void;
}

interface DialogState {
  queue: DialogRequest[];
  push: (request: DialogRequest) => void;
  close: (id: number, value: boolean) => void;
}

let nextId = 1;

const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  push: request => set(state => ({ queue: [...state.queue, request] })),
  close: (id, value) => {
    const request = get().queue.find(r => r.id === id);
    set(state => ({ queue: state.queue.filter(r => r.id !== id) }));
    request?.resolve(value);
  }
}));

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
}

/** Ask the user to confirm. Resolves true for the confirm button, false for cancel / Escape / backdrop. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  new Promise(resolve =>
    useDialogStore.getState().push({
      id: nextId++,
      kind: 'confirm',
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? 'Confirm',
      cancelText: options.cancelText ?? 'Cancel',
      tone: options.tone ?? 'info',
      resolve
    })
  );

const DEFAULT_TITLES: Record<DialogTone, string> = {
  info: 'Notice',
  success: 'Done',
  warning: 'Please check',
  danger: 'Are you sure?',
  error: 'Something went wrong'
};

/** Show a message with a single OK button. Resolves when it is dismissed. */
export const notify = (message: React.ReactNode, options: { title?: string; tone?: DialogTone; okText?: string } = {}): Promise<void> =>
  new Promise(resolve => {
    const tone = options.tone ?? 'info';
    useDialogStore.getState().push({
      id: nextId++,
      kind: 'alert',
      title: options.title ?? DEFAULT_TITLES[tone],
      message,
      confirmText: options.okText ?? 'OK',
      cancelText: '',
      tone,
      resolve: () => resolve()
    });
  });

/** Shortcut for showing a caught error. */
export const notifyError = (error: unknown, fallback = 'Something went wrong. Please try again.') =>
  notify(error instanceof Error && error.message ? error.message : fallback, { tone: 'error' });

const TONES: Record<DialogTone, { icon: typeof Info; iconClass: string; button: string }> = {
  info: { icon: Info, iconClass: 'bg-indigo-100 text-indigo-600', button: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  success: { icon: CheckCircle2, iconClass: 'bg-green-100 text-green-600', button: 'bg-green-600 hover:bg-green-700 text-white' },
  warning: { icon: AlertTriangle, iconClass: 'bg-amber-100 text-amber-600', button: 'bg-amber-500 hover:bg-amber-600 text-white' },
  danger: { icon: Trash2, iconClass: 'bg-red-100 text-red-600', button: 'bg-red-600 hover:bg-red-700 text-white' },
  error: { icon: XCircle, iconClass: 'bg-red-100 text-red-600', button: 'bg-slate-900 hover:bg-slate-800 text-white' }
};

/** Renders the current dialog. Mount once, near the app root. */
export const DialogHost: React.FC = () => {
  const current = useDialogStore(s => s.queue[0]);
  const close = useDialogStore(s => s.close);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!current) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(current.id, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, close]);

  if (!current) return null;
  const tone = TONES[current.tone];
  const Icon = tone.icon;
  const cancel = () => close(current.id, false);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4"
      onClick={cancel}
      role="presentation"
    >
      <div
        role={current.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`dialog-title-${current.id}`}
        className="w-full sm:max-w-sm rounded-3xl sm:rounded-2xl bg-white shadow-2xl p-5 sm:p-6 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${tone.iconClass}`}>
            <Icon className="w-6 h-6" />
          </div>
          <h2 id={`dialog-title-${current.id}`} className="mt-3 text-lg font-bold text-slate-900">
            {current.title}
          </h2>
          {current.message && <div className="mt-1.5 text-sm text-slate-600 whitespace-pre-line break-words">{current.message}</div>}
        </div>
        <div className={`mt-6 grid gap-2.5 ${current.kind === 'confirm' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {current.kind === 'confirm' && (
            <button onClick={cancel} className="rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200 transition">
              {current.cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => close(current.id, true)}
            className={`rounded-xl py-3 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${tone.button}`}
          >
            {current.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
