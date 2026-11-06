import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Public landing page: full-screen photo hero, title and a single "Live Scores" action.
 * Hero photo: "Jumping smash" by Muktasim Azlan on Unsplash (Unsplash License: free to use, no attribution
 * required), self-hosted in /public/images. Source: https://unsplash.com/photos/rjWfNR_AC5g
 */
export const HomePage: React.FC = () => (
  <div className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-slate-950 text-white flex flex-col">
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
    <main className="relative z-10 flex-1 flex items-end md:items-center px-5 pb-6 sm:pb-10">
      <div className="max-w-6xl w-full mx-auto">
        <div className="max-w-xl animate-fade-up">
          <h1 className="text-[2.75rem] leading-[0.98] sm:text-6xl lg:text-7xl font-black tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            Cubet Badminton
            <span className="block bg-gradient-to-r from-lime-200 via-lime-300 to-emerald-300 bg-clip-text text-transparent">
              Tournament
            </span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200/90 max-w-md">
            Every smash, every rally, live from every court.
          </p>

          <div className="mt-6 flex w-full sm:inline-flex sm:w-auto rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 p-1.5">
            <Link
              to="/live"
              className="group flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-lime-300 text-slate-900 font-extrabold text-base px-7 py-3.5 sm:py-3 shadow-[0_4px_12px_-6px_rgba(190,242,100,0.35)] hover:bg-lime-200 active:scale-[0.98] transition"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              Live Scores
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </main>

    <footer className="relative z-10 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="max-w-6xl mx-auto text-[11px] text-slate-400 hidden sm:block">Cubet Badminton Tournament · Season 2</div>
    </footer>
  </div>
);
