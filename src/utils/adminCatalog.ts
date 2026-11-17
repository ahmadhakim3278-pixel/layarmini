import {
  DramaGenre,
  type DramaSeries,
  type Episode,
  type SubtitleCue,
} from '../types/drama';
import {
  extractDoodstreamFileCode,
  normalizeDoodstreamEmbedUrl,
} from './doodstream';

export interface PosterPreset {
  label: string;
  url: string;
}

export const POSTER_PRESETS: PosterPreset[] = [
  {
    label: 'Sudirman Eksekutif',
    url: '/src/assets/images/poster_rahasia_pewaris_1794936964799.jpg',
  },
  {
    label: 'Kafe Romansa',
    url: '/src/assets/images/poster_kontrak_cinta_1794936966082.jpg',
  },
  {
    label: 'Misteri Malam',
    url: '/src/assets/images/poster_kode_malam_1794936965812.jpg',
  },
  {
    label: 'Dapur Warisan',
    url: '/src/assets/images/poster_warisan_rasa_1794936966430.jpg',
  },
  {
    label: 'Aksi Kota',
    url: '/src/assets/images/poster_detik_terakhir_1794936967148.jpg',
  },
];

export interface SeriesFormInput {
  title: string;
  subtitle: string;
  genre: DramaGenre;
  year: number;
  castText: string;
  director: string;
  synopsis: string;
  posterUrl: string;
  freeUntilEpisode: number;
  viewsLabel: string;
}

export interface SeriesFormErrors {
  title?: string;
  director?: string;
  synopsis?: string;
  year?: string;
  freeUntilEpisode?: string;
}

export interface EpisodeFormInput {
  title: string;
  synopsis: string;
  durationSec: number;
  sceneMood: string;
  accentTint: string;
  subtitles: SubtitleCue[];
  doodstreamFileCode?: string;
  doodstreamEmbedUrl?: string;
}

export interface EpisodeFormErrors {
  title?: string;
  durationSec?: string;
  sceneMood?: string;
  subtitles?: string;
  doodstreamEmbedUrl?: string;
}

export interface CatalogStats {
  totalSeries: number;
  totalEpisodes: number;
  totalFreeEpisodes: number;
  totalAdEpisodes: number;
}

export function slugifySeriesId(
  title: string,
  existingIds: readonly string[],
): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'drama-baru';

  if (!existingIds.includes(base)) {
    return base;
  }

  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function validateSeriesInput(input: SeriesFormInput): SeriesFormErrors {
  const errors: SeriesFormErrors = {};

  if (!input.title.trim()) {
    errors.title = 'Judul film wajib diisi.';
  }
  if (!input.director.trim()) {
    errors.director = 'Nama sutradara wajib diisi.';
  }
  if (input.synopsis.trim().length < 10) {
    errors.synopsis = 'Sinopsis minimal 10 karakter.';
  }
  if (!Number.isFinite(input.year) || input.year < 1990 || input.year > 2100) {
    errors.year = 'Tahun rilis harus antara 1990 dan 2100.';
  }
  if (!Number.isFinite(input.freeUntilEpisode) || input.freeUntilEpisode < 0) {
    errors.freeUntilEpisode = 'Batas episode gratis tidak boleh negatif.';
  }

  return errors;
}

export function validateEpisodeInput(
  input: EpisodeFormInput,
): EpisodeFormErrors {
  const errors: EpisodeFormErrors = {};

  if (!input.title.trim()) {
    errors.title = 'Judul episode wajib diisi.';
  }
  if (
    !Number.isFinite(input.durationSec) ||
    input.durationSec < 5 ||
    input.durationSec > 600
  ) {
    errors.durationSec = 'Durasi episode harus antara 5 sampai 600 detik.';
  }
  if (!input.sceneMood.trim()) {
    errors.sceneMood = 'Latar adegan / lokasi wajib diisi.';
  }

  for (const cue of input.subtitles) {
    if (
      !Number.isFinite(cue.startSec) ||
      !Number.isFinite(cue.endSec) ||
      cue.startSec < 0 ||
      cue.endSec <= cue.startSec
    ) {
      errors.subtitles =
        'Waktu selesai dialog harus lebih besar dari waktu mulai.';
      break;
    }
    if (!cue.speaker.trim() || !cue.text.trim()) {
      errors.subtitles = 'Nama tokoh dan teks dialog tidak boleh kosong.';
      break;
    }
  }

  if (input.doodstreamEmbedUrl?.trim()) {
    const normalized = normalizeDoodstreamEmbedUrl(input.doodstreamEmbedUrl);
    if (!normalized) {
      errors.doodstreamEmbedUrl =
        'Masukkan link embed Doodstream (contoh: https://dood.to/e/kode) atau filecode yang valid.';
    }
  }

  return errors;
}

