import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendUploadedEpisodeToSeries,
  attachDoodstreamFolderToSeries,
  attachUploadedVideoToEpisode,
  computeCatalogStats,
  countDoodstreamEpisodes,
  deleteEpisodeFromSeries,
  deleteSeriesFromCatalog,
  reorderEpisodeInSeries,
  setFeaturedSeriesInCatalog,
  slugifySeriesId,
  upsertEpisodeInSeries,
  upsertSeriesInCatalog,
  validateEpisodeInput,
  validateSeriesInput,
} from './adminCatalog';
import { DramaGenre, type DramaSeries } from '../types/drama';

const baseCatalog: DramaSeries[] = [
  {
    id: 'senja-di-sudirman',
    title: 'Senja di Sudirman',
    subtitle: 'Balkon lantai 42',
    genre: DramaGenre.Romance,
    year: 2026,
    cast: ['Raka', 'Nadia'],
    director: 'Dimas Adi',
    synopsis: 'Kisah pertemuan kembali di gedung perkantoran Sudirman.',
    posterUrl: '/poster1.jpg',
    freeUntilEpisode: 2,
    baseLikes: 100,
    viewsLabel: '1,2 Jt tayangan',
    episodes: [
      {
        number: 1,
        title: 'Pertemuan Pertama',
        synopsis: 'Pembukaan',
        durationSec: 28,
        sceneMood: 'Lobi Senja',
        accentTint: '#E11D48',
        subtitles: [],
      },
      {
        number: 2,
        title: 'Cincin Lama',
        synopsis: 'Konflik',
        durationSec: 28,
        sceneMood: 'Ruang Rapat',
        accentTint: '#E11D48',
        subtitles: [],
      },
      {
        number: 3,
        title: 'Tawaran Baru',
        synopsis: 'Klimaks',
        durationSec: 30,
        sceneMood: 'Rooftop',
        accentTint: '#E11D48',
        subtitles: [],
      },
    ],
  },
];

test('slugifySeriesId generates unique slugs without collisions', () => {
  assert.equal(slugifySeriesId('Jejak di Kemang!', []), 'jejak-di-kemang');
  assert.equal(
    slugifySeriesId('Senja di Sudirman', ['senja-di-sudirman']),
    'senja-di-sudirman-2',
  );
});

test('validateSeriesInput and validateEpisodeInput catch empty and invalid fields', () => {
  const seriesErrors = validateSeriesInput({
    title: '   ',
    subtitle: '',
    genre: DramaGenre.Mystery,
    year: 1800,
    castText: '',
    director: '',
    synopsis: 'Pendek',
    posterUrl: '',
    freeUntilEpisode: -1,
    viewsLabel: '',
  });
  assert.ok(seriesErrors.title);
  assert.ok(seriesErrors.director);
  assert.ok(seriesErrors.synopsis);
  assert.ok(seriesErrors.year);
  assert.ok(seriesErrors.freeUntilEpisode);

  const epErrors = validateEpisodeInput({
    title: '',
    synopsis: '',
    durationSec: 2,
    sceneMood: '',
    accentTint: '#E11D48',
    subtitles: [{ startSec: 5, endSec: 3, speaker: 'A', text: 'Halo' }],
  });
  assert.ok(epErrors.title);
  assert.ok(epErrors.durationSec);
  assert.ok(epErrors.sceneMood);
  assert.ok(epErrors.subtitles);
});

test('upsertSeriesInCatalog adds new film and edits existing film cleanly', () => {
  const { catalog: afterAdd, savedSeries } = upsertSeriesInCatalog(baseCatalog, {
    title: 'Jejak di Kemang',
    subtitle: 'Rahasia di balik hujan malam',
    genre: DramaGenre.Mystery,
    year: 2026,
    castText: 'Rani, Dimas',
    director: 'Budi Santoso',
    synopsis: 'Seorang jurnalis menelusuri misteri kafe tua di Kemang.',
    posterUrl: '/poster-kemang.jpg',
    freeUntilEpisode: 2,
    viewsLabel: 'Baru rilis',
  });

  assert.equal(afterAdd.length, 2);
  assert.equal(savedSeries.id, 'jejak-di-kemang');
  assert.deepEqual(savedSeries.cast, ['Rani', 'Dimas']);

  const { catalog: afterEdit } = upsertSeriesInCatalog(
    afterAdd,
    {
      title: 'Jejak di Kemang (Edisi Khusus)',
      subtitle: 'Rahasia di balik hujan malam',
      genre: DramaGenre.Action,
      year: 2026,
      castText: 'Rani, Dimas, Tara',
      director: 'Budi Santoso',
      synopsis: 'Seorang jurnalis menelusuri misteri kafe tua di Kemang.',
      posterUrl: '/poster-kemang.jpg',
      freeUntilEpisode: 3,
      viewsLabel: '500 Rb tayangan',
    },
    'jejak-di-kemang',
  );

  const edited = afterEdit.find((s) => s.id === 'jejak-di-kemang');
  assert.equal(edited?.title, 'Jejak di Kemang (Edisi Khusus)');
  assert.equal(edited?.genre, DramaGenre.Action);
  assert.equal(edited?.cast.length, 3);
});

