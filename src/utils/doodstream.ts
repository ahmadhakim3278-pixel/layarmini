export interface DoodstreamUploadResult {
  filecode: string;
  embedUrl: string;
  downloadUrl: string;
  title?: string;
  splashImg?: string;
  singleImg?: string;
  durationSec?: number;
  folderId?: string;
  folderName?: string;
  folderCreated?: boolean;
}

const DOODSTREAM_HOSTS = new Set([
  'dood.to',
  'dood.so',
  'dood.la',
  'dood.ws',
  'dood.sh',
  'dood.re',
  'dood.pm',
  'dood.wf',
  'dood.yt',
  'dood.cx',
  'doodstream.com',
  'ds2play.com',
  'do0od.com',
  'd0o0d.com',
  'dooood.com',
]);

export function sanitizeDoodstreamFolderName(title: string): string {
  const cleaned = title
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'LayarMini';
}

export function buildAutoEpisodeTitle(
  filenameOrTitle: string,
  nextEpisodeNumber: number,
): string {
  const trimmed = filenameOrTitle.trim();
  if (!trimmed) {
    return `Episode ${nextEpisodeNumber}`;
  }
  const withoutExt = trimmed.replace(/\.[a-z0-9]{2,5}$/i, '');
  const cleaned = withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || `Episode ${nextEpisodeNumber}`;
}

export function extractDoodstreamFileCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Raw filecode (alphanumeric, 6-24 chars)
  if (/^[a-zA-Z0-9_-]{6,24}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const isKnownDoodHost =
      DOODSTREAM_HOSTS.has(hostname) ||
      hostname.includes('dood') ||
      hostname.includes('ds2play');

    if (!isKnownDoodHost) {
      return null;
    }

    const match = parsed.pathname.match(/\/(?:e|d|f)\/([a-zA-Z0-9_-]{6,24})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function normalizeDoodstreamEmbedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const filecode = extractDoodstreamFileCode(trimmed);
  if (!filecode) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/e/')) {
        return `https://${parsed.hostname}/e/${filecode}`;
      }
      return `https://${parsed.hostname}/e/${filecode}`;
    } catch {
      return `https://dood.to/e/${filecode}`;
    }
  }

  return `https://dood.to/e/${filecode}`;
}

export function isValidRemoteVideoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
