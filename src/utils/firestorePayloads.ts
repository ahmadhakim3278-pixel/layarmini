import {
  DramaGenre,
  type DramaSeries,
  type Episode,
  type SubtitleCue,
} from '../types/drama';
import { POSTER_PRESETS } from './adminCatalog';

// Verbatim blueprint constraints from firebase-blueprint.json & firestore.rules
export const FIRESTORE_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]{1,128}$/,
  hexTintPattern: /^#[0-9a-fA-F]{6}$/,
  allowedGenres: [
    DramaGenre.Romance,
    DramaGenre.Mystery,
    DramaGenre.Family,
    DramaGenre.Comedy,
    DramaGenre.Action,
  ] as readonly DramaGenre[],
  maxTitle: 160,
  maxSubtitle: 220,
  maxDirector: 120,
  minSynopsis: 10,
  maxSynopsis: 1200,
  maxEpisodeSynopsis: 800,
  maxPosterUrl: 1000,
  maxViewsLabel: 60,
  maxCastItems: 15,
  maxCastName: 80,
  maxFolderId: 64,
  maxFolderName: 120,
  maxSceneMood: 200,
  maxFileCode: 80,
  maxEmbedUrl: 500,
  maxSubtitles: 40,
  maxSpeaker: 80,
  maxSubtitleText: 240,
  maxFreeUntilEpisode: 200,
  maxBaseLikes: 100000000,
  maxSortOrder: 10000,
  maxEpisodes: 500,
  minDurationSec: 5,
  maxDurationSec: 3600,
} as const;

export const PRIMARY_ADMIN_EMAIL = 'ahmadhakim3278@gmail.com';

export interface SanitizedSeriesDoc {
  id: string;
  title: string;
  subtitle: string;
  genre: DramaGenre;
  year: number;
  cast: string[];
  director: string;
  synopsis: string;
  posterUrl: string;
  heroUrl?: string;
  freeUntilEpisode: number;
  baseLikes: number;
  viewsLabel: string;
  sortOrder: number;
  published: boolean;
  doodstreamFolderId?: string;
  doodstreamFolderName?: string;
  updatedByUid: string;
}