test('upsertEpisodeInSeries, reorderEpisodeInSeries, and deleteEpisodeFromSeries keep numbering sequential', () => {
  const withAdded = upsertEpisodeInSeries(baseCatalog, 'senja-di-sudirman', {
    title: 'Episode Baru',
    synopsis: 'Babak tambahan',
    durationSec: 35,
    sceneMood: 'Balkon Malam',
    accentTint: '#E11D48',
    subtitles: [
      { startSec: 1, endSec: 5, speaker: 'Nadia', text: 'Ini babak baru.' },
    ],
  });
  assert.equal(withAdded[0].episodes.length, 4);
  assert.equal(withAdded[0].episodes[3].number, 4);

  const editedEp = upsertEpisodeInSeries(
    withAdded,
    'senja-di-sudirman',
    {
      title: 'Cincin Emas',
      synopsis: 'Konflik diperbarui',
      durationSec: 29,
      sceneMood: 'Ruang Direksi',
      accentTint: '#E11D48',
      subtitles: [],
    },
    2,
  );
  assert.equal(editedEp[0].episodes[1].title, 'Cincin Emas');

  const reordered = reorderEpisodeInSeries(
    editedEp,
    'senja-di-sudirman',
    4,
    'up',
  );
  assert.equal(reordered[0].episodes[2].title, 'Episode Baru');
  assert.deepEqual(
    reordered[0].episodes.map((e) => e.number),
    [1, 2, 3, 4],
  );

  const afterDelete = deleteEpisodeFromSeries(reordered, 'senja-di-sudirman', 1);
  assert.equal(afterDelete[0].episodes.length, 3);
  assert.deepEqual(
    afterDelete[0].episodes.map((e) => e.number),
    [1, 2, 3],
  );
});

test('deleteSeriesFromCatalog, setFeaturedSeriesInCatalog, and computeCatalogStats work accurately', () => {
  const { catalog: twoFilms } = upsertSeriesInCatalog(baseCatalog, {
    title: 'Film Kedua',
    subtitle: 'Subjudul',
    genre: DramaGenre.Comedy,
    year: 2026,
    castText: 'Ani',
    director: 'Salsa',
    synopsis: 'Komedi ringan tentang kedai kopi di Jakarta Selatan.',
    posterUrl: '/poster2.jpg',
    freeUntilEpisode: 1,
    viewsLabel: 'Baru rilis',
  });

  // new film is inserted at index 0; promote senja-di-sudirman back to index 0
  const promoted = setFeaturedSeriesInCatalog(twoFilms, 'senja-di-sudirman');
  assert.equal(promoted[0].id, 'senja-di-sudirman');

  const stats = computeCatalogStats(promoted);
  assert.deepEqual(stats, {
    totalSeries: 2,
    totalEpisodes: 3,
    totalFreeEpisodes: 2,
    totalAdEpisodes: 1,
  });

  const removed = deleteSeriesFromCatalog(promoted, 'senja-di-sudirman');
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, 'film-kedua');
});

test('validateEpisodeInput and upsertEpisodeInSeries normalize Doodstream embed URLs', () => {
  const invalidEp = validateEpisodeInput({
    title: 'Ep Doodstream',
    synopsis: 'Uji',
    durationSec: 25,
    sceneMood: 'Lobi',
    accentTint: '#E11D48',
    subtitles: [],
    doodstreamEmbedUrl: 'https://example.com/not-doodstream',
  });
  assert.ok(invalidEp.doodstreamEmbedUrl);

  const saved = upsertEpisodeInSeries(baseCatalog, 'senja-di-sudirman', {
    title: 'Ep Doodstream Valid',
    synopsis: 'Disimpan di Doodstream',
    durationSec: 30,
    sceneMood: 'Studio',
    accentTint: '#E11D48',
    subtitles: [],
    doodstreamEmbedUrl: 'https://dood.to/d/xyz998877',
  });
  const newEp = saved[0].episodes[3];
  assert.equal(newEp.doodstreamFileCode, 'xyz998877');
  assert.equal(newEp.doodstreamEmbedUrl, 'https://dood.to/e/xyz998877');
});

test('attachDoodstreamFolderToSeries and appendUploadedEpisodeToSeries unify folder & episodes under one title', () => {
  const withFolder = attachDoodstreamFolderToSeries(
    baseCatalog,
    'senja-di-sudirman',
    'fld_9988',
    'Senja di Sudirman',
  );
  assert.equal(withFolder[0].doodstreamFolderId, 'fld_9988');
  assert.equal(withFolder[0].doodstreamFolderName, 'Senja di Sudirman');

  const withUploaded = appendUploadedEpisodeToSeries(
    withFolder,
    'senja-di-sudirman',
    {
      title: 'Episode Spesial',
      embedUrl: 'https://dood.to/d/vid123456',
      durationSec: 45,
      folderId: 'fld_9988',
      folderName: 'Senja di Sudirman',
    },
  );
  assert.equal(withUploaded[0].episodes.length, 4);
  assert.equal(withUploaded[0].episodes[3].number, 4);
  assert.equal(
    withUploaded[0].episodes[3].doodstreamEmbedUrl,
    'https://dood.to/e/vid123456',
  );
  assert.equal(countDoodstreamEpisodes(withUploaded[0]), 1);

  const attachedToEp2 = attachUploadedVideoToEpisode(
    withUploaded,
    'senja-di-sudirman',
    2,
    {
      embedUrl: 'https://dood.to/d/ep2video99',
      durationSec: 52,
      folderId: 'fld_9988',
      folderName: 'Senja di Sudirman',
    },
  );
  assert.equal(
    attachedToEp2[0].episodes[1].doodstreamEmbedUrl,
    'https://dood.to/e/ep2video99',
  );
  assert.equal(attachedToEp2[0].episodes[1].doodstreamFileCode, 'ep2video99');
  assert.equal(attachedToEp2[0].episodes[1].durationSec, 52);
  assert.equal(countDoodstreamEpisodes(attachedToEp2[0]), 2);
});

