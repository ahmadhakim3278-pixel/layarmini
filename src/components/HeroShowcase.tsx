import { Bookmark, Check, Play } from 'lucide-react';
import type { DramaSeries } from '../types/drama';
import { PosterImage } from './PosterImage';

interface HeroShowcaseProps {
  series: DramaSeries;
  isSaved: boolean;
  onWatchNow: (series: DramaSeries) => void;
  onToggleSave: (seriesId: string) => void;
}

export function HeroShowcase({
  series,
  isSaved,
  onWatchNow,
  onToggleSave,
}: HeroShowcaseProps) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-white/8">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-6 lg:col-span-5">
            <div className="space-y-4">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium tracking-wide text-zinc-400">
                <span>Pilihan Utama</span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span>{series.genre}</span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  {series.episodes.length} Episode
                </span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="whitespace-nowrap">Gratis via Iklan</span>
              </p>

              <h1
                id="hero-title"
                className="font-display text-3xl font-bold tracking-tight text-[#FAFAFA] sm:text-4xl lg:text-5xl [text-wrap:balance]"
              >
                {series.title}
              </h1>

              <p className="text-base leading-relaxed text-zinc-300">
                {series.synopsis}
              </p>

              <p className="text-sm text-zinc-400">
                <span className="text-zinc-500">Pemeran:</span>{' '}
                {series.cast.join(', ')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onWatchNow(series)}
                className="inline-flex min-h-[44px] items-center gap-2.5 rounded-lg bg-[#E11D48] px-6 py-3 text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#BE123C] active:scale-[0.98] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>Tonton Episode 1</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleSave(series.id)}
                aria-pressed={isSaved}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/12 bg-[#141417] px-5 py-3 text-sm font-medium text-zinc-200 whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/25 hover:bg-[#1C1C21] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
              >
                {isSaved ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    <span>Tersimpan di Daftar</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" aria-hidden="true" />
                    <span>Simpan Daftar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <button
              type="button"
              onClick={() => onWatchNow(series)}
              aria-label={`Putar episode pertama ${series.title}`}
              className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#141417] text-left lg:h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
            >
              <PosterImage
                src={series.heroUrl ?? series.posterUrl}
                alt={`Adegan pembuka serial ${series.title}`}
                title={series.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#09090B]/90 via-[#09090B]/25 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium text-zinc-300 truncate">
                    Ep 1–{series.freeUntilEpisode} gratis · Ep{' '}
                    {series.freeUntilEpisode + 1}+ via iklan interaktif
                  </p>
                  <p className="font-display text-base sm:text-lg font-semibold text-white truncate">
                    {series.episodes[0]?.title}
                  </p>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-transform duration-200 group-hover:scale-105 group-hover:bg-[#E11D48]">
                  <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
