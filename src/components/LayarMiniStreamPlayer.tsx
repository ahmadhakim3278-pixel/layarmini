import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  ListVideo,
  Play,
  RotateCcw,
  Share2,
  X,
} from 'lucide-react';
import type { DramaSeries, Episode } from '../types/drama';
import { buildAutoplayStreamUrl } from '../utils/doodstream';
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
  isHudVisible: boolean;
  onRevealHud: () => void;
  onStreamReadyChange?: (ready: boolean) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onOpenMobileEpisodes: () => void;
  onClose: () => void;
}

export function LayarMiniStreamPlayer({
  series,
  episode,
  embedUrl,
  hasPrevEpisode,
  hasNextEpisode,
  isSaved,
  isLiked,
  displayLikes,
  isHudVisible,
  onRevealHud,
  onStreamReadyChange,
  onPrevEpisode,
  onNextEpisode,
  onToggleSave,
  onToggleLike,
  onShare,
  onOpenMobileEpisodes,
  onClose,
}: LayarMiniStreamPlayerProps) {
  const [reloadToken, setReloadToken] = useState(0);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const settleTimerRef = useRef<number | null>(null);
  const retryPlayTimerRef = useRef<number | null>(null);

  const autoplaySrc = useMemo(
    () =>
      buildAutoplayStreamUrl(embedUrl, {
        autoplay: true,
        reloadToken,
      }) ?? embedUrl,
    [embedUrl, reloadToken],
  );

  // Sync stream-ready readiness with parent modal so clean-screen auto-hide starts once video boots
  useEffect(() => {
    onStreamReadyChange?.(isStreamReady);
  }, [isStreamReady, onStreamReadyChange]);

  // Reset branded curtain whenever episode or reload token changes
  useEffect(() => {
    setIsStreamReady(false);

    // Safety fallback so slow third-party networks never trap the user behind the curtain
    const fallbackTimer = window.setTimeout(() => {
      setIsStreamReady(true);
    }, 2800);

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
  }, [series.id, episode.number, autoplaySrc]);

  const dispatchAutoplaySignal = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      return;
    }
    try {
      win.postMessage({ event: 'command', func: 'playVideo', args: [] }, '*');
      win.postMessage({ method: 'play' }, '*');
      win.postMessage({ type: 'play' }, '*');
      win.postMessage('play', '*');
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  };

  const handleIframeLoad = () => {
    dispatchAutoplaySignal();

    // Secondary signal after JS player init settles
    retryPlayTimerRef.current = window.setTimeout(() => {
      dispatchAutoplaySignal();
    }, 320);

    // Small settle delay masks upstream splash/branding flicker before fading our poster curtain
    settleTimerRef.current = window.setTimeout(() => {
      setIsStreamReady(true);
    }, 380);
  };

  const handleReloadStream = () => {
    setReloadToken((prev) => prev + 1);
  };

  const showOverlays = isStreamReady && isHudVisible;

  return (
    <div
      data-testid="layarmini-native-stream"
      data-stream-ready={isStreamReady ? 'true' : 'false'}
      data-hud-visible={showOverlays ? 'true' : 'false'}
      className="relative flex h-full w-full flex-col bg-black"
    >
      {/* Full-bleed 100% height 9:16 Disguised Cinema Stage */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        {/* Overscan top edge (-top-[52px]) clips upstream player title/logo bar cleanly while keeping bottom controls accessible */}
        <iframe
          key={`${series.id}-${episode.number}-${reloadToken}`}
          ref={iframeRef}
          src={autoplaySrc}
          title={`Pemutar LayarMini — ${series.title} Episode ${episode.number}`}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
          referrerPolicy="no-referrer"
          scrolling="no"
          onLoad={handleIframeLoad}
          className="absolute -top-[52px] -left-[2px] h-[calc(100%+52px)] w-[calc(100%+4px)] border-0 bg-black"
        />

        {/* Invisible top-edge reveal strip when screen is in clean mode (never blocks video controls) */}
        {isStreamReady && !isHudVisible && (
          <button
            type="button"
            data-testid="stream-wake-hud"
            onClick={onRevealHud}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') {
                onRevealHud();
              }
            }}
            aria-label="Tampilkan kontrol pemutar"
            className="absolute inset-x-0 top-0 z-20 h-14 bg-transparent cursor-pointer focus-visible:outline-none"
          />
        )}

        {/* Top Edge Cinema Scrim (fades out completely to 0 in clean playback mode) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/90 via-black/55 to-transparent transition-opacity duration-300 ${
            showOverlays ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* LayarMini Proprietary Top Header Overlay (auto-hidden when video plays) */}
        <div
          aria-hidden={!showOverlays}
          className={`absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3 transition-all duration-300 ${
            showOverlays
              ? 'opacity-100 translate-y-0'
              : 'pointer-events-none opacity-0 -translate-y-2'
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E11D48]" aria-hidden="true" />
              <p className="font-mono text-[11px] font-semibold tracking-wide text-amber-300 tabular-nums">
                EP {episode.number} / {series.episodes.length}
              </p>
              <span aria-hidden="true" className="text-zinc-600 text-[11px]">
                ·
              </span>
              <span className="font-display text-[11px] font-semibold tracking-tight text-white/75">
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
              tabIndex={showOverlays ? 0 : -1}
              onClick={handleReloadStream}
              aria-label="Muat ulang pemutar video"
              title="Muat ulang video"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/60 text-zinc-200 backdrop-blur-sm transition-colors hover:bg-black/85 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              tabIndex={showOverlays ? 0 : -1}
              onClick={onOpenMobileEpisodes}
              aria-label="Buka daftar episode"
              className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/85 cursor-pointer"
            >
              <ListVideo className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              tabIndex={showOverlays ? 0 : -1}
              onClick={onClose}
              aria-label="Tutup pemutar"
              className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/85 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Floating LayarMini Vertical Action Rail (auto-hidden during clean playback) */}
        <div
          aria-hidden={!showOverlays}
          className={`absolute right-3 bottom-32 z-20 flex flex-col items-center gap-2.5 transition-all duration-300 ${
            showOverlays
              ? 'opacity-100 translate-x-0'
              : 'pointer-events-none opacity-0 translate-x-2'
          }`}
        >
          <button
            type="button"
            tabIndex={showOverlays ? 0 : -1}
            onClick={() => {
              onToggleLike();
              onRevealHud();
            }}
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
            tabIndex={showOverlays ? 0 : -1}
            onClick={() => {
              onToggleSave();
              onRevealHud();
            }}
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
            tabIndex={showOverlays ? 0 : -1}
            onClick={() => {
              onShare();
              onRevealHud();
            }}
            aria-label="Bagikan tautan drama"
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/55 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-medium">Bagikan</span>
          </button>
        </div>

        {/* Floating Episode Switcher Dock (auto-hidden during clean playback; floats above video controls when revealed) */}
        <div
          aria-hidden={!showOverlays}
          className={`absolute inset-x-3 bottom-14 z-20 flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-[#0B0B0E]/88 px-2.5 py-2 backdrop-blur-md transition-all duration-300 ${
            showOverlays
              ? 'opacity-100 translate-y-0'
              : 'pointer-events-none opacity-0 translate-y-3'
          }`}
        >
          <button
            type="button"
            tabIndex={showOverlays ? 0 : -1}
            disabled={!hasPrevEpisode}
            onClick={onPrevEpisode}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-white/10 bg-[#141418] px-3 text-xs font-medium text-zinc-200 transition-colors disabled:opacity-35 hover:bg-white/10 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Sebelumnya</span>
          </button>

          <span className="font-mono text-[11px] font-medium text-zinc-300 tabular-nums">
            Ep {episode.number} / {series.episodes.length}
          </span>

          <button
            type="button"
            tabIndex={showOverlays ? 0 : -1}
            disabled={!hasNextEpisode}
            onClick={onNextEpisode}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#E11D48] px-3.5 text-xs font-semibold text-white transition-colors disabled:opacity-35 hover:bg-[#BE123C] cursor-pointer disabled:cursor-not-allowed"
          >
            <span>Selanjutnya</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Seamless Branded LayarMini Curtain (masks upstream player boot/loading screen) */}
        <div
          aria-hidden={isStreamReady}
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#09090B] transition-opacity duration-500 ${
            isStreamReady
              ? 'pointer-events-none opacity-0'
              : 'opacity-100'
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
              <Play className="h-7 w-7 fill-current translate-x-0.5" aria-hidden="true" />
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
    </div>
  );
}
