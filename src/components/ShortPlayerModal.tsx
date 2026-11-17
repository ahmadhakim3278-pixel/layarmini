import { useCallback, useEffect, useRef, useState } from 'react';
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
  formatEpisodeAccessSummary,
  getEffectivePlaybackSpeed,
  getNextEpisode,
  getPrevEpisode,
  getSubtitleAtTime,
  isEpisodeUnlocked,
  shouldAutoHidePlayerHud,
} from '../utils/dramaLogic';
import { LayarMiniStreamPlayer } from './LayarMiniStreamPlayer';
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
  const [isEpisodesDrawerOpen, setIsEpisodesDrawerOpen] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);
  const [isHudVisible, setIsHudVisible] = useState(false);
  const [hudActivityTick, setHudActivityTick] = useState(0);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [stageNotice, setStageNotice] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSavedTickRef = useRef<number>(-1);
  const holdBoostTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const isStreamEpisode = Boolean(episode.doodstreamEmbedUrl);
  const effectiveSpeed = getEffectivePlaybackSpeed(playbackSpeed, isHoldBoosting);
  const nextEpisode = getNextEpisode(series, episode.number);
  const prevEpisode = getPrevEpisode(series, episode.number);
  const activeSubtitle = getSubtitleAtTime(episode.subtitles, currentTimeSec);
  const episodeAccessSummary = formatEpisodeAccessSummary(
    series.freeUntilEpisode,
    series.episodes.length,
  );
  const effectiveHudVisible = isStreamEpisode
    ? isStreamReady && isHudVisible
    : isHudVisible;

  const revealHud = useCallback(() => {
    setIsHudVisible(true);
    setHudActivityTick((prev) => prev + 1);
  }, []);

  // Lock background page scroll so no outer rightmost scrollbar appears while player is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (holdBoostTimerRef.current !== null) {
        window.clearTimeout(holdBoostTimerRef.current);
        holdBoostTimerRef.current = null;
      }
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

  // Reset player state & immediately start in clean-screen mode when switching episodes
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
    setIsHudVisible(false);
    setIsStreamReady(false);
    lastSavedTickRef.current = -1;
  }, [series.id, episode.number, episode.durationSec, initialTimeSec]);

  // Unified auto-clean timer across BOTH stream and interactive players (mobile + desktop)
  useEffect(() => {
    if (!isStreamEpisode && (!isPlaying || isEnded)) {
      setIsHudVisible(true);
      return;
    }
    const isActivelyPlaying = isStreamEpisode ? isStreamReady : isPlaying;
    if (
      !shouldAutoHidePlayerHud({
        isPlaying: isActivelyPlaying,
        isEnded: isStreamEpisode ? false : isEnded,
        isHudVisible,
        isMenuOpen: isEpisodesDrawerOpen,
      })
    ) {
      return;
    }
    const autoHideDelayMs = isStreamEpisode ? 3000 : 1800;
    const timer = window.setTimeout(() => {
      setIsHudVisible(false);
    }, autoHideDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    isStreamEpisode,
    isStreamReady,
    isPlaying,
    isEnded,
    isHudVisible,
    isEpisodesDrawerOpen,
    hudActivityTick,
    playbackSpeed,
  ]);

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

  // Gentle Web Audio ambient chord pulse when unmuted (interactive preview episodes only)
  useEffect(() => {
    if (isMuted || !isPlaying || isEnded || episode.doodstreamEmbedUrl) {
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
  }, [isMuted, isPlaying, isEnded, episode.number, episode.doodstreamEmbedUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === ' ' && !episode.doodstreamEmbedUrl) {
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
  }, [onClose, isEnded, episode.doodstreamEmbedUrl]);

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
    setIsHudVisible(false);
  };

  const handleScrub = (nextVal: number) => {
    setCurrentTimeSec(nextVal);
    setIsEnded(false);
    setAutoNextCountdown(null);
    revealHud();
    onProgressUpdate(episode.number, nextVal, episode.durationSec);
  };

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(
      playbackSpeed as (typeof SPEED_OPTIONS)[number],
    );
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIndex];
    setPlaybackSpeed(nextSpeed);
    revealHud();
    setStageNotice(`Kecepatan ${nextSpeed}x`);
  };

  const clearHoldBoostTimer = () => {
    if (holdBoostTimerRef.current !== null) {
      window.clearTimeout(holdBoostTimerRef.current);
      holdBoostTimerRef.current = null;
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    clearHoldBoostTimer();
    if (isPlaying && !isEnded) {
      // Delay 2x hold-boost activation slightly so normal taps never flash the 2x badge
      holdBoostTimerRef.current = window.setTimeout(() => {
        setIsHoldBoosting(true);
      }, 220);
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    clearHoldBoostTimer();
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
        revealHud();
        setStageNotice('Ini episode terakhir');
      }
      return;
    }
    if (swipeDirection === 'prev') {
      if (prevEpisode) {
        handleNavigateEpisode(prevEpisode.number);
      } else {
        revealHud();
        setStageNotice('Ini episode pertama');
      }
      return;
    }

    if (Math.hypot(deltaX, deltaY) < 12 && heldMs < 220) {
      if (isEnded) {
        handleReplay();
      } else if (isHudVisible) {
        setIsHudVisible(false);
      } else {
        revealHud();
      }
    }
  };

  const handleStagePointerCancel = () => {
    pointerStartRef.current = null;
    clearHoldBoostTimer();
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
              setIsEpisodesDrawerOpen(false);
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
      data-testid="cinema-backdrop"
      data-clean-mode={effectiveHudVisible ? 'false' : 'true'}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' && e.buttons === 0 && !isHoldBoosting) {
          revealHud();
        }
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Pemutar drama ${series.title} Episode ${episode.number}`}
    >
      {/* Floating Desktop Cinema Header (sits cleanly in left/right cinema wings; auto-hides for 100% clean page) */}
      <header
        data-testid="desktop-cinema-header"
        aria-hidden={!effectiveHudVisible}
        className={`hidden lg:flex pointer-events-none fixed inset-x-0 top-0 z-30 items-start justify-between gap-4 px-6 pt-5 transition-all duration-300 ${
          effectiveHudVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2'
        }`}
      >
        <div
          onPointerEnter={revealHud}
          className={`max-w-[270px] xl:max-w-[380px] rounded-xl border border-white/10 bg-[#0B0B0E]/82 px-4 py-2.5 backdrop-blur-md ${
            effectiveHudVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <p className="text-[11px] text-zinc-400">
            <span>{series.genre}</span>
            <span aria-hidden="true" className="mx-1.5 text-zinc-600">
              ·
            </span>
            <span className="font-mono tabular-nums text-amber-300">
              Ep {episode.number} / {series.episodes.length}
            </span>
          </p>
          <h2 className="font-display mt-0.5 text-sm font-semibold text-white truncate">
            {series.title}
          </h2>
          <p className="text-xs text-zinc-400 truncate">{episode.title}</p>
        </div>

        <div
          onPointerEnter={revealHud}
          className={`flex items-center gap-2 shrink-0 ${
            effectiveHudVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <button
            type="button"
            tabIndex={effectiveHudVisible ? 0 : -1}
            onClick={() => {
              setIsEpisodesDrawerOpen(true);
              revealHud();
            }}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-white/12 bg-[#0B0B0E]/82 px-3.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
          >
            <ListVideo className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <span>Daftar Episode ({series.episodes.length})</span>
          </button>

          <button
            type="button"
            tabIndex={effectiveHudVisible ? 0 : -1}
            onClick={onClose}
            aria-label="Tutup pemutar video"
            className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-white/12 bg-[#0B0B0E]/82 text-zinc-200 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Pure Full-Height Centered 9:16 Vertical Cinema Stage (never shifts or resizes when HUD toggles) */}
      <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-black">
        <div
          data-testid="player-stage"
          data-hud-visible={effectiveHudVisible ? 'true' : 'false'}
          data-playback-speed={String(effectiveSpeed)}
          data-video-source={isStreamEpisode ? 'stream' : 'interactive'}
          className={`relative h-full w-full max-w-[430px] overflow-hidden bg-black lg:aspect-[9/16] lg:h-[96dvh] lg:max-h-[940px] lg:w-auto lg:max-w-none lg:rounded-2xl select-none transition-[box-shadow] duration-300 ${
            effectiveHudVisible ? 'lg:ring-1 lg:ring-white/14' : 'lg:ring-0'
          }`}
        >
          {episode.doodstreamEmbedUrl ? (
            <LayarMiniStreamPlayer
              series={series}
              episode={episode}
              embedUrl={episode.doodstreamEmbedUrl}
              hasPrevEpisode={Boolean(prevEpisode)}
              hasNextEpisode={Boolean(nextEpisode)}
              isSaved={isSaved}
              isLiked={isLiked}
              displayLikes={displayLikes}
              isHudVisible={isHudVisible}
              onRevealHud={revealHud}
              onStreamReadyChange={setIsStreamReady}
              onPrevEpisode={() =>
                prevEpisode && handleNavigateEpisode(prevEpisode.number)
              }
              onNextEpisode={() =>
                nextEpisode && handleNavigateEpisode(nextEpisode.number)
              }
              onToggleSave={onToggleSave}
              onToggleLike={onToggleLike}
              onShare={onShare}
              onOpenMobileEpisodes={() => {
                setIsEpisodesDrawerOpen(true);
                revealHud();
              }}
              onClose={onClose}
            />
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

              {/* Subtle cinematic tint & scrims (fade completely to 0 for clean viewing) */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90 transition-opacity duration-300 ${
                  isHudVisible ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* Top Overlay Bar (auto-cleans during playback) */}
              <div
                aria-hidden={!isHudVisible}
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
                    tabIndex={isHudVisible ? 0 : -1}
                    onClick={() => {
                      setIsMuted((m) => !m);
                      revealHud();
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
                    tabIndex={isHudVisible ? 0 : -1}
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

              {/* Melolo-style Right Vertical Action Rail (auto-cleans during playback) */}
              <div
                aria-hidden={!isHudVisible}
                className={`absolute right-3 bottom-28 z-20 flex flex-col items-center gap-3 transition-opacity duration-300 ${
                  isHudVisible
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
              >
                <button
                  type="button"
                  tabIndex={isHudVisible ? 0 : -1}
                  onClick={() => {
                    onToggleLike();
                    revealHud();
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
                  tabIndex={isHudVisible ? 0 : -1}
                  onClick={() => {
                    onToggleSave();
                    revealHud();
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
                  tabIndex={isHudVisible ? 0 : -1}
                  onClick={() => {
                    setIsEpisodesDrawerOpen(true);
                    revealHud();
                  }}
                  aria-label="Buka daftar episode"
                  className="lg:hidden flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/45 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cursor-pointer"
                >
                  <ListVideo className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[11px] font-medium">Episode</span>
                </button>

                <button
                  type="button"
                  tabIndex={isHudVisible ? 0 : -1}
                  onClick={() => {
                    onShare();
                    revealHud();
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

              {/* Bottom Playback Controls (auto-cleans during playback) */}
              <div
                aria-hidden={!isHudVisible}
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
                    tabIndex={isHudVisible ? 0 : -1}
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
                      tabIndex={isHudVisible ? 0 : -1}
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
                      tabIndex={isHudVisible ? 0 : -1}
                      onClick={() => {
                        if (isEnded) {
                          handleReplay();
                        } else {
                          setIsPlaying((p) => !p);
                          revealHud();
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
                      tabIndex={isHudVisible ? 0 : -1}
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
                    tabIndex={isHudVisible ? 0 : -1}
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

      {/* Unified Slide-Over Episode Drawer (Bottom Sheet on Mobile, Right Drawer on Desktop — never clutters playback) */}
      {isEpisodesDrawerOpen && (
        <div
          data-testid="episodes-drawer"
          className="fixed inset-0 z-50 flex flex-col justify-end lg:flex-row lg:justify-end bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEpisodesDrawerOpen(false);
            }
          }}
        >
          <aside className="flex max-h-[78dvh] w-full flex-col rounded-t-3xl border-t border-white/12 bg-[#111114] lg:h-full lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-t-0 lg:border-l">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-white truncate">
                  Daftar Episode ({series.episodes.length})
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {episodeAccessSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEpisodesDrawerOpen(false)}
                aria-label="Tutup daftar episode"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-white/8 px-5 py-3.5 space-y-1.5">
              <p className="text-xs text-zinc-400">
                <span>Sutradara: {series.director}</span>
                <span aria-hidden="true" className="mx-1.5 text-zinc-600">
                  ·
                </span>
                <span>{series.year}</span>
              </p>
              <p className="text-xs leading-relaxed text-zinc-300">
                {episode.synopsis}
              </p>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto p-4">
              {renderEpisodeList()}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
