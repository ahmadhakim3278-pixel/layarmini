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
  const [isChromeFocused, setIsChromeFocused] = useState(true);
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

  // Reset branded curtain smoothly whenever episode or reload token changes
  useEffect(() => {
    setIsStreamReady(false);
    setIsChromeFocused(true);

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

  // Softly dim top overlay after playback starts so the frame feels clean & cinematic
  useEffect(() => {
    if (!isStreamReady || !isChromeFocused) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIsChromeFocused(false);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [isStreamReady, isChromeFocused]);

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

  return (
    <div
      data-testid="layarmini-native-stream"
      data-stream-ready={isStreamReady ? 'true' : 'false'}
      onPointerMove={() => {
        if (!isChromeFocused) {
          setIsChromeFocused(true);
        }
      }}
      className="relative flex h-full w-full flex-col bg-black"
    >
      {/* Full-bleed 9:16 Disguised Cinema Stage */}
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

        {/* Top Edge Cinema Scrim Masking Upstream Header Area */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/95 via-black/60 to-transparent"
        />

        {/* LayarMini Proprietary Top Header Overlay */}
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2.5 px-4 pt-3.5 pb-3 transition-opacity duration-300 ${
            isChromeFocused ? 'opacity-100' : 'opacity-70 hover:opacity-100'
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
              onClick={handleReloadStream}
              aria-label="Muat ulang pemutar video"
              title="Muat ulang video"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/55 text-zinc-200 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onOpenMobileEpisodes}
              aria-label="Buka daftar episode"
              className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
            >
              <ListVideo className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pemutar"
              className="lg:hidden flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/80 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Floating LayarMini Vertical Action Rail (sits above bottom video controls) */}
        <div
          className={`absolute right-3 bottom-16 z-20 flex flex-col items-center gap-2.5 transition-opacity duration-300 ${
            isChromeFocused ? 'opacity-100' : 'opacity-65 hover:opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={onToggleLike}
            aria-label={isLiked ? 'Batalkan suka' : 'Sukai drama ini'}
            aria-pressed={isLiked}
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/50 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/75 cursor-pointer"
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
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/50 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/75 cursor-pointer"
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
            className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-black/50 px-2 py-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/75 cursor-pointer"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-medium">Bagikan</span>
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

      {/* Seamless Dark Cinema Episode Switcher Dock (never overlaps video timeline controls) */}
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

        <span className="font-mono text-[11px] font-medium text-zinc-400 tabular-nums">
          Ep {episode.number} / {series.episodes.length}
        </span>

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
