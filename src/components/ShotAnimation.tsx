import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Pt, ShotPath } from '../utils/shotPath';

/*
 * A shot replayed on the top-down court: the shuttle flies along the drawn line with height (it lifts off the
 * floor: bigger, with its shadow left on the court), turns cork-first along its flight, and lands with an impact.
 * Each kind of shot has its own flight and look:
 *   smash  fast and steep, fire trail and sparks, blast + court shake on impact
 *   drop   slow floating arc that dies just over the net, soft puff
 *   clear  high, long arc to the back
 *   drive  flat and fast, speed streaks
 *   net    short sharp tap down
 *   rally  back and forth before the last shot
 * Coordinates: the court is a 200 × 100 box (2:1, the same as the diagram).
 */

type Trail = 'fire' | 'feather' | 'speed' | 'arc' | 'flash' | 'magic';
type Impact = 'blast' | 'puff' | 'snap' | 'line' | 'soft';

interface Leg {
  from: Pt; // 0–1
  to: Pt;
  dur: number; // ms
  z0: number; // height at the hit (0 = floor, 1 ≈ high)
  z1: number; // height at the end
  peak: number; // extra height in the middle (an arc)
  ease: (t: number) => number; // how fast it travels along the line
  trail: Trail;
}

interface Profile {
  legs: (path: ShotPath) => Leg[];
  impact: Impact;
  color: string; // badge / ring colour
}

const linear = (t: number) => t;
const accelerate = (t: number) => 0.35 * t + 0.65 * t * t; // smash: gets faster
const decelerate = (t: number) => 1 - Math.pow(1 - t, 2.4); // drop: hangs, then slows to a stop
const sharp = (t: number) => Math.pow(t, 1.3);

const single = (dur: number, z0: number, z1: number, peak: number, ease: (t: number) => number, trail: Trail) => (p: ShotPath): Leg[] => [
  { from: p.from, to: p.to, dur, z0, z1, peak, ease, trail }
];

const jitter = (q: Pt, by: number): Pt => ({
  x: Math.min(0.97, Math.max(0.03, q.x + (Math.random() - 0.5) * by)),
  y: Math.min(0.95, Math.max(0.05, q.y + (Math.random() - 0.5) * by * 2))
});

const PROFILES: Record<string, Profile> = {
  smash: { legs: single(620, 0.95, 0, 0, accelerate, 'fire'), impact: 'blast', color: '#f97316' },
  drop: { legs: single(1650, 0.65, 0, 0.32, decelerate, 'feather'), impact: 'puff', color: '#e2e8f0' },
  net: { legs: single(430, 0.45, 0, 0.05, sharp, 'flash'), impact: 'snap', color: '#fde047' },
  clear: { legs: single(1750, 0.55, 0, 1.0, linear, 'arc'), impact: 'soft', color: '#a5f3fc' },
  drive: { legs: single(520, 0.32, 0.04, 0.04, linear, 'speed'), impact: 'snap', color: '#38bdf8' },
  serve: { legs: single(1000, 0.22, 0, 0.36, linear, 'arc'), impact: 'soft', color: '#bef264' },
  line: { legs: single(1650, 0.55, 0, 0.95, linear, 'arc'), impact: 'line', color: '#bef264' },
  defence: { legs: single(1300, 0.08, 0, 0.9, linear, 'arc'), impact: 'soft', color: '#a5b4fc' },
  dive: { legs: single(950, 0.04, 0, 0.55, linear, 'arc'), impact: 'soft', color: '#fda4af' },
  trick: { legs: single(1150, 0.4, 0, 0.5, linear, 'magic'), impact: 'puff', color: '#d8b4fe' },
  rally: {
    legs: p => {
      const back = jitter(p.from, 0.12);
      const there = jitter(p.to, 0.12);
      return [
        { from: p.from, to: there, dur: 650, z0: 0.4, z1: 0.35, peak: 0.45, ease: linear, trail: 'arc' },
        { from: there, to: back, dur: 650, z0: 0.35, z1: 0.4, peak: 0.45, ease: linear, trail: 'arc' },
        { from: back, to: p.to, dur: 560, z0: 0.4, z1: 0, peak: 0.1, ease: accelerate, trail: 'speed' }
      ];
    },
    impact: 'snap',
    color: '#bef264'
  },
  other: { legs: single(1100, 0.5, 0, 0.4, linear, 'arc'), impact: 'soft', color: '#e2e8f0' }
};

const IMPACT_MS = 1100;
const ALT = 20; // how far up the screen (court units) the shuttle is drawn at height 1
const W = 200;
const H = 100;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  r: number;
  color: string;
}

