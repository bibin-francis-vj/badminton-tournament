import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Crown, Timer } from 'lucide-react';
import { formatCountdown, usePredictionSettings } from '../hooks/usePredictionSettings';

/**
 * Public landing page: full-screen photo hero, title, a "Live Scores" action and a "Predict & Win" action.
 * Hero photo: "Jumping smash" by Muktasim Azlan on Unsplash (Unsplash License: free to use, no attribution
 * required), self-hosted in /public/images. Source: https://unsplash.com/photos/rjWfNR_AC5g
 */
/**
 * Phones: the page is exactly one screen tall, so both buttons are always in view.
 * Uses the real visible height (innerHeight) because in-app browsers such as WhatsApp's
 * may not support 100dvh and 100vh there includes the toolbars.
 */
const useScreenHeight = () => {
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
    set();
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', set);
    return () => {
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', set);
    };
  }, []);
};

export const HomePage: React.FC = () => {
  useScreenHeight();
  const { closed, msLeft, logins } = usePredictionSettings();

  return (
    <div className="relative h-[var(--app-h,100dvh)] md:h-auto md:min-h-screen overflow-hidden bg-slate-950 text-white flex flex-col">
      {/* Photo (portrait crop on phones, full frame on larger screens) with a slow zoom */}
      <picture className="absolute inset-0" aria-hidden="true">
        <source media="(max-width: 767px)" srcSet="/images/hero-smash-portrait.webp" type="image/webp" />
        <source srcSet="/images/hero-smash.webp" type="image/webp" />
        <img
          src="/images/hero-smash.jpg"
          alt=""
          className="w-full h-full object-cover object-[50%_20%] md:object-[60%_35%] animate-kenburns"
          decoding="async"
        />
      </picture>

      {/* Overlays: darken top for the header, blend bottom into navy for the title, brand tint */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/80 to-transparent" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 via-35% to-transparent to-65% md:bg-gradient-to-r md:from-slate-950 md:via-slate-950/75 md:via-40% md:to-transparent md:to-75%"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-indigo-950/25 mix-blend-multiply" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-lime-400/10 blur-3xl hidden md:block" aria-hidden="true" />

      {/* Header */}
      <header className="relative z-10 px-5 pt-5 sm:pt-7">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-extrabold tracking-[0.25em]">
            <span className="w-2 h-2 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.9)]" />
            CUBET
          </span>
          <span className="rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[11px] font-bold uppercase tracking-widest px-3 py-1">
            Season 2
          </span>
        </div>
      </header>

      {/* Title + action */}
      <main className="relative z-10 flex-1 min-h-0 flex items-end md:items-center px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-10 [@media(max-height:680px)]:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-6xl w-full mx-auto">
          <div className="max-w-xl animate-fade-up">
            <h1 className="text-[2.75rem] leading-[0.98] sm:text-6xl lg:text-7xl [@media(max-height:680px)]:text-4xl sm:[@media(max-height:680px)]:!text-5xl font-black tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              Cubet Badminton
              <span className="block bg-gradient-to-r from-lime-200 via-lime-300 to-emerald-300 bg-clip-text text-transparent">
                Tournament
              </span>
            </h1>
            <p className="mt-4 [@media(max-height:680px)]:mt-2 text-base sm:text-lg [@media(max-height:680px)]:text-sm text-slate-200/90 max-w-md">
              Every smash, every rally, live from every court.
            </p>

            <div className="mt-6 [@media(max-height:680px)]:mt-4 flex flex-col sm:flex-row gap-3 [@media(max-height:680px)]:gap-2 w-full sm:w-auto">
              <div className="flex w-full sm:w-auto rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 p-1.5">
              <Link
                to="/live"
                className="group flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-lime-300 text-slate-900 font-extrabold text-base px-7 py-3.5 sm:py-3 [@media(max-height:680px)]:py-3 shadow-[0_4px_12px_-6px_rgba(190,242,100,0.35)] hover:bg-lime-200 active:scale-[0.98] transition"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                Live Scores
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              </div>
              <Link
                to="/predict"
                className="group flex flex-col w-full sm:w-auto items-center justify-center gap-1 rounded-2xl bg-slate-950/40 backdrop-blur-xl text-white px-7 py-3 sm:py-2.5 [@media(max-height:680px)]:py-2.5 border border-lime-300/40 hover:bg-slate-950/60 hover:border-lime-300/70 active:scale-[0.98] transition"
              >
                <span className="flex items-center gap-2.5 font-extrabold text-base">
                  <Crown className="w-4 h-4 text-lime-300" />
                  Predict & Win
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
                {/* Live countdown to the prediction close time (hidden until the real time has loaded) */}
                <span
                  className={`flex items-center gap-1.5 text-xs font-bold tabular-nums transition-opacity ${
                    logins.loaded ? 'opacity-100' : 'opacity-0'
                  } ${closed ? 'text-slate-300' : 'text-lime-300'}`}
                >
                  <Timer className="w-3.5 h-3.5" />
                  {closed ? 'Picks closed · See the leaderboard' : `Picks close in ${formatCountdown(msLeft)}`}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] hidden sm:block [@media(max-height:680px)]:!hidden">
        <div className="max-w-6xl mx-auto text-[11px] text-slate-400 hidden sm:block">Cubet Badminton Tournament · Season 2</div>
      </footer>
    </div>
  );
};
