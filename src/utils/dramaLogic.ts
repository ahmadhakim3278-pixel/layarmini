import {
  DramaGenre,
  type DramaSeries,
  type Episode,
  type SubtitleCue,
  type WatchHistoryEntry,
} from '../types/drama';

export function makeEpisodeKey(seriesId: string, episodeNumber: number): string {
  return `${seriesId}::ep-${episodeNumber}`;
}

export function isEpisodeUnlocked(
  seriesId: string,
  episodeNumber: number,
  freeUntilEpisode: number,
  unlockedKeys: ReadonlySet<string> | readonly string[],
): boolean {
  if (episodeNumber <= 0) {
    return false;
  }
  if (episodeNumber <= freeUntilEpisode) {
    return true;
  }
  const key = makeEpisodeKey(seriesId, episodeNumber);
  if ('has' in unlockedKeys) {
    return unlockedKeys.has(key);
  }
  return unlockedKeys.includes(key);
}

export function unlockEpisodesWithAd(
  existingUnlocked: readonly string[],
  series: DramaSeries,
  targetEpisodeNumber: number,
  bonusCount = 1,
): string[] {
  const safeBonus = Math.max(1, Math.min(3, Math.floor(bonusCount)));
  const maxEp = series.episodes.length;
  const nextSet = new Set(existingUnlocked);

  for (let offset = 0; offset < safeBonus; offset += 1) {
    const epNum = targetEpisodeNumber + offset;
    if (epNum >= 1 && epNum <= maxEp) {
      nextSet.add(makeEpisodeKey(series.id, epNum));
    }
  }

  return Array.from(nextSet);
}

export function filterSeries(
  seriesList: readonly DramaSeries[],
  selectedGenre: DramaGenre,
  query: string,
): DramaSeries[] {
  const normalizedQuery = query.trim().toLowerCase();

  return seriesList.filter((item) => {
    const matchesGenre =
      selectedGenre === DramaGenre.All || item.genre === selectedGenre;
    if (!matchesGenre) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [
      item.title,
      item.subtitle,
      item.synopsis,
      item.genre,
      ...item.cast,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getNextEpisode(
  series: DramaSeries,
  currentEpisodeNumber: number,
): Episode | null {
  const idx = series.episodes.findIndex(
    (ep) => ep.number === currentEpisodeNumber,
  );
  if (idx === -1 || idx + 1 >= series.episodes.length) {
    return null;
  }
  return series.episodes[idx + 1];
}

export function getPrevEpisode(
  series: DramaSeries,
  currentEpisodeNumber: number,
): Episode | null {
  const idx = series.episodes.findIndex(
    (ep) => ep.number === currentEpisodeNumber,
  );
  if (idx <= 0) {
    return null;
  }
  return series.episodes[idx - 1];
}

export function getSubtitleAtTime(
  subtitles: readonly SubtitleCue[],
  currentTimeSec: number,
): SubtitleCue | null {
  for (const cue of subtitles) {
    if (currentTimeSec >= cue.startSec && currentTimeSec < cue.endSec) {
      return cue;
    }
  }
  return null;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function calculateProgressPercent(
  progressSec: number,
  durationSec: number,
): number {
  if (durationSec <= 0) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, progressSec / durationSec));
  return Math.round(ratio * 100);
}

export function upsertWatchHistory(
  history: readonly WatchHistoryEntry[],
  entry: WatchHistoryEntry,
  maxItems = 24,
): WatchHistoryEntry[] {
  const filtered = history.filter((item) => item.seriesId !== entry.seriesId);
  return [entry, ...filtered].slice(0, maxItems);
}

export function countUnlockedEpisodes(
  series: DramaSeries,
  unlockedKeys: readonly string[],
): number {
  return series.episodes.filter((ep) =>
    isEpisodeUnlocked(series.id, ep.number, series.freeUntilEpisode, unlockedKeys),
  ).length;
}

export type SwipeEpisodeDirection = 'next' | 'prev' | null;

export function detectVerticalSwipeDirection(
  deltaY: number,
  deltaX: number,
  thresholdPx = 48,
): SwipeEpisodeDirection {
  if (Math.abs(deltaY) < thresholdPx) {
    return null;
  }
  if (Math.abs(deltaY) <= Math.abs(deltaX)) {
    return null;
  }
  return deltaY < 0 ? 'next' : 'prev';
}

export function toggleDoubleSpeedOnTap(currentSpeed: number): number {
  return currentSpeed === 2 ? 1 : 2;
}

export function getEffectivePlaybackSpeed(
  baseSpeed: number,
  isHoldBoosting: boolean,
): number {
  return isHoldBoosting ? 2 : baseSpeed;
}
