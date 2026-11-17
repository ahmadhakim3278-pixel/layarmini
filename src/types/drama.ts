export enum DramaGenre {
  All = 'Semua',
  Romance = 'Romansa',
  Mystery = 'Misteri',
  Family = 'Keluarga',
  Comedy = 'Komedi',
  Action = 'Aksi',
}

export enum AdFormat {
  InteractiveChoice = 'choice',
  QuickQuiz = 'quiz',
  PromoReveal = 'promo',
}

export enum NavSection {
  Home = 'beranda',
  Explore = 'jelajah',
  Saved = 'tersimpan',
  History = 'riwayat',
}

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
}

export interface Episode {
  number: number;
  title: string;
  synopsis: string;
  durationSec: number;
  sceneMood: string;
  accentTint: string;
  subtitles: SubtitleCue[];
  doodstreamFileCode?: string;
  doodstreamEmbedUrl?: string;
}

export interface DramaSeries {
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
  episodes: Episode[];
  doodstreamFolderId?: string;
  doodstreamFolderName?: string;
}

export interface InteractiveAdOption {
  id: string;
  label: string;
  detail: string;
  isCorrect?: boolean;
}

export interface InteractiveAdCampaign {
  id: string;
  sponsorName: string;
  tagline: string;
  format: AdFormat;
  durationSec: number;
  bonusEpisodes: number;
  promptQuestion: string;
  rewardMessage: string;
  voucherCode?: string;
  options: InteractiveAdOption[];
}

export interface WatchHistoryEntry {
  seriesId: string;
  episodeNumber: number;
  progressSec: number;
  durationSec: number;
  updatedAt: number;
}
