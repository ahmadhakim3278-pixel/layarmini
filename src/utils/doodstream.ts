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
  'dood.li',
  'dood.ws',
  'dood.sh',
  'dood.re',
  'dood.pm',
  'dood.wf',
  'dood.yt',
  'dood.cx',
  'doodstream.com',
  'ds2play.com',
  'dsvplay.com',
  'playmogo.com',
  'myvidplay.com',
  'vidply.com',
  'doply.net',
  'd-s.io',
  'do0od.com',
  'd0o0d.com',
  'd000d.com',
  'd0000d.com',
  'dooood.com',
]);

const DEAD_DOODSTREAM_MIRRORS = new Set(['dsvplay.com']);

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

  // Raw filecode or protected embed hash (strictly alphanumeric, 6-64 chars)
  if (/^[a-zA-Z0-9]{6,64}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const isKnownDoodHost =
      DOODSTREAM_HOSTS.has(hostname) ||
      hostname.includes('dood') ||
      hostname.includes('ds2play') ||
      hostname.includes('dsvplay') ||
      hostname.includes('playmogo') ||
      hostname.includes('myvidplay') ||
      hostname.includes('vidply') ||
      hostname.includes('doply');

    if (!isKnownDoodHost) {
      return null;
    }

    const match = parsed.pathname.match(/\/(?:e|d|f)\/([a-zA-Z0-9_-]{6,64})/);
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
      const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
      if (DEAD_DOODSTREAM_MIRRORS.has(hostname)) {
        return `https://dood.to/e/${filecode}`;
      }
      return `https://${parsed.hostname}/e/${filecode}`;
    } catch {
      return `https://dood.to/e/${filecode}`;
    }
  }

  return `https://dood.to/e/${filecode}`;
}

export interface AutoplayStreamOptions {
  autoplay?: boolean;
  muted?: boolean;
  reloadToken?: number;
}

export function buildAutoplayStreamUrl(
  rawEmbedUrl: string,
  options: AutoplayStreamOptions = {},
): string | null {
  const canonical = normalizeDoodstreamEmbedUrl(rawEmbedUrl);
  if (!canonical) {
    return null;
  }

  try {
    const parsed = new URL(canonical);
    if (options.autoplay !== false) {
      parsed.searchParams.set('autoplay', '1');
      parsed.searchParams.set('autostart', '1');
      parsed.searchParams.set('playsinline', '1');
    }
    if (options.muted) {
      parsed.searchParams.set('muted', '1');
      parsed.searchParams.set('mute', '1');
    }
    if (options.reloadToken && options.reloadToken > 0) {
      parsed.searchParams.set('r', String(options.reloadToken));
    }
    return parsed.toString();
  } catch {
    return canonical;
  }
}

export type VideoSourceType = 'direct' | 'embed';

const DIRECT_VIDEO_EXT_RE = /\.(?:mp4|webm|m4v|ogg|ogv)(?:$|[?#])/i;

export function isDirectVideoUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return DIRECT_VIDEO_EXT_RE.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

export function detectVideoSourceType(input: string): VideoSourceType | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (isDirectVideoUrl(trimmed)) {
    return 'direct';
  }
  if (normalizeDoodstreamEmbedUrl(trimmed)) {
    return 'embed';
  }
  return null;
}

export function normalizeStreamVideoUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (isDirectVideoUrl(trimmed)) {
    return trimmed;
  }
  return normalizeDoodstreamEmbedUrl(trimmed);
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