export function upsertSeriesInCatalog(
  catalog: readonly DramaSeries[],
  input: SeriesFormInput,
  editingSeriesId?: string,
): { catalog: DramaSeries[]; savedSeries: DramaSeries } {
  const cast = input.castText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const safePoster =
    input.posterUrl.trim() || POSTER_PRESETS[0].url;

  if (editingSeriesId) {
    let updatedItem: DramaSeries | null = null;
    const nextCatalog = catalog.map((series) => {
      if (series.id !== editingSeriesId) {
        return series;
      }
      const clampedFree = Math.min(
        Math.max(0, Math.floor(input.freeUntilEpisode)),
        Math.max(series.episodes.length, Math.floor(input.freeUntilEpisode)),
      );
      updatedItem = {
        ...series,
        title: input.title.trim(),
        subtitle: input.subtitle.trim() || input.title.trim(),
        genre: input.genre,
        year: Math.floor(input.year),
        cast: cast.length > 0 ? cast : ['Pemeran Utama'],
        director: input.director.trim(),
        synopsis: input.synopsis.trim(),
        posterUrl: safePoster,
        freeUntilEpisode: clampedFree,
        viewsLabel: input.viewsLabel.trim() || series.viewsLabel,
      };
      return updatedItem;
    });

    if (updatedItem) {
      return { catalog: nextCatalog, savedSeries: updatedItem };
    }
  }

  const newId = slugifySeriesId(
    input.title,
    catalog.map((s) => s.id),
  );
  const newSeries: DramaSeries = {
    id: newId,
    title: input.title.trim(),
    subtitle: input.subtitle.trim() || input.title.trim(),
    genre: input.genre === DramaGenre.All ? DramaGenre.Romance : input.genre,
    year: Math.floor(input.year),
    cast: cast.length > 0 ? cast : ['Pemeran Utama'],
    director: input.director.trim(),
    synopsis: input.synopsis.trim(),
    posterUrl: safePoster,
    freeUntilEpisode: Math.max(0, Math.floor(input.freeUntilEpisode)),
    baseLikes: 0,
    viewsLabel: input.viewsLabel.trim() || 'Baru rilis',
    episodes: [],
  };

  return {
    catalog: [newSeries, ...catalog],
    savedSeries: newSeries,
  };
}

export function deleteSeriesFromCatalog(
  catalog: readonly DramaSeries[],
  seriesId: string,
): DramaSeries[] {
  return catalog.filter((series) => series.id !== seriesId);
}

export function setFeaturedSeriesInCatalog(
  catalog: readonly DramaSeries[],
  seriesId: string,
): DramaSeries[] {
  const target = catalog.find((series) => series.id === seriesId);
  if (!target) {
    return [...catalog];
  }
  return [target, ...catalog.filter((series) => series.id !== seriesId)];
}