export interface SanitizedEpisodeDoc {
  seriesId: string;
  number: number;
  title: string;
  synopsis: string;
  durationSec: number;
  sceneMood: string;
  accentTint: string;
  subtitles: SubtitleCue[];
  doodstreamFileCode?: string;
  doodstreamEmbedUrl?: string;
  published: boolean;
  updatedByUid: string;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function trimToMax(value: string | undefined, maxLen: number, fallback = ''): string {
  const cleaned = (value ?? '').trim().slice(0, maxLen);
  return cleaned || fallback;
}

export function sanitizeDocumentId(rawId: string, fallback = 'item'): string {
  const cleaned = rawId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
  return cleaned || fallback;
}

export function buildEpisodeDocId(episodeNumber: number): string {
  return `ep-${clampInt(episodeNumber, 1, FIRESTORE_LIMITS.maxEpisodes, 1)}`;
}

export function sanitizeSubtitlesForFirestore(
  subtitles: readonly SubtitleCue[],
): SubtitleCue[] {
  const result: SubtitleCue[] = [];
  for (const cue of subtitles) {
    if (result.length >= FIRESTORE_LIMITS.maxSubtitles) {
      break;
    }
    const startSec = Number.isFinite(cue.startSec)
      ? Math.max(0, Math.min(FIRESTORE_LIMITS.maxDurationSec - 0.5, Number(cue.startSec)))
      : 0;
    const rawEnd = Number.isFinite(cue.endSec) ? Number(cue.endSec) : startSec + 3;
    const endSec = Math.min(
      FIRESTORE_LIMITS.maxDurationSec,
      Math.max(startSec + 0.5, rawEnd),
    );
    const speaker = trimToMax(cue.speaker, FIRESTORE_LIMITS.maxSpeaker);
    const text = trimToMax(cue.text, FIRESTORE_LIMITS.maxSubtitleText);
    if (!speaker || !text) {
      continue;
    }
    result.push({ startSec, endSec, speaker, text });
  }
  return result;
}

export function sanitizeSeriesForFirestore(
  series: DramaSeries,
  sortOrder: number,
  uid: string,
  published = true,
): SanitizedSeriesDoc {
  const safeId = sanitizeDocumentId(series.id, 'drama-baru');
  const safeTitle = trimToMax(series.title, FIRESTORE_LIMITS.maxTitle, 'Drama Tanpa Judul');
  const safeSubtitle = trimToMax(series.subtitle, FIRESTORE_LIMITS.maxSubtitle, safeTitle);
  const safeGenre = FIRESTORE_LIMITS.allowedGenres.includes(series.genre)
    ? series.genre
    : DramaGenre.Romance;
  const safeYear = clampInt(series.year, 1990, 2100, new Date().getFullYear());
  const safeCast = series.cast
    .map((member) => trimToMax(member, FIRESTORE_LIMITS.maxCastName))
    .filter(Boolean)
    .slice(0, FIRESTORE_LIMITS.maxCastItems);

  let safeSynopsis = trimToMax(series.synopsis, FIRESTORE_LIMITS.maxSynopsis);
  if (safeSynopsis.length < FIRESTORE_LIMITS.minSynopsis) {
    safeSynopsis = `${safeTitle} — drama pendek vertikal LayarMini.`.slice(
      0,
      FIRESTORE_LIMITS.maxSynopsis,
    );
  }

  const safePoster = trimToMax(
    series.posterUrl,
    FIRESTORE_LIMITS.maxPosterUrl,
    POSTER_PRESETS[0].url,
  );
  const safeHero = trimToMax(series.heroUrl, FIRESTORE_LIMITS.maxPosterUrl);
  const safeFolderId = trimToMax(
    series.doodstreamFolderId,
    FIRESTORE_LIMITS.maxFolderId,
  );
  const safeFolderName = trimToMax(
    series.doodstreamFolderName,
    FIRESTORE_LIMITS.maxFolderName,
  );

  const docData: SanitizedSeriesDoc = {
    id: safeId,
    title: safeTitle,
    subtitle: safeSubtitle,
    genre: safeGenre,
    year: safeYear,
    cast: safeCast.length > 0 ? safeCast : ['Pemeran Utama'],
    director: trimToMax(series.director, FIRESTORE_LIMITS.maxDirector, 'Tim LayarMini'),
    synopsis: safeSynopsis,
    posterUrl: safePoster,
    freeUntilEpisode: clampInt(
      series.freeUntilEpisode,
      0,
      FIRESTORE_LIMITS.maxFreeUntilEpisode,
      3,
    ),
    baseLikes: clampInt(series.baseLikes, 0, FIRESTORE_LIMITS.maxBaseLikes, 0),
    viewsLabel: trimToMax(series.viewsLabel, FIRESTORE_LIMITS.maxViewsLabel, 'Baru rilis'),
    sortOrder: clampInt(sortOrder, 0, FIRESTORE_LIMITS.maxSortOrder, 0),
    published,
    updatedByUid: trimToMax(uid, 128),
  };

  if (safeHero) {
    docData.heroUrl = safeHero;
  }
  if (safeFolderId) {
    docData.doodstreamFolderId = safeFolderId;
  }
  if (safeFolderName) {
    docData.doodstreamFolderName = safeFolderName;
  }

  return docData;
}

export function sanitizeEpisodeForFirestore(
  seriesId: string,
  episode: Episode,
  uid: string,
  published = true,
): SanitizedEpisodeDoc {
  const safeSeriesId = sanitizeDocumentId(seriesId, 'drama-baru');
  const safeNumber = clampInt(episode.number, 1, FIRESTORE_LIMITS.maxEpisodes, 1);
  const safeTitle = trimToMax(
    episode.title,
    FIRESTORE_LIMITS.maxTitle,
    `Episode ${safeNumber}`,
  );
  const safeTint = FIRESTORE_LIMITS.hexTintPattern.test(episode.accentTint ?? '')
    ? episode.accentTint
    : '#E11D48';

  const safeFileCode = trimToMax(
    episode.doodstreamFileCode,
    FIRESTORE_LIMITS.maxFileCode,
  );
  const safeEmbedUrl = trimToMax(
    episode.doodstreamEmbedUrl,
    FIRESTORE_LIMITS.maxEmbedUrl,
  );

  const docData: SanitizedEpisodeDoc = {
    seriesId: safeSeriesId,
    number: safeNumber,
    title: safeTitle,
    synopsis: trimToMax(
      episode.synopsis,
      FIRESTORE_LIMITS.maxEpisodeSynopsis,
      safeTitle,
    ),
    durationSec: clampInt(
      episode.durationSec,
      FIRESTORE_LIMITS.minDurationSec,
      FIRESTORE_LIMITS.maxDurationSec,
      28,
    ),
    sceneMood: trimToMax(
      episode.sceneMood,
      FIRESTORE_LIMITS.maxSceneMood,
      `Episode ${safeNumber}`,
    ),
    accentTint: safeTint,
    subtitles: sanitizeSubtitlesForFirestore(episode.subtitles),
    published,
    updatedByUid: trimToMax(uid, 128),
  };

  if (safeFileCode) {
    docData.doodstreamFileCode = safeFileCode;
  }
  if (safeEmbedUrl) {
    docData.doodstreamEmbedUrl = safeEmbedUrl;
  }

  return docData;
}

export function isBootstrappedAdminEmail(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined,
): boolean {
  return (
    emailVerified === true &&
    typeof email === 'string' &&
    email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL
  );
}

export function mergeSeriesWithEpisodes(
  seriesDocs: Array<DramaSeries & { sortOrder: number }>,
  episodesBySeries: Record<string, Episode[]>,
): DramaSeries[] {
  return [...seriesDocs]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map(({ sortOrder: _sortOrder, ...series }) => ({
      ...series,
      episodes: [...(episodesBySeries[series.id] ?? [])].sort(
        (a, b) => a.number - b.number,
      ),
    }));
}
