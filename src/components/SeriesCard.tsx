import { Bookmark, Check, Play } from 'lucide-react';
import type { DramaSeries } from '../types/drama';
import { PosterImage } from './PosterImage';

interface SeriesCardProps {
  series: DramaSeries;
  unlockedCount: number;
  isSaved: boolean;
  onOpenSeries: (series: DramaSeries) => void;
  onToggleSave: (seriesId: string) => void;
}

export function SeriesCard({
  series,
  unlockedCount,
  isSaved,
  onOpenSeries,
  onToggleSave,
}: SeriesCardProps) {
  return (
    <article className="group flex flex-col">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#141417]">
        <button
          type="button"
          onClick={() => onOpenSeries(series)}
          aria-label={`Tonton ${series.title}`}
          className="block aspect-[3/4] w-full overflow-hidden text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
        >
          <PosterImage
            src={series.posterUrl}
            alt={`Poster drama ${series.title}`}
            title={series.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#09090B]/95 via-[#09090B]/20 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-medium tabular-nums text-zinc-200">
                {series.episodes.length === 0
                  ? '0 Episode'
                  : `${unlockedCount}/${series.episodes.length} Ep Terbuka`}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 truncate">
                {series.episodes.length === 0
                  ? 'Segera tayang'
                  : series.freeUntilEpisode > 0
                    ? `Ep 1–${series.freeUntilEpisode} gratis langsung`
                    : 'Semua ep via iklan interaktif'}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors duration-150 group-hover:bg-[#E11D48]">
              <Play className="h-4 w-4 fill-current translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleSave(series.id)}
          aria-label={
            isSaved
              ? `Hapus ${series.title} dari daftar tersimpan`
              : `Simpan ${series.title} ke daftar`
          }
          aria-pressed={isSaved}
          className="absolute top-2 right-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-[#09090B]/70 text-white backdrop-blur-sm transition-colors duration-150 hover:bg-[#09090B]/90 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
        >
          {isSaved ? (
            <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <Bookmark className="h-4 w-4 text-zinc-200" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="font-display text-base font-semibold text-[#FAFAFA] line-clamp-1">
          <button
            type="button"
            onClick={() => onOpenSeries(series)}
            className="text-left hover:text-[#E11D48] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48]"
          >
            {series.title}
          </button>
        </h3>
        <p className="text-xs text-zinc-400 flex items-center gap-1.5 flex-wrap">
          <span>{series.genre}</span>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {series.episodes.length} Ep
          </span>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <span>{series.viewsLabel}</span>
        </p>
      </div>
    </article>
  );
}