export function upsertEpisodeInSeries(
  catalog: readonly DramaSeries[],
  seriesId: string,
  input: EpisodeFormInput,
  editingEpisodeNumber?: number,
): DramaSeries[] {
  const cleanSubtitles = input.subtitles.map((cue) => ({
    startSec: Number(cue.startSec),
    endSec: Number(cue.endSec),
    speaker: cue.speaker.trim(),
    text: cue.text.trim(),
  }));

  const rawEmbed = input.doodstreamEmbedUrl?.trim() ?? '';
  const normalizedEmbed = rawEmbed
    ? normalizeDoodstreamEmbedUrl(rawEmbed) ?? undefined
    : undefined;
  const resolvedFileCode =
    input.doodstreamFileCode?.trim() ||
    (normalizedEmbed ? extractDoodstreamFileCode(normalizedEmbed) ?? undefined : undefined);

  return catalog.map((series) => {
    if (series.id !== seriesId) {
      return series;
    }

    if (editingEpisodeNumber !== undefined) {
      const nextEpisodes = series.episodes.map((ep) =>
        ep.number === editingEpisodeNumber
          ? {
              ...ep,
              title: input.title.trim(),
              synopsis: input.synopsis.trim() || input.title.trim(),
              durationSec: Math.round(input.durationSec),
              sceneMood: input.sceneMood.trim(),
              accentTint: input.accentTint || '#E11D48',
              subtitles: cleanSubtitles,
              doodstreamFileCode: resolvedFileCode,
              doodstreamEmbedUrl: normalizedEmbed,
            }
          : ep,
      );
      return { ...series, episodes: nextEpisodes };
    }

    const newEpisode: Episode = {
      number: series.episodes.length + 1,
      title: input.title.trim(),
      synopsis: input.synopsis.trim() || input.title.trim(),
      durationSec: Math.round(input.durationSec),
      sceneMood: input.sceneMood.trim(),
      accentTint: input.accentTint || '#E11D48',
      subtitles: cleanSubtitles,
      doodstreamFileCode: resolvedFileCode,
      doodstreamEmbedUrl: normalizedEmbed,
    };

    return {
      ...series,
      episodes: [...series.episodes, newEpisode],
    };
  });
}

export function reorderEpisodeInSeries(
  catalog: readonly DramaSeries[],
  seriesId: string,
  episodeNumber: number,
  direction: 'up' | 'down',
): DramaSeries[] {
  return catalog.map((series) => {
    if (series.id !== seriesId) {
      return series;
    }
    const index = series.episodes.findIndex(
      (ep) => ep.number === episodeNumber,
    );
    if (index === -1) {
      return series;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= series.episodes.length) {
      return series;
    }

    const nextEpisodes = [...series.episodes];
    const [moved] = nextEpisodes.splice(index, 1);
    nextEpisodes.splice(targetIndex, 0, moved);

    const renumbered = nextEpisodes.map((ep, idx) => ({
      ...ep,
      number: idx + 1,
    }));

    return { ...series, episodes: renumbered };
  });
}

export function deleteEpisodeFromSeries(
  catalog: readonly DramaSeries[],
  seriesId: string,
  episodeNumber: number,
): DramaSeries[] {
  return catalog.map((series) => {
    if (series.id !== seriesId) {
      return series;
    }
    const remaining = series.episodes
      .filter((ep) => ep.number !== episodeNumber)
      .map((ep, idx) => ({
        ...ep,
        number: idx + 1,
      }));

    return {
      ...series,
      freeUntilEpisode: Math.min(series.freeUntilEpisode, remaining.length),
      episodes: remaining,
    };
  });
}

export function computeCatalogStats(
  catalog: readonly DramaSeries[],
): CatalogStats {
  let totalEpisodes = 0;
  let totalFreeEpisodes = 0;

  for (const series of catalog) {
    const epCount = series.episodes.length;
    totalEpisodes += epCount;
    totalFreeEpisodes += Math.min(epCount, Math.max(0, series.freeUntilEpisode));
  }

  return {
    totalSeries: catalog.length,
    totalEpisodes,
    totalFreeEpisodes,
    totalAdEpisodes: Math.max(0, totalEpisodes - totalFreeEpisodes),
  };
}

export function attachDoodstreamFolderToSeries(
  catalog: readonly DramaSeries[],
  seriesId: string,
  folderId: string,
  folderName: string,
): DramaSeries[] {
  const cleanId = folderId.trim();
  const cleanName = folderName.trim();
  if (!cleanId) {
    return [...catalog];
  }
  return catalog.map((series) =>
    series.id === seriesId
      ? {
          ...series,
          doodstreamFolderId: cleanId,
          doodstreamFolderName: cleanName || series.title,
        }
      : series,
  );
}

