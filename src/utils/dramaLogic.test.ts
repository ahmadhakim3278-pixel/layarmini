import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProgressPercent,
  countUnlockedEpisodes,
  detectVerticalSwipeDirection,
  filterSeries,
  formatDuration,
  getEffectivePlaybackSpeed,
  getNextEpisode,
  getPrevEpisode,
  getSubtitleAtTime,
  isEpisodeUnlocked,
  makeEpisodeKey,
  toggleDoubleSpeedOnTap,
  unlockEpisodesWithAd,
  upsertWatchHistory,
} from './dramaLogic';
import { DramaGenre, type DramaSeries } from '../types/drama';

const sampleSeries: DramaSeries[] = [
  {
    id: 'senja-sudirman',
    title: 'Senja di Sudirman',
    subtitle: 'Pertemuan ulang di lantai 42',
    genre: DramaGenre.Romance,
    year: 2026,
    cast: ['Raka Pratama', 'Nadia Kirana'],
    director: 'Dimas Adi',
    synopsis: 'Kisah cinta lama di tengah persaingan bisnis Jakarta.',
    posterUrl: '/poster1.jpg',
    freeUntilEpisode: 3,
    baseLikes: 1240,
    viewsLabel: '1,8 Jt',
    episodes: Array.from({ length: 8 }, (_, idx) => ({
      number: idx + 1,
      title: `Babak ${idx + 1}`,
      synopsis: `Sinopsis episode ${idx + 1}`,
      durationSec: 30,
      sceneMood: 'Lobi Kaca Senja',
      accentTint: '#E11D48',
      subtitles: [
        { startSec: 0, endSec: 5, speaker: 'Nadia', text: 'Kita ketemu lagi.' },
        { startSec: 5, endSec: 12, speaker: 'Raka', text: 'Lima tahun bukan waktu sebentar.' },
      ],
    })),
  },
  {
    id: 'kode-hujan',
    title: 'Kode di Balik Hujan',
    subtitle: 'Jejak yang hilang tengah malam',
    genre: DramaGenre.Mystery,
    year: 2026,
    cast: ['Bagas Wijaya', 'Clara Sinta'],
    director: 'Rizky Mahendra',
    synopsis: 'Detektif muda memecahkan pesan rahasia di kota tua.',
    posterUrl: '/poster2.jpg',
    freeUntilEpisode: 2,
    baseLikes: 890,
    viewsLabel: '920 Rb',
    episodes: Array.from({ length: 6 }, (_, idx) => ({
      number: idx + 1,
      title: `Petunjuk ${idx + 1}`,
      synopsis: `Petunjuk ke-${idx + 1}`,
      durationSec: 32,
      sceneMood: 'Gang Basah',
      accentTint: '#F59E0B',
      subtitles: [],
    })),
  },
];

test('isEpisodeUnlocked respects free threshold and unlocked ad keys', () => {
  const unlocked = [makeEpisodeKey('senja-sudirman', 4)];
  assert.equal(isEpisodeUnlocked('senja-sudirman', 1, 3, unlocked), true);
  assert.equal(isEpisodeUnlocked('senja-sudirman', 3, 3, unlocked), true);
  assert.equal(isEpisodeUnlocked('senja-sudirman', 4, 3, unlocked), true);
  assert.equal(isEpisodeUnlocked('senja-sudirman', 5, 3, unlocked), false);
  assert.equal(isEpisodeUnlocked('senja-sudirman', 0, 3, unlocked), false);
});

test('unlockEpisodesWithAd unlocks single or bonus episodes within series bounds', () => {
  const afterSingle = unlockEpisodesWithAd([], sampleSeries[0], 4, 1);
  assert.deepEqual(afterSingle, ['senja-sudirman::ep-4']);

  const afterBonus = unlockEpisodesWithAd(afterSingle, sampleSeries[0], 7, 3);
  assert.equal(afterBonus.includes('senja-sudirman::ep-7'), true);
  assert.equal(afterBonus.includes('senja-sudirman::ep-8'), true);
  assert.equal(afterBonus.includes('senja-sudirman::ep-9'), false);
});

