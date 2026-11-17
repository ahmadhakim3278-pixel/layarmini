import type { Episode } from '../types/drama';
import type { UploadedEpisodePayload } from './adminCatalog';
import {
  buildAutoEpisodeTitle,
  extractDoodstreamFileCode,
  normalizeDoodstreamEmbedUrl,
} from './doodstream';

export interface DoodstreamLibraryFile {
  filecode: string;
  title: string;
  durationSec: number;
  uploaded: string;
  embedUrl: string;
  singleImg?: string;
  folderId?: string;
}

export interface AnnotatedDoodstreamLibraryFile extends DoodstreamLibraryFile {
  usedInEpisode: number | null;
}

/**
 * Checks whether a Doodstream library video is already attached to any episode
 * in the currently open series (matching by filecode or canonical embed URL).
 */
export function findUsedEpisodeNumber(
  file: Pick<DoodstreamLibraryFile, 'filecode' | 'embedUrl'>,
  episodes: readonly Episode[],
): number | null {
  const targetCode = (
    file.filecode ||
    extractDoodstreamFileCode(file.embedUrl) ||
    ''
  )
    .trim()
    .toLowerCase();
  const targetEmbed = (
    normalizeDoodstreamEmbedUrl(file.embedUrl) ||
    file.embedUrl ||
    ''
  )
    .trim()
    .toLowerCase();

  for (const ep of episodes) {
    const epCode = (
      ep.doodstreamFileCode ||
      (ep.doodstreamEmbedUrl
        ? extractDoodstreamFileCode(ep.doodstreamEmbedUrl)
        : null) ||
      ''
    )
      .trim()
      .toLowerCase();

    if (targetCode && epCode && epCode === targetCode) {
      return ep.number;
    }

    if (targetEmbed && ep.doodstreamEmbedUrl) {
      const epEmbed = (
        normalizeDoodstreamEmbedUrl(ep.doodstreamEmbedUrl) ||
        ep.doodstreamEmbedUrl
      )
        .trim()
        .toLowerCase();
      if (epEmbed === targetEmbed) {
        return ep.number;
      }
    }
  }

  return null;
}

export type DoodstreamLibrarySort = 'newest' | 'name-asc';

/**
 * Annotates Doodstream library files with their existing episode attachment,
 * filters by search query (title / filecode) and unused-only toggle, and
 * optionally sorts naturally by title (e.g. Episode 2 before Episode 10).
 */
export function filterDoodstreamLibraryFiles(
  files: readonly DoodstreamLibraryFile[],
  episodes: readonly Episode[],
  query: string,
  hideUsed = false,
  sortOrder: DoodstreamLibrarySort = 'newest',
): AnnotatedDoodstreamLibraryFile[] {
  const normalizedQuery = query.trim().toLowerCase();

  const annotated: AnnotatedDoodstreamLibraryFile[] = [];
  for (const file of files) {
    const usedInEpisode = findUsedEpisodeNumber(file, episodes);
    if (hideUsed && usedInEpisode !== null) {
      continue;
    }

    if (normalizedQuery) {
      const matchesTitle = file.title.toLowerCase().includes(normalizedQuery);
      const matchesCode = file.filecode.toLowerCase().includes(normalizedQuery);
      if (!matchesTitle && !matchesCode) {
        continue;
      }
    }

    annotated.push({
      ...file,
      usedInEpisode,
    });
  }

  if (sortOrder === 'name-asc') {
    annotated.sort((a, b) =>
      a.title.localeCompare(b.title, 'id', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }

  return annotated;
}

/**
 * Builds an UploadedEpisodePayload from a Doodstream library video so it can be
 * appended directly as the next episode or attached to an existing episode.
 */
export function buildEpisodePayloadFromLibraryFile(
  file: DoodstreamLibraryFile,
  customTitle: string,
  targetEpisodeNumber: number,
  fallbackFolderId?: string,
  fallbackFolderName?: string,
): UploadedEpisodePayload {
  const resolvedTitle = customTitle.trim()
    ? customTitle.trim()
    : buildAutoEpisodeTitle(file.title, targetEpisodeNumber);

  const resolvedDuration =
    Number.isFinite(file.durationSec) && file.durationSec >= 5
      ? Math.min(600, Math.round(file.durationSec))
      : undefined;

  const resolvedEmbed =
    normalizeDoodstreamEmbedUrl(file.embedUrl) ||
    normalizeDoodstreamEmbedUrl(file.filecode) ||
    file.embedUrl;

  return {
    title: resolvedTitle,
    embedUrl: resolvedEmbed,
    filecode: file.filecode.trim() || undefined,
    durationSec: resolvedDuration,
    folderId: file.folderId?.trim() || fallbackFolderId?.trim() || undefined,
    folderName: fallbackFolderName?.trim() || undefined,
  };
}
