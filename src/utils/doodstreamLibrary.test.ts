import test from 'node:test';
import assert from 'node:assert/strict';
import type { Episode } from '../types/drama';
import {
  buildEpisodePayloadFromLibraryFile,
  filterDoodstreamLibraryFiles,
  findUsedEpisodeNumber,
  type DoodstreamLibraryFile,
} from './doodstreamLibrary';

const sampleEpisodes: Episode[] = [
  {
    number: 1,
    title: 'Sabotase Bahan Baku',
    synopsis: 'Episode 1',
    durationSec: 172,
    sceneMood: 'Dapur',
    accentTint: '#E11D48',
    subtitles: [],
    doodstreamFileCode: 'abc123xyz',
    doodstreamEmbedUrl: 'https://playmogo.com/e/abc123xyz',
  },
  {
    number: 2,
    title: 'Resep Rahasia',
    synopsis: 'Episode 2',
    durationSec: 95,
    sceneMood: 'Pasar',
    accentTint: '#E11D48',
    subtitles: [],
    doodstreamEmbedUrl: 'https://dood.to/e/def456uvw',
  },
];

const sampleLibrary: DoodstreamLibraryFile[] = [
  {
    filecode: 'abc123xyz',
    title: 'Warisan_Ep1_Final.mp4',
    durationSec: 172,
    uploaded: '2026-11-17 09:00:00',
    embedUrl: 'https://dood.to/e/abc123xyz',
    folderId: '77',
  },
  {
    filecode: 'def456uvw',
    title: 'Warisan Ep 2.mp4',
    durationSec: 95,
    uploaded: '2026-11-17 09:10:00',
    embedUrl: 'https://dood.to/e/def456uvw',
    folderId: '77',
  },
  {
    filecode: 'ghi789rst',
    title: 'Warisan_Ep3_Babak_Baru.mp4',
    durationSec: 140,
    uploaded: '2026-11-17 09:20:00',
    embedUrl: 'https://dood.to/e/ghi789rst',
    folderId: '77',
  },
];

test('findUsedEpisodeNumber detects matching episode across mirrors and filecodes', () => {
  assert.equal(findUsedEpisodeNumber(sampleLibrary[0], sampleEpisodes), 1);
  assert.equal(findUsedEpisodeNumber(sampleLibrary[1], sampleEpisodes), 2);
  assert.equal(findUsedEpisodeNumber(sampleLibrary[2], sampleEpisodes), null);
});

test('filterDoodstreamLibraryFiles annotates used episodes, searches title/code, and supports hideUsed', () => {
  const all = filterDoodstreamLibraryFiles(sampleLibrary, sampleEpisodes, '', false);
  assert.equal(all.length, 3);
  assert.equal(all[0].usedInEpisode, 1);
  assert.equal(all[1].usedInEpisode, 2);
  assert.equal(all[2].usedInEpisode, null);

  const unusedOnly = filterDoodstreamLibraryFiles(
    sampleLibrary,
    sampleEpisodes,
    '',
    true,
  );
  assert.equal(unusedOnly.length, 1);
  assert.equal(unusedOnly[0].filecode, 'ghi789rst');

  const byCode = filterDoodstreamLibraryFiles(
    sampleLibrary,
    sampleEpisodes,
    'GHI789',
    false,
  );
  assert.equal(byCode.length, 1);
  assert.equal(byCode[0].filecode, 'ghi789rst');

  const byTitle = filterDoodstreamLibraryFiles(
    sampleLibrary,
    sampleEpisodes,
    'babak',
    false,
  );
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].filecode, 'ghi789rst');
});

test('filterDoodstreamLibraryFiles supports natural numeric sorting (Episode 1 -> 2 -> 10 -> 55)', () => {
  const newestFirst: DoodstreamLibraryFile[] = [
    {
      filecode: 'ep55code',
      title: 'Episode 55 - Streaming Gratis',
      durationSec: 120,
      uploaded: '2026-11-17 12:00:00',
      embedUrl: 'https://dood.to/e/ep55code',
    },
    {
      filecode: 'ep10code',
      title: 'Episode 10 - Streaming Gratis',
      durationSec: 118,
      uploaded: '2026-11-17 11:00:00',
      embedUrl: 'https://dood.to/e/ep10code',
    },
    {
      filecode: 'ep2code',
      title: 'Episode 2 - Streaming Gratis',
      durationSec: 115,
      uploaded: '2026-11-17 10:00:00',
      embedUrl: 'https://dood.to/e/ep2code',
    },
    {
      filecode: 'ep1code',
      title: 'Episode 1 - Streaming Gratis',
      durationSec: 112,
      uploaded: '2026-11-17 09:00:00',
      embedUrl: 'https://dood.to/e/ep1code',
    },
  ];

  const defaultOrder = filterDoodstreamLibraryFiles(newestFirst, [], '', false, 'newest');
  assert.deepEqual(
    defaultOrder.map((f) => f.filecode),
    ['ep55code', 'ep10code', 'ep2code', 'ep1code'],
  );

  const naturalOrder = filterDoodstreamLibraryFiles(newestFirst, [], '', false, 'name-asc');
  assert.deepEqual(
    naturalOrder.map((f) => f.filecode),
    ['ep1code', 'ep2code', 'ep10code', 'ep55code'],
  );
});

test('buildEpisodePayloadFromLibraryFile respects custom title, auto-cleans filename title, and clamps duration', () => {
  const withAutoTitle = buildEpisodePayloadFromLibraryFile(
    sampleLibrary[2],
    '',
    3,
    '77',
    'Warisan Dapur Nenek',
  );
  assert.equal(withAutoTitle.title, 'Warisan Ep3 Babak Baru');
  assert.equal(withAutoTitle.embedUrl, 'https://dood.to/e/ghi789rst');
  assert.equal(withAutoTitle.filecode, 'ghi789rst');
  assert.equal(withAutoTitle.durationSec, 140);
  assert.equal(withAutoTitle.folderId, '77');
  assert.equal(withAutoTitle.folderName, 'Warisan Dapur Nenek');

  const withCustomTitle = buildEpisodePayloadFromLibraryFile(
    {
      ...sampleLibrary[2],
      durationSec: 1200,
    },
    'Pertarungan Dapur',
    3,
  );
  assert.equal(withCustomTitle.title, 'Pertarungan Dapur');
  assert.equal(withCustomTitle.durationSec, 600);

  const withShortDuration = buildEpisodePayloadFromLibraryFile(
    {
      ...sampleLibrary[2],
      durationSec: 2,
    },
    '',
    4,
  );
  assert.equal(withShortDuration.durationSec, undefined);
});