interface Props {
  path: ShotPath; // diagram coordinates
  kind: string | null;
  /** Badge at the landing spot, e.g. "💥 Smash · Anto". */
  label?: string;
  onImpact?: () => void;
  onDone?: () => void;
}

/** The shuttle: feathers behind, cork in front (pointing along +x), drawn around (0, 0). */
const ShuttleSprite: React.FC = () => (
  <g>
    <path d="M1.4 -1.1 L-4.6 -2.9 Q-5.4 0 -4.6 2.9 L1.4 1.1 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.25" />
    <path d="M1.2 -0.6 L-4.8 -1.4 M1.2 0.6 L-4.8 1.4 M1.2 0 L-5 0" stroke="#cbd5e1" strokeWidth="0.2" />
    <path d="M-2.4 -2.2 Q-2.7 0 -2.4 2.2" stroke="#94a3b8" strokeWidth="0.25" fill="none" />
    <rect x="0.9" y="-1.15" width="0.9" height="2.3" rx="0.3" fill="#bef264" />
    <circle cx="2.4" cy="0" r="1.35" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.25" />
  </g>
);

export const ShotAnimation: React.FC<Props> = ({ path, kind, label, onImpact, onDone }) => {
  const profile = PROFILES[kind ?? 'other'] ?? PROFILES.other;
  const reduce = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const legs = useMemo(() => profile.legs(path).map(l => (reduce ? { ...l, dur: l.dur * 0.6 } : l)), [profile, path, reduce]);
  const flightMs = legs.reduce((s, l) => s + l.dur, 0);
  const total = flightMs + IMPACT_MS;

  const [now, setNow] = useState(0); // ms since start
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);
  const particles = useRef<Particle[]>([]);
  const impacted = useRef(false);
  // Start pointing from the hit towards the landing spot
  const last = useRef<{ x: number; y: number; a: number }>({
    x: legs[0].from.x * W,
    y: legs[0].from.y * H - legs[0].z0 * ALT,
    a: Math.atan2((legs[0].to.y - legs[0].from.y) * H, (legs[0].to.x - legs[0].from.x) * W)
  });

  // Animation clock
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const el = t - start;
      setNow(el);
      if (el < total) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  /* --- Where the shuttle is now --- */
  let flying = now < flightMs;
  let legIndex = 0;
  let acc = 0;
  while (legIndex < legs.length - 1 && now >= acc + legs[legIndex].dur) acc += legs[legIndex++].dur;
  const leg = legs[legIndex];
  const t = Math.min(1, Math.max(0, (now - acc) / leg.dur));
  const s = leg.ease(t);
  const gx = (leg.from.x + (leg.to.x - leg.from.x) * s) * W; // ground point (shadow)
  const gy = (leg.from.y + (leg.to.y - leg.from.y) * s) * H;
  let z = leg.z0 * (1 - t) + leg.z1 * t + leg.peak * 4 * t * (1 - t);

  const landing = { x: legs[legs.length - 1].to.x * W, y: legs[legs.length - 1].to.y * H };
  const ip = flying ? 0 : Math.min(1, (now - flightMs) / IMPACT_MS); // impact progress
  if (!flying) {
    flying = false;
    // a small bounce after landing
    z = ip < 0.25 ? 0.1 * Math.sin((Math.PI * ip) / 0.25) : 0;
  }
  const hx = flying ? gx : landing.x + Math.min(ip / 0.25, 1) * 2.5 * Math.cos(last.current.a);
  const hy0 = flying ? gy : landing.y + Math.min(ip / 0.25, 1) * 2.5 * Math.sin(last.current.a);
  const hy = hy0 - z * ALT; // drawn up the screen by its height

  // Direction of travel (screen), for turning the shuttle cork-first
  const dx = hx - last.current.x;
  const dy = hy - last.current.y;
  const angle = flying && Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) : last.current.a;

  /* --- Side effects of this frame: trail, sparks, impact --- */
  if (flying) {
    trail.current.push({ x: hx, y: hy, t: now });
    if (leg.trail === 'fire' || leg.trail === 'magic') {
      const n = leg.trail === 'fire' ? (Math.random() < 0.5 ? 1 : 0) : 1;
      for (let i = 0; i < n; i++) {
        particles.current.push({
          x: hx,
          y: hy,
          vx: -Math.cos(angle) * (0.02 + Math.random() * 0.03) + (Math.random() - 0.5) * 0.03,
          vy: -Math.sin(angle) * (0.02 + Math.random() * 0.03) + (Math.random() - 0.5) * 0.03,
          born: now,
          life: 180 + Math.random() * 160,
          r: leg.trail === 'fire' ? 0.3 + Math.random() * 0.4 : 0.4 + Math.random() * 0.5,
          color: leg.trail === 'fire' ? ['#fde047', '#fb923c', '#ef4444'][Math.floor(Math.random() * 3)] : ['#e9d5ff', '#c084fc', '#f0abfc'][Math.floor(Math.random() * 3)]
        });
      }
    }
  }
  if (!flying && !impacted.current) {
    impacted.current = true;
    onImpact?.();
    const burst = profile.impact === 'blast' ? 9 : profile.impact === 'puff' ? 9 : 6;
    for (let i = 0; i < burst; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (profile.impact === 'blast' ? 0.03 : 0.018) * (0.4 + Math.random());
      particles.current.push({
        x: landing.x,
        y: landing.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6,
        born: now,
        life: profile.impact === 'blast' ? 350 + Math.random() * 250 : 600 + Math.random() * 400,
        r: profile.impact === 'blast' ? 0.35 + Math.random() * 0.5 : 0.6 + Math.random() * 0.8,
        color: profile.impact === 'blast' ? ['#fde68a', '#fb923c', '#ffffff'][Math.floor(Math.random() * 3)] : 'rgba(255,255,255,0.8)'
      });
    }
  }
  last.current = { x: hx, y: hy, a: angle };
  const trailKeep = leg.trail === 'feather' || leg.trail === 'arc' ? 420 : leg.trail === 'fire' ? 160 : 220;
  trail.current = trail.current.filter(p => now - p.t < trailKeep);
  particles.current = particles.current.filter(p => now - p.born < p.life);

  /* --- Drawing --- */
  const fade = !flying && ip > 0.72 ? 1 - (ip - 0.72) / 0.28 : 1;
  const scale = 1 + z * 0.75;
  const shadowR = 2.4 * (1 - Math.min(z, 1) * 0.45);
  const shadowOpacity = 0.42 * (1 - Math.min(z, 1) * 0.6);
  const sx = flying ? gx : hx;
  const sy = flying ? gy : hy0;

  const pts = trail.current;
  const segs = pts.slice(1).map((p, i) => {
    const prev = pts[i];
    const age = 1 - (now - p.t) / trailKeep; // 1 = newest
    return { p, prev, age };
  });

  const trailStroke = (age: number): { stroke: string; width: number; opacity: number } => {
    switch (leg.trail) {
      case 'fire':
        return { stroke: age > 0.6 ? '#fde68a' : '#fb923c', width: 0.3 + age * 1.6, opacity: age * 0.7 };
      case 'speed':
        return { stroke: '#7dd3fc', width: 0.3 + age * 1.6, opacity: age * 0.9 };
      case 'flash':
        return { stroke: '#fefce8', width: 0.4 + age * 2.2, opacity: age };
      case 'magic':
        return { stroke: '#c084fc', width: 0.3 + age * 1.6, opacity: age * 0.8 };
      case 'feather':
        return { stroke: '#ffffff', width: 0.2 + age * 1.1, opacity: age * 0.5 };
      default:
        return { stroke: '#ffffff', width: 0.25 + age * 1.2, opacity: age * 0.55 };
    }
  };

  // Badge position as % of the court (kept inside the court)
  const badgeX = Math.min(82, Math.max(18, (landing.x / W) * 100));
  const badgeY = Math.min(80, Math.max(16, (landing.y / H) * 100 - 14));

  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ opacity: fade }} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <filter id="shot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="shot-flash">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor={profile.color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={profile.color} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Where it is going: a faint dashed guide on the floor (fades as it gets there) */}
        {flying && (
          <line
            x1={legs[0].from.x * W}
            y1={legs[0].from.y * H}
            x2={landing.x}
            y2={landing.y}
            stroke="#ffffff"
            strokeOpacity={0.18 * (1 - now / flightMs)}
            strokeWidth="0.5"
            strokeDasharray="1.5 1.5"
          />
        )}

        {/* Hit flash at the start of each leg */}
        {legs.map((l, i) => {
          const begin = legs.slice(0, i).reduce((a, x) => a + x.dur, 0);
          const p = (now - begin) / 260;
          if (p < 0 || p > 1) return null;
          return (
            <circle
              key={i}
              cx={l.from.x * W}
              cy={l.from.y * H - l.z0 * ALT}
              r={1.5 + p * 7}
              fill="none"
              stroke="#ffffff"
              strokeWidth={0.8 * (1 - p)}
              strokeOpacity={1 - p}
            />
          );
        })}

        {/* Landing target while it flies */}
        {flying && (
          <g opacity={0.55 + 0.45 * Math.sin(now / 90)}>
            <circle cx={landing.x} cy={landing.y} r="2.6" fill="none" stroke={profile.color} strokeWidth="0.5" />
            <circle cx={landing.x} cy={landing.y} r="0.7" fill={profile.color} />
          </g>
        )}

        {/* Shadow on the floor */}
        <ellipse cx={sx} cy={sy} rx={shadowR} ry={shadowR * 0.55} fill="#000000" opacity={shadowOpacity} />

        {/* Trail */}
        <g filter={leg.trail === 'fire' || leg.trail === 'magic' || leg.trail === 'flash' ? 'url(#shot-glow)' : undefined} strokeLinecap="round">
          {flying &&
            segs.map(({ p, prev, age }, i) => {
              const st = trailStroke(age);
              return <line key={i} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={st.stroke} strokeWidth={st.width} strokeOpacity={st.opacity} />;
            })}
          {/* speed streaks either side of a drive */}
          {flying && leg.trail === 'speed' &&
            [-1.6, 1.6].map(o => (
              <line
                key={o}
                x1={hx - Math.cos(angle) * 9 - Math.sin(angle) * o}
                y1={hy - Math.sin(angle) * 9 + Math.cos(angle) * o}
                x2={hx - Math.cos(angle) * 3 - Math.sin(angle) * o}
                y2={hy - Math.sin(angle) * 3 + Math.cos(angle) * o}
                stroke="#e0f2fe"
                strokeWidth="0.35"
                strokeOpacity="0.8"
              />
            ))}
        </g>

        {/* Sparks / dust */}
        <g>
          {particles.current.map((q, i) => {
            const age = now - q.born;
            const k = 1 - age / q.life;
            return <circle key={i} cx={q.x + q.vx * age} cy={q.y + q.vy * age} r={q.r * (0.4 + k * 0.6)} fill={q.color} opacity={k} />;
          })}
        </g>

        {/* Impact */}
        {!flying && (
          <g>
            {profile.impact === 'blast' && (
              <>
                <circle cx={landing.x} cy={landing.y} r={3 + ip * 12} fill="url(#shot-flash)" opacity={Math.max(0, 0.7 - ip * 2.2)} />
                <ellipse
                  cx={landing.x}
                  cy={landing.y}
                  rx={2 + ip * 16}
                  ry={(2 + ip * 16) * 0.6}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth={0.9 * (1 - ip)}
                  opacity={Math.max(0, 0.9 - ip * 1.4)}
                />
                {/* faint scuff mark */}
                <ellipse cx={landing.x} cy={landing.y} rx="3.5" ry="2" fill="#78350f" opacity={0.18 * (1 - ip)} />
              </>
            )}
            {profile.impact === 'puff' && (
              <ellipse cx={landing.x} cy={landing.y} rx={1.5 + ip * 9} ry={(1.5 + ip * 9) * 0.6} fill="#ffffff" opacity={0.35 * (1 - ip)} />
            )}
            {(profile.impact === 'snap' || profile.impact === 'soft' || profile.impact === 'line') && (
              <ellipse
                cx={landing.x}
                cy={landing.y}
                rx={1.5 + ip * (profile.impact === 'snap' ? 14 : 9)}
                ry={(1.5 + ip * (profile.impact === 'snap' ? 14 : 9)) * 0.6}
                fill="none"
                stroke={profile.color}
                strokeWidth={1 * (1 - ip)}
                opacity={1 - ip}
              />
            )}
            {profile.impact === 'line' && (
              <g opacity={Math.min(1, ip * 4) * (1 - Math.max(0, ip - 0.7) / 0.3)}>
                <circle cx={landing.x} cy={landing.y} r="3.2" fill="none" stroke="#bef264" strokeWidth="0.6" strokeDasharray="1 0.8" />
              </g>
            )}
          </g>
        )}

        {/* The shuttle (drawn last, on top) */}
        <g transform={`translate(${hx} ${hy}) rotate(${(angle * 180) / Math.PI}) scale(${scale})`}>
          <ShuttleSprite />
        </g>
      </svg>

      {/* Name of the shot, popping up where it landed */}
      {label && !flying && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${badgeX}%`, top: `${badgeY}%` }}>
          <div
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-lg animate-shot-badge ${
              profile.impact === 'blast'
                ? 'bg-orange-500 text-white ring-1 ring-white/30'
                : 'bg-slate-950/85 text-white ring-1 ring-white/30'
            }`}
          >
            {profile.impact === 'line' ? `${label} · IN` : label}
          </div>
        </div>
      )}
    </div>
  );
};