test('filterSeries filters by genre and query across title, cast, and synopsis', () => {
  const all = filterSeries(sampleSeries, DramaGenre.All, '');
  assert.equal(all.length, 2);

  const mysteryOnly = filterSeries(sampleSeries, DramaGenre.Mystery, '');
  assert.equal(mysteryOnly.length, 1);
  assert.equal(mysteryOnly[0].id, 'kode-hujan');

  const byCast = filterSeries(sampleSeries, DramaGenre.All, 'nadia');
  assert.equal(byCast.length, 1);
  assert.equal(byCast[0].id, 'senja-sudirman');
});

test('getNextEpisode and getPrevEpisode return adjacent episodes cleanly', () => {
  assert.equal(getPrevEpisode(sampleSeries[0], 1), null);
  assert.equal(getPrevEpisode(sampleSeries[0], 3)?.number, 2);
  assert.equal(getNextEpisode(sampleSeries[0], 3)?.number, 4);
  assert.equal(getNextEpisode(sampleSeries[0], 8), null);
});

test('getSubtitleAtTime finds matching cue at active timestamp', () => {
  const cues = sampleSeries[0].episodes[0].subtitles;
  assert.equal(getSubtitleAtTime(cues, 0)?.speaker, 'Nadia');
  assert.equal(getSubtitleAtTime(cues, 4.9)?.speaker, 'Nadia');
  assert.equal(getSubtitleAtTime(cues, 5)?.speaker, 'Raka');
  assert.equal(getSubtitleAtTime(cues, 12), null);
});

test('formatDuration and calculateProgressPercent produce accurate output', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(calculateProgressPercent(15, 30), 50);
  assert.equal(calculateProgressPercent(40, 30), 100);
  assert.equal(calculateProgressPercent(10, 0), 0);
});

test('upsertWatchHistory moves updated series to front without duplicates', () => {
  const first = upsertWatchHistory([], {
    seriesId: 'senja-sudirman',
    episodeNumber: 1,
    progressSec: 12,
    durationSec: 30,
    updatedAt: 100,
  });
  const second = upsertWatchHistory(first, {
    seriesId: 'kode-hujan',
    episodeNumber: 2,
    progressSec: 8,
    durationSec: 32,
    updatedAt: 200,
  });
  const third = upsertWatchHistory(second, {
    seriesId: 'senja-sudirman',
    episodeNumber: 2,
    progressSec: 20,
    durationSec: 30,
    updatedAt: 300,
  });

  assert.equal(third.length, 2);
  assert.equal(third[0].seriesId, 'senja-sudirman');
  assert.equal(third[0].episodeNumber, 2);
});

test('countUnlockedEpisodes sums free and ad-unlocked episodes', () => {
  const unlocked = [
    makeEpisodeKey('senja-sudirman', 4),
    makeEpisodeKey('senja-sudirman', 5),
  ];
  assert.equal(countUnlockedEpisodes(sampleSeries[0], unlocked), 5);
});

test('detectVerticalSwipeDirection detects swipe up for next and swipe down for prev', () => {
  assert.equal(detectVerticalSwipeDirection(-80, 10), 'next');
  assert.equal(detectVerticalSwipeDirection(85, -12), 'prev');
  assert.equal(detectVerticalSwipeDirection(-20, 0), null);
  assert.equal(detectVerticalSwipeDirection(-60, 75), null);
});

test('toggleDoubleSpeedOnTap switches between 1x/other speeds and 2x', () => {
  assert.equal(toggleDoubleSpeedOnTap(1), 2);
  assert.equal(toggleDoubleSpeedOnTap(1.5), 2);
  assert.equal(toggleDoubleSpeedOnTap(2), 1);
});

test('getEffectivePlaybackSpeed returns 2x while holding and baseSpeed on release', () => {
  assert.equal(getEffectivePlaybackSpeed(1, true), 2);
  assert.equal(getEffectivePlaybackSpeed(1, false), 1);
  assert.equal(getEffectivePlaybackSpeed(1.25, true), 2);
  assert.equal(getEffectivePlaybackSpeed(1.25, false), 1.25);
});