export interface UploadedEpisodePayload {
  title?: string;
  embedUrl: string;
  filecode?: string;
  durationSec?: number;
  sceneMood?: string;
  folderId?: string;
  folderName?: string;
}

export function appendUploadedEpisodeToSeries(
  catalog: readonly DramaSeries[],
  seriesId: string,
  payload: UploadedEpisodePayload,
): DramaSeries[] {
  const normalizedEmbed =
    normalizeDoodstreamEmbedUrl(payload.embedUrl) ||
    (payload.filecode ? normalizeDoodstreamEmbedUrl(payload.filecode) : null);
  if (!normalizedEmbed) {
    return [...catalog];
  }
  const resolvedCode =
    payload.filecode?.trim() ||
    extractDoodstreamFileCode(normalizedEmbed) ||
    undefined;

  return catalog.map((series) => {
    if (series.id !== seriesId) {
      return series;
    }

    const nextNumber = series.episodes.length + 1;
    const episodeTitle =
      payload.title?.trim() || `Episode ${nextNumber}`;
    const safeDuration =
      payload.durationSec && Number.isFinite(payload.durationSec) && payload.durationSec >= 5
        ? Math.min(600, Math.round(payload.durationSec))
        : 28;

    const newEpisode: Episode = {
      number: nextNumber,
      title: episodeTitle,
      synopsis: `${series.title} — ${episodeTitle}`,
      durationSec: safeDuration,
      sceneMood: payload.sceneMood?.trim() || `${series.title} · Video Doodstream`,
      accentTint: '#E11D48',
      subtitles: [],
      doodstreamFileCode: resolvedCode,
      doodstreamEmbedUrl: normalizedEmbed,
    };

    return {
      ...series,
      doodstreamFolderId:
        payload.folderId?.trim() || series.doodstreamFolderId,
      doodstreamFolderName:
        payload.folderName?.trim() ||
        series.doodstreamFolderName ||
        (payload.folderId?.trim() ? series.title : undefined),
      episodes: [...series.episodes, newEpisode],
    };
  });
}

export function attachUploadedVideoToEpisode(
  catalog: readonly DramaSeries[],
  seriesId: string,
  episodeNumber: number,
  payload: UploadedEpisodePayload,
): DramaSeries[] {
  const normalizedEmbed =
    normalizeDoodstreamEmbedUrl(payload.embedUrl) ||
    (payload.filecode ? normalizeDoodstreamEmbedUrl(payload.filecode) : null);
  if (!normalizedEmbed) {
    return [...catalog];
  }
  const resolvedCode =
    payload.filecode?.trim() ||
    extractDoodstreamFileCode(normalizedEmbed) ||
    undefined;

  return catalog.map((series) => {
    if (series.id !== seriesId) {
      return series;
    }

    const nextEpisodes = series.episodes.map((ep) => {
      if (ep.number !== episodeNumber) {
        return ep;
      }
      const nextDuration =
        payload.durationSec &&
        Number.isFinite(payload.durationSec) &&
        payload.durationSec >= 5
          ? Math.min(600, Math.round(payload.durationSec))
          : ep.durationSec;
      return {
        ...ep,
        durationSec: nextDuration,
        doodstreamFileCode: resolvedCode,
        doodstreamEmbedUrl: normalizedEmbed,
      };
    });

    return {
      ...series,
      doodstreamFolderId:
        payload.folderId?.trim() || series.doodstreamFolderId,
      doodstreamFolderName:
        payload.folderName?.trim() ||
        series.doodstreamFolderName ||
        (payload.folderId?.trim() ? series.title : undefined),
      episodes: nextEpisodes,
    };
  });
}

export function countDoodstreamEpisodes(series: DramaSeries): number {
  return series.episodes.filter((ep) => Boolean(ep.doodstreamEmbedUrl)).length;
}
