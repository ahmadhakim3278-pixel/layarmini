import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListVideo,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { DramaSeries, Episode } from '../types/drama';
import {
  detectVerticalSwipeDirection,
  formatDuration,
  getEffectivePlaybackSpeed,
  getNextEpisode,
  getPrevEpisode,
  getSubtitleAtTime,
  isEpisodeUnlocked,
} from '../utils/dramaLogic';
import { PosterImage } from './PosterImage';

interface ShortPlayerModalProps {
  series: DramaSeries;
  episodeNumber: number;
  initialTimeSec?: number;
  unlockedKeys: string[];
  isSaved: boolean;
  isLiked: boolean;
  onClose: () => void;
  onSelectEpisode: (episodeNumber: number) => void;
  onRequestUnlockEpisode: (episodeNumber: number) => void;
  onProgressUpdate: (episodeNumber: number, progressSec: number, durationSec: number) => void;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onShare: () => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;

export function ShortPlayerModal({
  series,
  episodeNumber,
  initialTimeSec = 0,
  unlockedKeys,
  isSaved,
  isLiked,
  onClose,
  onSelectEpisode,
  onRequestUnlockEpisode,
  onProgressUpdate,
  onToggleSave,
  onToggleLike,
  onShare,
}: ShortPlayerModalProps) {
  const episode: Episode =
    series.episodes.find((ep) => ep.number === episodeNumber) ??
    series.episodes[0];

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(
    Math.min(initialTimeSec, Math.max(0, episode.durationSec - 1)),
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isHoldBoosting, setIsHoldBoosting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isMobileEpisodesOpen, setIsMobileEpisodesOpen] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [stageNotice, setStageNotice] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSavedTickRef = useRef<number>(-1);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const effectiveSpeed = getEffectivePlaybackSpeed(playbackSpeed, isHoldBoosting);
  const nextEpisode = getNextEpisode(series, episode.number);
  const prevEpisode = getPrevEpisode(series, episode.number);
  const activeSubtitle = getSubtitleAtTime(episode.subtitles, currentTimeSec);

  // Lock background page scroll so no outer rightmost scrollbar appears while player is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Safety release for press-and-hold 2x boost if pointer leaves or cancels
  useEffect(() => {
    if (!isHoldBoosting) {
      return;
    }
    const releaseBoost = () => {
      setIsHoldBoosting(false);
      pointerStartRef.current = null;
    };
    window.addEventListener('pointerup', releaseBoost);
    window.addEventListener('pointercancel', releaseBoost);
    window.addEventListener('blur', releaseBoost);
    return () => {
      window.removeEventListener('pointerup', releaseBoost);
      window.removeEventListener('pointercancel', releaseBoost);
      window.removeEventListener('blur', releaseBoost);
    };
  }, [isHoldBoosting]);

  // Reset player state when switching episodes
  useEffect(() => {
    const startSec =
      initialTimeSec > 0 && initialTimeSec < episode.durationSec - 1
        ? initialTimeSec
        : 0;
    setCurrentTimeSec(startSec);
    setIsPlaying(true);
    setIsEnded(false);
    setIsHoldBoosting(false);
    setAutoNextCountdown(null);
    setIsHudVisible(true);
    lastSavedTickRef.current = -1;
  }, [series.id, episode.number, episode.durationSec, initialTimeSec]);

  // Auto-clean HUD 2 seconds after playback starts or after last interaction
  useEffect(() => {
    if (!isPlaying || isEnded) {
      setIsHudVisible(true);
      return;
    }
    if (!isHudVisible) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIsHudVisible(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [isPlaying, isEnded, isHudVisible, playbackSpeed]);

  useEffect(() => {
    if (!stageNotice) {
      return;
    }
    const timer = window.setTimeout(() => setStageNotice(null), 1300);
    return () => window.clearTimeout(timer);
  }, [stageNotice]);

  // Playback clock tick (pure state update only; skipped when external Doodstream embed is active)
  useEffect(() => {
    if (!isPlaying || isEnded || episode.doodstreamEmbedUrl) {
      return;
    }

    const tickMs = 200;
    const timer = window.setInterval(() => {
      setCurrentTimeSec((prev) =>
        Math.min(episode.durationSec, prev + (tickMs / 1000) * effectiveSpeed),
      );
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, isEnded, effectiveSpeed, episode.durationSec, episode.doodstreamEmbedUrl]);

  // Sync watch progress & handle episode completion cleanly outside render/updater
  useEffect(() => {
    if (currentTimeSec >= episode.durationSec && !isEnded) {
      setIsPlaying(false);
      setIsEnded(true);
      if (nextEpisode) {
        setAutoNextCountdown(3);
      }
      onProgressUpdate(episode.number, episode.durationSec, episode.durationSec);
      return;
    }

    const wholeSecond = Math.floor(currentTimeSec);
    if (wholeSecond !== lastSavedTickRef.current) {
      lastSavedTickRef.current = wholeSecond;
      onProgressUpdate(episode.number, currentTimeSec, episode.durationSec);
    }
  }, [
    currentTimeSec,
    episode.durationSec,
    episode.number,
    isEnded,
    nextEpisode,
    onProgressUpdate,
  ]);

  // Auto-next countdown at episode completion
  useEffect(() => {
    if (!isEnded || autoNextCountdown === null) {
      return;
    }
    if (autoNextCountdown <= 0) {
      if (nextEpisode) {
        handleNavigateEpisode(nextEpisode.number);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setAutoNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  });

  // Gentle Web Audio ambient chord pulse when unmuted
  useEffect(() => {
    if (isMuted || !isPlaying || isEnded) {
      return;
    }
    try {
      const AudioCtx = window.AudioContext;
      if (!AudioCtx) {
        return;
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const playSoftPulse = () => {
        if (!ctx || ctx.state !== 'running') {
          return;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = episode.number % 2 === 0 ? 220 : 196;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.85);
      };

      playSoftPulse();
      const pulseTimer = window.setInterval(playSoftPulse, 3200);
      return () => window.clearInterval(pulseTimer);
    } catch {
      // Ignore audio errors on restricted environments
    }
  }, [isMuted, isPlaying, isEnded, episode.number]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === ' ') {
        event.preventDefault();
        if (isEnded) {
          setCurrentTimeSec(0);
          setIsEnded(false);
          setIsPlaying(true);
        } else {
          setIsPlaying((p) => !p);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isEnded]);

  const handleNavigateEpisode = (targetNumber: number) => {
    setAutoNextCountdown(null);
    const unlocked = isEpisodeUnlocked(
      series.id,
      targetNumber,
      series.freeUntilEpisode,
      unlockedKeys,
    );
    if (unlocked) {
      onSelectEpisode(targetNumber);
    } else {
      setIsPlaying(false);
      onRequestUnlockEpisode(targetNumber);
    }
  };

  const handleReplay = () => {
    setCurrentTimeSec(0);
    setIsEnded(false);
    setAutoNextCountdown(null);
    setIsPlaying(true);
    setIsHudVisible(true);
  };

  const handleScrub = (nextVal: number) => {
    setCurrentTimeSec(nextVal);
    setIsEnded(false);
    setAutoNextCountdown(null);
    setIsHudVisible(true);
    onProgressUpdate(episode.number, nextVal, episode.durationSec);
  };

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(
      playbackSpeed as (typeof SPEED_OPTIONS)[number],
    );
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIndex];
    setPlaybackSpeed(nextSpeed);
    setIsHudVisible(true);
    setStageNotice(`Kecepatan ${nextSpeed}x`);
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    if (isPlaying && !isEnded) {
      setIsHoldBoosting(true);
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setIsHoldBoosting(false);

    if (!start) {
      return;
    }

    const deltaX = e.clientX - start.x;
    const deltaY = e.clientY - start.y;
    const heldMs = Date.now() - start.time;

    const swipeDirection = detectVerticalSwipeDirection(deltaY, deltaX, 48);
    if (swipeDirection === 'next') {
      if (nextEpisode) {
        handleNavigateEpisode(nextEpisode.number);
      } else {
        setIsHudVisible(true);
        setStageNotice('Ini episode terakhir');
      }
      return;
    }
    if (swipeDirection === 'prev') {
      if (prevEpisode) {
        handleNavigateEpisode(prevEpisode.number);
      } else {
        setIsHudVisible(true);
        setStageNotice('Ini episode pertama');
      }
      return;
    }

    if (Math.hypot(deltaX, deltaY) < 12 && heldMs < 220) {
      if (isEnded) {
        handleReplay();
      } else {
        setIsHudVisible(true);
      }
    }
  };

  const handleStagePointerCancel = () => {
    pointerStartRef.current = null;
    setIsHoldBoosting(false);
  };

  const displayLikes = series.baseLikes + (isLiked ? 1 : 0);
  const progressPct =
    episode.durationSec > 0
      ? Math.min(100, (currentTimeSec / episode.durationSec) * 100)
      : 0;

  const renderEpisodeList = () => (
    <div className="space-y-2">
      {series.episodes.map((ep) => {
        const unlocked = isEpisodeUnlocked(
          series.id,
          ep.number,
          series.freeUntilEpisode,
          unlockedKeys,
        );
        const isCurrent = ep.number === episode.number;
        const isFreeNative = ep.number <= series.freeUntilEpisode;

        return (
          <button
            key={ep.number}
            type="button"
            onClick={() => {
              handleNavigateEpisode(ep.number);
              setIsMobileEpisodesOpen(false);
            }}
            aria-current={isCurrent ? 'true' : undefined}
            className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
              isCurrent
                ? 'border-[#E11D48] bg-[#E11D48]/12'
                : 'border-white/8 bg-[#16161B] hover:border-white/20 hover:bg-[#1C1C22]'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold tabular-nums ${
                  isCurrent
                    ? 'bg-[#E11D48] text-white'
                    : unlocked
                      ? 'bg-white/8 text-zinc-200'
                      : 'bg-white/4 text-zinc-500'
                }`}
              >
                {ep.number}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {ep.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400 flex items-center gap-1.5">
                  <span className="font-mono tabular-nums">
                    {formatDuration(ep.durationSec)}
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">
                    ·
                  </span>
                  <span>
                    {isCurrent
                      ? 'Sedang diputar'
                      : isFreeNative
                        ? 'Gratis langsung'
                        : unlocked
                          ? 'Terbuka'
                          : 'Buka via iklan'}
                  </span>
                </p>
              </div>
            </div>

            <div className="shrink-0">
              {isCurrent ? (
                <Play className="h-4 w-4 fill-current text-[#E11D48]" aria-hidden="true" />
              ) : unlocked ? (
                <ChevronRight className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4 text-amber-400" aria-hidden="true" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/92 lg:p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Pemutar drama ${series.title} Episode ${episode.number}`}
    >
      <div className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden bg-[#09090B] lg:h-[88vh] lg:rounded-2xl lg:border lg:border-white/12">
        <div className="hidden lg:flex items-center justify-between gap-4 border-b border-white/8 px-6 py-3.5">
          <div className="min-w-0">
            <p className="text-xs text-zinc-400">
              <span>{series.genre}</span>
              <span aria-hidden="true" className="mx-2 text-zinc-600">
                ·
              </span>
              <span className="font-mono tabular-nums">
                Episode {episode.number} dari {series.episodes.length}
              </span>
            </p>
            <h2 className="font-display text-base font-semibold text-white truncate">
              {series.title} — {episode.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pemutar video"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          {/* Vertical 9:16 Theater Stage */}
          <div className="relative flex min-h-0 items-center justify-center bg-black lg:col-span-7 lg:p-5">
            <div
              data-testid="player-stage"
              data-hud-visible={isHudVisible ? 'true' : 'false'}
              data-playback-speed={String(effectiveSpeed)}
              data-video-source={episode.doodstreamEmbedUrl ? 'doodstream' : 'interactive'}
              onPointerMove={(e) => {
                if (
                  e.pointerType === 'mouse' &&
                  e.buttons === 0 &&
                  !isHudVisible &&
                  !isHoldBoosting
                ) {
                  setIsHudVisible(true);
                }
              }}
              className="relative h-full w-full max-w-[430px] overflow-hidden bg-[#111114] lg:aspect-[9/16] lg:h-full lg:w-auto lg:rounded-2xl lg:border lg:border-white/12 select-none"
            >
              {episode.doodstreamEmbedUrl ? (
                <div className="relative flex h-full w-full flex-col bg-black">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#111114] px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-semibold text-amber-300">
                        EP {episode.number} / {series.episodes.length} · Doodstream
                      </p>
                      <p className="text-sm font-semibold text-white truncate">
                        {episode.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsMobileEpisodesOpen(true)}
                        aria-label="Buka daftar episode"
                        className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                      >
                        <ListVideo className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup pemutar"
                        className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <iframe
                    src={episode.doodstreamEmbedUrl}
                    title={`Video ${series.title} Episode ${episode.number}: ${episode.title}`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    referrerPolicy="no-referrer"
                    className="w-full flex-1 border-0 bg-black"
                  />

                  <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-[#111114] px-3 py-2.5">
                    <button
                      type="button"
                      disabled={!prevEpisode}
                      onClick={() =>
                        prevEpisode && handleNavigateEpisode(prevEpisode.number)
                      }
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-200 disabled:opacity-35 hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Sebelumnya</span>
                    </button>

                    <button
                      type="button"
                      onClick={onToggleSave}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-200 hover:bg-white/10 cursor-pointer"
                    >
                      {isSaved ? (
                        <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Bookmark className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{isSaved ? 'Disimpan' : 'Simpan'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!nextEpisode}
                      onClick={() =>
                        nextEpisode && handleNavigateEpisode(nextEpisode.number)
                      }
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#E11D48] px-3 text-xs font-semibold text-white disabled:opacity-35 hover:bg-[#BE123C] cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <PosterImage
                    src={series.posterUrl}
                    alt={`Adegan ${series.title} episode ${episode.number}`}
                    title={series.title}
                    className={`h-full w-full object-cover ${
                      isPlaying && !isEnded
                        ? 'animate-ken-burns'
                        : 'animate-ken-burns-paused'
                    }`}
                  />

                  {/* Subtle cinematic tint & scrims (fade with HUD for clean viewing) */}
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90 transition-opacity duration-300 ${
                      isHudVisible ? 'opacity-100' : 'opacity-25'
                    }`}
                  />

                  {/* Top Overlay Bar (auto-cleans after 2s during playback) */}
                  <div
                    className={`absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 transition-opacity duration-300 ${
                      isHudVisible
                        ? 'opacity-100'
                        : 'pointer-events-none opacity-0'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-semibold tracking-wide text-amber-300">
                        EP {episode.number} / {series.episodes.length}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-white truncate">
                        {episode.title}
                      </p>
                      <p className="text-xs text-zinc-300 truncate">
                        {episode.sceneMood}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsMuted((m) => !m);
                          setIsHudVisible(true);
                        }}
                        aria-label={isMuted ? 'Nyalakan audio suasana' : 'Bisukan audio'}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup pemutar"
                        className="lg:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Transient feedback for press-and-hold 2x speed or swipe edge */}
                  {(isHoldBoosting || stageNotice) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="pointer-events-none absolute top-24 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/75 px-3.5 py-1.5 font-mono text-xs font-semibold text-amber-300 backdrop-blur-md"
                    >
                      {isHoldBoosting ? '2x Dipercepat' : stageNotice}
                    </div>
                  )}

                  {/* Interactive Stage: Hold screen -> 2x speed (release -> normal), Swipe Up -> Next Ep, Swipe Down -> Prev Ep */}
                  <button
                    type="button"
                    data-testid="player-gesture-surface"
                    onPointerDown={handleStagePointerDown}
                    onPointerUp={handleStagePointerUp}
                    onPointerCancel={handleStagePointerCancel}
                    aria-label="Sentuh dan tahan layar untuk mempercepat video 2x, usap atas atau bawah untuk ganti episode"
                    className="absolute inset-0 z-10 flex items-center justify-center touch-none cursor-pointer focus-visible:outline-none"
                  >
                    {!isPlaying && !isEnded && (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-md transition-transform hover:scale-105">
                        <Play className="h-7 w-7 fill-current translate-x-0.5" aria-hidden="true" />
                      </span>
                    )}
                  </button>

              {/* Melolo-style Right Vertical Action Rail (auto-cleans after 2s) */}
              <div
                className={`absolute right-3 bottom-28 z-20 flex flex-col items-center gap-3 transition-opacity duration-300 ${
                  isHudVisible
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToggleLike();
                    setIsHudVisible(true);
                  }}
                  aria-label={isLiked ? 'Batalkan suka' : 'Sukai drama ini'}
                  aria-pressed={isLiked}
                  className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
                >
                  <Heart
                    className={`h-5 w-5 ${
                      isLiked ? 'fill-[#E11D48] text-[#E11D48]' : 'text-white'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[11px] tabular-nums">
                    {displayLikes.toLocaleString('id-ID')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleSave();
                    setIsHudVisible(true);
                  }}
                  aria-label={isSaved ? 'Hapus dari tersimpan' : 'Simpan drama'}
                  aria-pressed={isSaved}
                  className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
                >
                  {isSaved ? (
                    <Check className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Bookmark className="h-5 w-5" aria-hidden="true" />
                  )}
                  <span className="text-[11px] font-medium">
                    {isSaved ? 'Disimpan' : 'Simpan'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileEpisodesOpen(true);
                    setIsHudVisible(true);
                  }}
                  aria-label="Buka daftar episode"
                  className="lg:hidden flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
                >
                  <ListVideo className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px] font-medium">Episode</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onShare();
                    setIsHudVisible(true);
                  }}
                  aria-label="Bagikan tautan drama"
                  className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
                >
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px] font-medium">Bagikan</span>
                </button>
              </div>

              {/* Synced Indonesian Subtitles (remain clean & readable even when HUD clears) */}
              {activeSubtitle && !isEnded && (
                <div
                  aria-live="polite"
                  className={`pointer-events-none absolute inset-x-4 z-20 transition-[bottom] duration-300 ${
                    isHudVisible ? 'bottom-24 pr-14' : 'bottom-6 pr-0'
                  }`}
                >
                  <div className="inline-block rounded-lg bg-black/78 px-3.5 py-2 backdrop-blur-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                      {activeSubtitle.speaker}
                    </p>
                    <p className="mt-0.5 text-sm font-medium leading-snug text-white">
                      {activeSubtitle.text}
                    </p>
                  </div>
                </div>
              )}

              {/* End of Episode Auto-Next Overlay */}
              {isEnded && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm">
                  <p className="font-mono text-xs uppercase tracking-wider text-amber-300">
                    Episode {episode.number} Selesai
                  </p>
                  <h3 className="font-display mt-2 text-xl font-bold text-white">
                    {nextEpisode
                      ? `Lanjut ke Episode ${nextEpisode.number}`
                      : 'Semua Episode Tamat'}
                  </h3>
                  {nextEpisode && (
                    <p className="mt-1 text-sm text-zinc-300">
                      {nextEpisode.title}
                    </p>
                  )}

                  {nextEpisode && autoNextCountdown !== null && (
                    <p className="mt-3 font-mono text-xs tabular-nums text-zinc-400">
                      Otomatis berlanjut dalam {autoNextCountdown} detik...
                    </p>
                  )}

                  <div className="mt-6 flex flex-col gap-2.5 w-full max-w-xs">
                    {nextEpisode && (
                      <button
                        type="button"
                        onClick={() => handleNavigateEpisode(nextEpisode.number)}
                        className="min-h-[44px] w-full rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#BE123C] cursor-pointer"
                      >
                        {isEpisodeUnlocked(
                          series.id,
                          nextEpisode.number,
                          series.freeUntilEpisode,
                          unlockedKeys,
                        )
                          ? `Putar Episode ${nextEpisode.number}`
                          : `Buka Episode ${nextEpisode.number} Gratis (Iklan)`}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleReplay}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      <span>Putar Ulang Episode</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom Playback Controls (auto-cleans after 2s during playback) */}
              <div
                className={`absolute inset-x-0 bottom-0 z-20 space-y-2 px-4 pb-4 pt-2 transition-opacity duration-300 ${
                  isHudVisible
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] tabular-nums text-zinc-300 w-10">
                    {formatDuration(currentTimeSec)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={episode.durationSec}
                    step={0.5}
                    value={currentTimeSec}
                    onChange={(e) => handleScrub(Number(e.target.value))}
                    aria-label="Progres durasi episode"
                    className="cinema-scrubber flex-1"
                    style={{
                      background: `linear-gradient(to right, #E11D48 ${progressPct}%, rgba(255,255,255,0.25) ${progressPct}%)`,
                      height: '4px',
                      borderRadius: '9999px',
                    }}
                  />
                  <span className="font-mono text-[11px] tabular-nums text-zinc-300 w-10 text-right">
                    {formatDuration(episode.durationSec)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!prevEpisode}
                      onClick={() =>
                        prevEpisode && handleNavigateEpisode(prevEpisode.number)
                      }
                      aria-label="Episode sebelumnya"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white disabled:opacity-35 hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isEnded) {
                          handleReplay();
                        } else {
                          setIsPlaying((p) => !p);
                          setIsHudVisible(true);
                        }
                      }}
                      aria-label={isPlaying ? 'Jeda' : 'Putar'}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 cursor-pointer"
                    >
                      {isPlaying && !isEnded ? (
                        <Pause className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!nextEpisode}
                      onClick={() =>
                        nextEpisode && handleNavigateEpisode(nextEpisode.number)
                      }
                      aria-label="Episode berikutnya"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white disabled:opacity-35 hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={cycleSpeed}
                    aria-label={`Kecepatan putar ${playbackSpeed}x`}
                    className="min-h-[40px] rounded-lg border border-white/15 bg-black/50 px-3 font-mono text-xs font-semibold tabular-nums text-white hover:bg-white/15 cursor-pointer"
                  >
                    {playbackSpeed}x
                  </button>
                </div>
              </div>
              </>
              )}
            </div>
          </div>

          {/* Desktop Episode & Series Detail Drawer */}
          <aside className="hidden lg:flex lg:col-span-5 flex-col border-l border-white/8 bg-[#111114] min-h-0">
            <div className="border-b border-white/8 p-5 space-y-2">
              <p className="text-xs text-zinc-400">
                <span>Sutradara: {series.director}</span>
                <span aria-hidden="true" className="mx-1.5 text-zinc-600">
                  ·
                </span>
                <span>{series.year}</span>
              </p>
              <p className="text-sm leading-relaxed text-zinc-300">
                {episode.synopsis}
              </p>
              <p className="text-xs text-zinc-400">
                Episode 1–{series.freeUntilEpisode} langsung gratis · Episode{' '}
                {series.freeUntilEpisode + 1}–{series.episodes.length} gratis
                dengan iklan interaktif.
              </p>
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
              <h3 className="font-display text-sm font-semibold text-white">
                Daftar Episode ({series.episodes.length})
              </h3>
              <span className="text-xs text-zinc-400">Tanpa Langganan</span>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto p-4">
              {renderEpisodeList()}
            </div>
          </aside>
        </div>

        {/* Mobile Slide-up Episode Sheet */}
        {isMobileEpisodesOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm">
            <div className="max-h-[75dvh] flex flex-col rounded-t-3xl border-t border-white/12 bg-[#111114]">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Pilih Episode ({series.episodes.length})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Ep 1–{series.freeUntilEpisode} gratis · Lainnya via iklan
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileEpisodesOpen(false)}
                  aria-label="Tutup daftar episode"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="no-scrollbar flex-1 overflow-y-auto p-4">
                {renderEpisodeList()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
