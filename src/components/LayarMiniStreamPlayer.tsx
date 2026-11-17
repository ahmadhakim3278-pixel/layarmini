import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListVideo,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Pause,
  Play,
  RotateCcw,
  Share2,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { DramaSeries, Episode } from '../types/drama';
import {
  buildAutoplayStreamUrl,
  detectVideoSourceType,
} from '../utils/doodstream';
import {
  detectVerticalSwipeDirection,
  formatDuration,
} from '../utils/dramaLogic';
import { PosterImage } from './PosterImage';

interface LayarMiniStreamPlayerProps {
  series: DramaSeries;
  episode: Episode;
  embedUrl: string;
  hasPrevEpisode: boolean;
  hasNextEpisode: boolean;
  isSaved: boolean;
  isLiked: boolean;
  displayLikes: number;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onOpenMobileEpisodes: () => void;
  onClose: () => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;

export function LayarMiniStreamPlayer({
  series,
  episode,
  embedUrl,
  hasPrevEpisode,
  hasNextEpisode,
  isSaved,
  isLiked,
  displayLikes,
  onPrevEpisode,
  onNextEpisode,
  onToggleSave,
  onToggleLike,
  onShare,
  onOpenMobileEpisodes,
  onClose,
}: LayarMiniStreamPlayerProps) {
  const sourceEngine = useMemo(
    () => detectVideoSourceType(embedUrl) ?? 'embed',
    [embedUrl],
  );
  const isDirectEngine = sourceEngine === 'direct';

  const [reloadToken, setReloadToken] = useState(0);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Wrapper playback & shield state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(
    Math.max(5, episode.durationSec || 28),
  );
  const [isShieldActive, setIsShieldActive] = useState(true);
  const [wrapperNotice, setWrapperNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const retryPlayTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const autoplaySrc = useMemo(() => {
    if (isDirectEngine) {
      return embedUrl;
    }
    return (
      buildAutoplayStreamUrl(embedUrl, {
        autoplay: true,
        reloadToken,
      }) ?? embedUrl
    );
  }, [embedUrl, isDirectEngine, reloadToken]);

  const showWrapperNotice = useCallback((msg: string) => {
    setWrapperNotice(msg);
  }, []);

  useEffect(() => {
    if (!wrapperNotice) {
      return;
    }
    const timer = window.setTimeout(() => setWrapperNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [wrapperNotice]);

  // Reset player & curtain whenever episode or reload changes
  useEffect(() => {
    setIsStreamReady(false);
    setIsChromeVisible(true);
    setIsPlaying(true);
    setCurrentTimeSec(0);
    setDurationSec(Math.max(5, episode.durationSec || 28));
    setIsShieldActive(true);

    const fallbackTimer = window.setTimeout(() => {
      setIsStreamReady(true);
    }, isDirectEngine ? 1800 : 2400);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (retryPlayTimerRef.current !== null) {
        window.clearTimeout(retryPlayTimerRef.current);
        retryPlayTimerRef.current = null;
      }
    };
  }, [series.id, episode.number, episode.durationSec, autoplaySrc, isDirectEngine]);

  // Sync fullscreen status cleanly
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Auto-dim overlay chrome cleanly after inactivity during playback
  useEffect(() => {
    if (!isStreamReady || !isChromeVisible || !isPlaying) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIsChromeVisible(false);
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [isStreamReady, isChromeVisible, isPlaying, isShieldActive]);

  // Direct HTML5 <video> autoplay orchestration (with graceful muted fallback if browser policy blocks audio)
  useEffect(() => {
    if (!isDirectEngine) {
      return;
    }
    const videoEl = videoRef.current;
    if (!videoEl) {
      return;
    }
    videoEl.playbackRate = playbackSpeed;
    let cancelled = false;

    const attemptAutoplay = async () => {
      try {
        videoEl.muted = false;
        await videoEl.play();
        if (!cancelled) {
          setIsMuted(false);
          setIsPlaying(true);
        }
      } catch {
        try {
          videoEl.muted = true;
          await videoEl.play();
          if (!cancelled) {
            setIsMuted(true);
            setIsPlaying(true);
            showWrapperNotice('Audio dibisukan otomatis — ketuk ikon suara');
          }
        } catch {
          if (!cancelled) {
            setIsPlaying(false);
          }
        }
      }
    };

    void attemptAutoplay();
    return () => {
      cancelled = true;
    };
  }, [isDirectEngine, autoplaySrc, reloadToken, showWrapperNotice]);

  // Estimated progress ticker in wrapped embed mode when playing
  useEffect(() => {
    if (isDirectEngine || !isStreamReady || !isPlaying) {
      return;
    }
    const timer = window.setInterval(() => {
      setCurrentTimeSec((prev) =>
        prev >= durationSec ? durationSec : Math.min(durationSec, prev + 0.5),
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [isDirectEngine, isStreamReady, isPlaying, durationSec]);

  const sendIframeCommand = useCallback(
    (action: 'play' | 'pause' | 'mute' | 'unmute') => {
      const win = iframeRef.current?.contentWindow;
      if (!win) {
        return;
      }
      const funcMap = {
        play: 'playVideo',
        pause: 'pauseVideo',
        mute: 'mute',
        unmute: 'unMute',
      } as const;
      try {
        win.postMessage(
          { event: 'command', func: funcMap[action], args: [] },
          '*',
        );
        win.postMessage({ method: action }, '*');
        win.postMessage({ type: action }, '*');
        win.postMessage(action, '*');
      } catch {
        // Ignore cross-origin postMessage restrictions
      }
    },
    [],
  );

  const handleIframeLoad = () => {
    sendIframeCommand('play');
    retryPlayTimerRef.current = window.setTimeout(() => {
      sendIframeCommand('play');
    }, 320);
    settleTimerRef.current = window.setTimeout(() => {
      setIsStreamReady(true);
    }, 380);
  };

  const handleTogglePlay = () => {
    setIsChromeVisible(true);
    if (isDirectEngine && videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    sendIframeCommand(nextPlaying ? 'play' : 'pause');
  };

  const handleToggleMute = () => {
    setIsChromeVisible(true);
    if (isDirectEngine && videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
      return;
    }

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sendIframeCommand(nextMuted ? 'mute' : 'unmute');
  };

  const handleCycleSpeed = () => {
    setIsChromeVisible(true);
    const idx = SPEED_OPTIONS.indexOf(
      playbackSpeed as (typeof SPEED_OPTIONS)[number],
    );
    const nextSpeed = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackSpeed(nextSpeed);
    if (isDirectEngine && videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
    showWrapperNotice(`Kecepatan ${nextSpeed}x`);
  };

  const handleSeek = (nextSec: number) => {
    setIsChromeVisible(true);
    setCurrentTimeSec(nextSec);
    if (isDirectEngine && videoRef.current) {
      videoRef.current.currentTime = nextSec;
    }
  };

  const handleToggleShield = () => {
    setIsChromeVisible(true);
    setIsShieldActive((prev) => {
      const next = !prev;
      showWrapperNotice(
        next
          ? 'Tameng Anti-Iklan aktif (klik redirect diblokir)'
          : 'Mode Sentuh Video aktif — ketuk video jika perlu memulai manual',
      );
      return next;
    });
  };

  const handleToggleFullscreen = async () => {
    setIsChromeVisible(true);
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      showWrapperNotice('Layar penuh tidak didukung pada browser ini');
    }
  };

  const handleReloadStream = () => {
    setReloadToken((prev) => prev + 1);
  };

  // Transparent Shield gesture handler: blocks redirect clicks & right-clicks while enabling swipe episode switching
  const handleShieldPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
  };

  const handleShieldPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) {
      return;
    }

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const swipeDir = detectVerticalSwipeDirection(dy, dx, 52);
    if (swipeDir === 'next') {
      if (hasNextEpisode) {
        onNextEpisode();
      } else {
        showWrapperNotice('Ini episode terakhir');
      }
      return;
    }
    if (swipeDir === 'prev') {
      if (hasPrevEpisode) {
        onPrevEpisode();
      } else {
        showWrapperNotice('Ini episode pertama');
      }
      return;
    }

    if (Math.hypot(dx, dy) < 14) {
      if (isDirectEngine) {
        handleTogglePlay();
      } else {
        setIsChromeVisible((visible) => !visible);
      }
    }
  };

  const progressPct =
    durationSec > 0 ? Math.min(100, (currentTimeSec / durationSec) * 100) : 0;

  return (
    <div
      ref={containerRef}
      data-testid="layarmini-native-stream"
      data-player-engine={sourceEngine}
      data-shield-active={isDirectEngine || isShieldActive ? 'true' : 'false'}
      data-stream-ready={isStreamReady ? 'true' : 'false'}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={() => {
        if (!isChromeVisible) {
          setIsChromeVisible(true);
        }
      }}
      className="relative flex h-full w-full flex-col bg-black select-none"
    >
      {/* Full-bleed 9:16 LayarMini Custom Cinema Wrapper Stage */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        {isDirectEngine ? (
          <video
            key={`${series.id}-${episode.number}-${reloadToken}`}
            ref={videoRef}
            src={autoplaySrc}
            poster={series.posterUrl}
            playsInline
            autoPlay
            preload="auto"
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              if (Number.isFinite(vid.duration) && vid.duration > 0) {
                setDurationSec(Math.round(vid.duration));
              }
              setIsStreamReady(true);
            }}
            onCanPlay={() => setIsStreamReady(true)}
            onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
              if (hasNextEpisode) {
                onNextEpisode();
              }
            }}
            className="h-full w-full bg-black object-cover"
          />
        ) : (
          /* CSS Overscan Wrapper: crops upstream top header/logo bar (-top-[56px]) and hides bottom native bar (-bottom-[52px]) when Shield Mode is active */
          <iframe
            key={`${series.id}-${episode.number}-${reloadToken}`}
            ref={iframeRef}
            src={autoplaySrc}
            title={`Pemutar LayarMini — ${series.title} Episode ${episode.number}`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
            referrerPolicy="no-referrer"
            scrolling="no"
            onLoad={handleIframeLoad}
            className={`absolute -left-[4px] w-[calc(100%+8px)] border-0 bg-black transition-all duration-200 ${
              isShieldActive
                ? '-top-[56px] h-[calc(100%+108px)]'
                : '-top-[56px] h-[calc(100%+56px)]'
            }`}
          />
        )}

        {/* Permanent Perimeter & Corner Watermark Masks (blocks clicks & hides upstream logos even in Touch mode) */}
        <div
          aria-hidden="true"
          onContextMenu={(e) => e.preventDefault()}
          className="pointer-events-auto absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black via-black/70 to-transparent"
        />
        <div
          aria-hidden="true"
          onContextMenu={(e) => e.preventDefault()}
          className="pointer-events-auto absolute top-0 right-0 z-10 h-20 w-28 bg-gradient-to-bl from-black/95 via-black/50 to-transparent"
        />
        {!isDirectEngine && isShieldActive && (
          <div
            aria-hidden="true"
            onContextMenu={(e) => e.preventDefault()}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black via-black/75 to-transparent"
          />
        )}

        {/* Transparent Click-Shield Overlay (blocks right-click & Doodstream pop-under ad redirects while supporting vertical swipe) */}
        {(isDirectEngine || isShieldActive) && (
          <div
            data-testid="stream-click-shield"
            role="presentation"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={handleShieldPointerDown}
            onPointerUp={handleShieldPointerUp}
            onPointerCancel={() => {
              pointerStartRef.current = null;
            }}
            className="absolute inset-0 z-10 touch-pan-x cursor-pointer"
          />
        )}

        {/* LayarMini Proprietary Top Header Overlay */}
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3 transition-opacity duration-300 ${
            isChromeVisible ? 'opacity-100' : 'opacity-75 hover:opacity-100'
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#E11D48]"
                aria-hidden="true"
              />
              <p className="font-mono text-[11px] font-semibold tracking-wide text-amber-300 tabular-nums">
                EP {episode.number} / {series.episodes.length}
              </p>
              <span aria-hidden="true" className="text-zinc-600 text-[11px]">
                ·
              </span>
              <span className="font-display text-[11px] font-semibold tracking-tight text-white/85">
                LayarMini HD
              </span>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-white truncate drop-shadow-sm">
              {episode.title}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleReloadStream}
              aria-label="Muat ulang pemutar video"
              title="Muat ulang video"
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full bg-black/60 text-zinc-200 backdrop-blur-sm transition-colors hover:bg-[#E11D48] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onOpenMobileEpisodes}
              aria-label="Buka daftar episode"
              className="lg:hidden flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/85 cursor-pointer"
            >
              <ListVideo className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pemutar"
              className="lg:hidden flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/85 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Transient Wrapper Notice Pill (only appears briefly on control action) */}
        {wrapperNotice && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-16 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-black/85 px-3 py-1.5 text-[11px] font-medium text-zinc-100 backdrop-blur-md shadow-lg"
          >
            {wrapperNotice}
          </div>
        )}

        {/* Center Play Indicator when Direct Video is Paused */}
        {isDirectEngine && isStreamReady && !isPlaying && (
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label="Putar video"
            className="absolute top-1/2 left-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#E11D48]/90 text-white shadow-xl shadow-[#E11D48]/30 transition-transform hover:scale-105 cursor-pointer"
          >
            <Play className="h-7 w-7 fill-current translate-x-0.5" aria-hidden="true" />
          </button>
        )}

        {/* Floating LayarMini Vertical Action Rail */}
        <div
          className={`absolute right-3 z-20 flex flex-col items-center gap-2.5 transition-all duration-300 ${
            isDirectEngine || isShieldActive ? 'bottom-28' : 'bottom-16'
          } ${isChromeVisible ? 'opacity-100' : 'opacity-65 hover:opacity-100'}`}
        >
          <button
            type="button"
            onClick={onToggleLike}
            aria-label={isLiked ? 'Batalkan suka' : 'Sukai drama ini'}
            aria-pressed={isLiked}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/55 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
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
            onClick={onToggleSave}
            aria-label={isSaved ? 'Hapus dari tersimpan' : 'Simpan drama'}
            aria-pressed={isSaved}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/55 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
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
            onClick={onShare}
            aria-label="Bagikan tautan drama"
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/55 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-medium">Bagikan</span>
          </button>
        </div>

        {/* LayarMini Branded Custom Control Bar (#E11D48 Theme — replaces masked bottom player bar) */}
        {(isDirectEngine || isShieldActive) && (
          <div
            data-testid="layarmini-custom-controls"
            className={`absolute inset-x-0 bottom-0 z-20 px-3.5 pb-3 pt-6 transition-opacity duration-300 ${
              isChromeVisible || !isPlaying
                ? 'opacity-100'
                : 'opacity-80 hover:opacity-100'
            }`}
          >
            {/* Crimson Progress Track */}
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-zinc-300 w-9">
                {formatDuration(currentTimeSec)}
              </span>
              <div className="relative flex-1 flex items-center">
                <input
                  type="range"
                  min={0}
                  max={durationSec}
                  step={0.5}
                  value={Math.min(durationSec, currentTimeSec)}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  aria-label="Progres video LayarMini"
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[#E11D48]"
                  style={{
                    background: `linear-gradient(to right, #E11D48 0%, #E11D48 ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%, rgba(255,255,255,0.2) 100%)`,
                  }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-zinc-400 w-9 text-right">
                {formatDuration(durationSec)}
              </span>
            </div>

            {/* Branded Action Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label={isPlaying ? 'Jeda video' : 'Putar video'}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E11D48] text-white shadow-sm shadow-[#E11D48]/35 transition-colors hover:bg-[#BE123C] cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                  ) : (
                    <Play
                      className="h-4 w-4 fill-current translate-x-0.5"
                      aria-hidden="true"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={isMuted ? 'Nyalakan suara' : 'Bisukan suara'}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-zinc-100 transition-colors hover:bg-white/20 cursor-pointer"
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4 text-amber-300" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                {isDirectEngine && (
                  <button
                    type="button"
                    onClick={handleCycleSpeed}
                    aria-label={`Kecepatan putar ${playbackSpeed}x`}
                    className="flex h-9 min-w-[42px] items-center justify-center rounded-lg bg-white/10 px-2 font-mono text-[11px] font-semibold text-white transition-colors hover:bg-white/20 cursor-pointer tabular-nums"
                  >
                    {playbackSpeed}x
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {!isDirectEngine && (
                  <button
                    type="button"
                    onClick={handleToggleShield}
                    aria-label="Buka kontrol sentuh video langsung"
                    title="Ketuk untuk mengakses kontrol video langsung jika pemutar memerlukan klik awal"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tameng</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleToggleFullscreen()}
                  aria-label={
                    isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-zinc-100 transition-colors hover:bg-white/20 cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Seamless Branded LayarMini Curtain (masks upstream splash/loading flicker) */}
        <div
          aria-hidden={isStreamReady}
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#09090B] transition-opacity duration-500 ${
            isStreamReady ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <PosterImage
            src={series.posterUrl}
            alt={`Poster ${series.title}`}
            title={series.title}
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-35 blur-[3px]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/90"
          />

          <div className="relative z-10 flex flex-col items-center px-6 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#E11D48]/90 text-white shadow-lg shadow-[#E11D48]/25">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-[#E11D48]/60 animate-ping"
              />
              <Play
                className="h-7 w-7 fill-current translate-x-0.5"
                aria-hidden="true"
              />
            </div>

            <p className="font-display mt-4 text-sm font-semibold text-white">
              LayarMini Player
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-300 tabular-nums">
              Memutar Episode {episode.number}...
            </p>

            <div className="mt-4 h-1 w-36 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-1/2 rounded-full bg-[#E11D48] animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Seamless Dark Cinema Episode Switcher & Shield Recovery Dock */}
      <div className="flex items-center justify-between gap-2 border-t border-white/8 bg-[#0B0B0E] px-3 py-2.5">
        <button
          type="button"
          disabled={!hasPrevEpisode}
          onClick={onPrevEpisode}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-white/10 bg-[#141418] px-3 text-xs font-medium text-zinc-200 transition-colors disabled:opacity-35 hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Sebelumnya</span>
        </button>

        {!isDirectEngine && !isShieldActive ? (
          <button
            type="button"
            onClick={handleToggleShield}
            aria-label="Aktifkan kembali tameng anti-iklan"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#E11D48]/45 bg-[#E11D48]/15 px-2.5 text-[11px] font-semibold text-rose-200 transition-colors hover:bg-[#E11D48]/25 cursor-pointer"
          >
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kunci Tameng</span>
          </button>
        ) : (
          <span className="font-mono text-[11px] font-medium text-zinc-400 tabular-nums">
            Ep {episode.number} / {series.episodes.length}
          </span>
        )}

        <button
          type="button"
          disabled={!hasNextEpisode}
          onClick={onNextEpisode}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#E11D48] px-3.5 text-xs font-semibold text-white transition-colors disabled:opacity-35 hover:bg-[#BE123C] cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Selanjutnya</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
