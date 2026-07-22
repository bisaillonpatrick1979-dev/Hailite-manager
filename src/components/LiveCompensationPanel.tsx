import React, { useMemo } from 'react';
import type { PayMode, PunchSession } from '../types';

export interface LiveCompensationResult {
  mode: PayMode;
  elapsedHours: number;
  grossAmount: number;
  effectiveHourlyRate: number;
  primaryValue: number;
  primaryKind: 'gross' | 'effective-hourly' | 'pending-surface';
  fixedRateUnlocked: boolean;
}

export function calculateLiveCompensation(params: {
  mode: PayMode;
  rate: number;
  elapsedSeconds: number;
  surfaceTotal?: number;
}): LiveCompensationResult {
  const elapsedSeconds = Math.max(0, Number(params.elapsedSeconds) || 0);
  const elapsedHours = elapsedSeconds / 3600;
  const rate = Math.max(0, Number(params.rate) || 0);
  const surfaceTotal = Math.max(0, Number(params.surfaceTotal) || 0);

  if (params.mode === 'horaire') {
    const grossAmount = elapsedHours * rate;
    return {
      mode: params.mode,
      elapsedHours,
      grossAmount,
      effectiveHourlyRate: rate,
      primaryValue: grossAmount,
      primaryKind: 'gross',
      fixedRateUnlocked: true
    };
  }

  if (params.mode === 'forfait') {
    const fixedRateUnlocked = elapsedHours >= 1;
    const effectiveHourlyRate = fixedRateUnlocked && elapsedHours > 0 ? rate / elapsedHours : 0;
    return {
      mode: params.mode,
      elapsedHours,
      grossAmount: rate,
      effectiveHourlyRate,
      primaryValue: effectiveHourlyRate,
      primaryKind: 'effective-hourly',
      fixedRateUnlocked
    };
  }

  const effectiveHourlyRate = surfaceTotal > 0 && elapsedHours > 0 ? surfaceTotal / elapsedHours : 0;
  return {
    mode: params.mode,
    elapsedHours,
    grossAmount: surfaceTotal,
    effectiveHourlyRate,
    primaryValue: surfaceTotal > 0 ? effectiveHourlyRate : 0,
    primaryKind: surfaceTotal > 0 ? 'effective-hourly' : 'pending-surface',
    fixedRateUnlocked: true
  };
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface LiveCompensationPanelProps {
  session: PunchSession;
  elapsedSeconds: number;
  grossAmount: number;
  currentLanguage: 'FR' | 'EN';
  currency?: string;
  surfaceTotal?: number;
  compact?: boolean;
}

export default function LiveCompensationPanel({
  session,
  elapsedSeconds,
  grossAmount,
  currentLanguage,
  currency = 'CAD',
  surfaceTotal = 0,
  compact = false
}: LiveCompensationPanelProps) {
  const result = useMemo(() => calculateLiveCompensation({
    mode: session.payMode,
    rate: session.rate,
    elapsedSeconds,
    surfaceTotal
  }), [elapsedSeconds, session.payMode, session.rate, surfaceTotal]);

  const isFR = currentLanguage === 'FR';
  const money = (value: number, maximumFractionDigits = 2) => {
    try {
      return new Intl.NumberFormat(isFR ? 'fr-CA' : 'en-CA', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits
      }).format(Number.isFinite(value) ? value : 0);
    } catch {
      return `${(Number.isFinite(value) ? value : 0).toFixed(2)} $`;
    }
  };

  const isPaused = Boolean(session.pausedAt);
  const isSurfacePending = result.primaryKind === 'pending-surface';
  const primaryLabel = session.payMode === 'horaire'
    ? (isFR ? 'ARGENT GAGNÉ EN DIRECT' : 'LIVE EARNINGS')
    : session.payMode === 'forfait'
      ? (isFR ? 'RENDEMENT RÉEL PAR HEURE' : 'REAL HOURLY YIELD')
      : surfaceTotal > 0
        ? (isFR ? 'RENDEMENT APRÈS DÉCLARATION' : 'YIELD AFTER DECLARATION')
        : (isFR ? 'MONTANT À DÉCLARER' : 'AMOUNT TO DECLARE');

  const primaryText = isSurfacePending
    ? (isFR ? 'À LA FIN DE LA JOURNÉE' : 'AT THE END OF THE DAY')
    : session.payMode === 'forfait' && !result.fixedRateUnlocked
      ? `${money(0)}/h`
      : session.payMode === 'horaire'
        ? money(grossAmount)
        : `${money(result.primaryValue)}/h`;

  const targetForCoins = session.payMode === 'horaire'
    ? Math.max(session.rate * 8, 1)
    : session.payMode === 'forfait'
      ? 8
      : Math.max(surfaceTotal, 1);
  const coinProgress = session.payMode === 'horaire'
    ? Math.min(1, grossAmount / targetForCoins)
    : session.payMode === 'forfait'
      ? Math.min(1, result.elapsedHours / targetForCoins)
      : surfaceTotal > 0 ? 1 : 0;
  const pileCount = Math.max(0, Math.min(26, Math.floor(coinProgress * 26)));
  const showCoinRain = !isPaused && !isSurfacePending && (session.payMode !== 'forfait' || result.fixedRateUnlocked);

  const detailText = session.payMode === 'horaire'
    ? `${money(session.rate)}/h · ${isFR ? 'le montant augmente chaque seconde' : 'amount increases every second'}`
    : session.payMode === 'forfait'
      ? !result.fixedRateUnlocked
        ? (isFR
          ? `Forfait ${money(session.rate)} · calcul du rendement après 1 heure complète`
          : `${money(session.rate)} fixed price · yield calculation begins after one full hour`)
        : (isFR
          ? `Forfait ${money(session.rate)} ÷ ${result.elapsedHours.toFixed(2)} h travaillées`
          : `${money(session.rate)} fixed price ÷ ${result.elapsedHours.toFixed(2)} hours worked`)
      : surfaceTotal > 0
        ? (isFR
          ? `Total déclaré ${money(surfaceTotal)} ÷ ${result.elapsedHours.toFixed(2)} h`
          : `${money(surfaceTotal)} declared total ÷ ${result.elapsedHours.toFixed(2)} h`)
        : (isFR
          ? 'Le total et la moyenne horaire seront calculés avec chaque produit et chaque quantité déclarés au Punch Out.'
          : 'Total and hourly average will be calculated from every product and quantity declared at Punch Out.');

  return (
    <section
      id="live-compensation-panel"
      className={`relative w-full overflow-hidden rounded-[28px] border border-amber-300/50 bg-gradient-to-br from-[#3a2505] via-[#15100a] to-[#080706] shadow-[0_18px_55px_rgba(245,158,11,0.18)] ${compact ? 'p-4' : 'p-5 sm:p-6'}`}
    >
      <style>{`
        @keyframes hailite-gold-shimmer {
          0% { transform: translateX(-180%) skewX(-18deg); opacity: 0; }
          20% { opacity: .75; }
          55% { opacity: .28; }
          100% { transform: translateX(260%) skewX(-18deg); opacity: 0; }
        }
        @keyframes hailite-coin-fall {
          0% { transform: translate3d(0,-48px,0) rotate(0deg); opacity: 0; }
          12% { opacity: 1; }
          78% { opacity: 1; }
          100% { transform: translate3d(8px,170px,0) rotate(520deg); opacity: 0; }
        }
        @keyframes hailite-gold-pulse {
          0%,100% { filter: drop-shadow(0 0 8px rgba(251,191,36,.28)); }
          50% { filter: drop-shadow(0 0 20px rgba(251,191,36,.58)); }
        }
        .hailite-gold-number {
          background: linear-gradient(100deg,#8a5b00 0%,#f6c453 18%,#fff4b0 38%,#d79b18 55%,#fff0a0 72%,#9b6500 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: hailite-gold-pulse 2.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .hailite-coin-rain, .hailite-gold-shine, .hailite-gold-number { animation: none !important; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="hailite-gold-shine absolute -top-12 bottom-0 w-28 bg-gradient-to-r from-transparent via-yellow-100/35 to-transparent blur-md" style={{ animation: 'hailite-gold-shimmer 3.4s ease-in-out infinite' }} />
        {showCoinRain && [0, 1, 2, 3, 4].map(index => (
          <span
            key={index}
            className="hailite-coin-rain absolute top-0 grid h-6 w-6 place-items-center rounded-full border border-yellow-100/80 bg-gradient-to-br from-yellow-100 via-amber-400 to-yellow-700 text-[10px] font-black text-amber-950 shadow-[0_0_12px_rgba(251,191,36,.65)]"
            style={{
              left: `${12 + index * 19}%`,
              animation: `hailite-coin-fall ${2.4 + index * 0.22}s linear ${index * 0.45}s infinite`
            }}
          >$</span>
        ))}
      </div>

      <div className="relative z-10 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/75">{primaryLabel}</span>
            {isPaused && <span className="rounded-full border border-orange-400/40 bg-orange-500/15 px-2 py-0.5 text-[9px] font-black uppercase text-orange-300">{isFR ? 'Pause' : 'Paused'}</span>}
          </div>
          <div className={`hailite-gold-number mt-2 break-words font-black leading-none tracking-tight ${isSurfacePending ? 'text-2xl sm:text-3xl' : compact ? 'text-4xl' : 'text-5xl sm:text-6xl'}`}>
            {primaryText}
          </div>
          <p className="mt-3 max-w-xl text-[11px] font-semibold leading-relaxed text-amber-100/70">{detailText}</p>
        </div>

        <div className="grid min-w-[150px] grid-cols-1 gap-2 text-center">
          <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">{isFR ? 'Temps travaillé' : 'Worked time'}</p>
            <p className="mt-1 font-mono text-xl font-black text-white">{formatDuration(elapsedSeconds)}</p>
          </div>
          {session.payMode === 'forfait' && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2">
              <p className="text-[9px] font-black uppercase text-amber-200/70">{isFR ? 'Valeur du forfait' : 'Fixed job value'}</p>
              <p className="font-mono text-sm font-black text-amber-200">{money(session.rate)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-4 h-12 overflow-hidden rounded-2xl border border-amber-400/20 bg-black/25 px-2">
        <div className="absolute inset-x-2 bottom-1 flex h-9 items-end justify-center gap-0.5 overflow-hidden">
          {Array.from({ length: pileCount }).map((_, index) => (
            <span
              key={index}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-yellow-100/70 bg-gradient-to-br from-yellow-100 via-amber-400 to-yellow-700 text-[8px] font-black text-amber-950 shadow-[0_1px_8px_rgba(251,191,36,.42)]"
              style={{ transform: `translateY(${(index % 3) * 3}px) rotate(${(index % 5) * 12 - 20}deg)` }}
            >$</span>
          ))}
          {pileCount === 0 && (
            <span className="self-center text-[9px] font-black uppercase tracking-widest text-amber-100/35">
              {isSurfacePending ? (isFR ? 'Les pièces apparaîtront après la déclaration' : 'Coins appear after declaration') : (isFR ? 'La pile commence maintenant' : 'The pile starts now')}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
