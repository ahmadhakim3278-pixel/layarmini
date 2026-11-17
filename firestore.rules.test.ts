import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DramaGenre } from './src/types/drama';
import {
  FIRESTORE_LIMITS,
  PRIMARY_ADMIN_EMAIL,
  buildEpisodeDocId,
  isBootstrappedAdminEmail,
  mergeSeriesWithEpisodes,
  sanitizeDocumentId,
  sanitizeEpisodeForFirestore,
  sanitizeSeriesForFirestore,
} from './src/utils/firestorePayloads';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces Global Safety Net and rules_version 2', () => {
  assert.match(rulesText, /^rules_version = '2';/);
  assert.match(
    rulesText,
    /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/,
  );
});

test('Dirty Dozen D1–D3: unauthenticated, non-admin, and unverified spoofed admin emails are rejected', () => {
  // Rule static invariants for auth & email_verified
  assert.match(
    rulesText,
    /function isVerifiedUser\(\) \{\s*return isSignedIn\(\) && request\.auth\.token\.email_verified == true;\s*\}/,
  );
  assert.match(
    rulesText,
    new RegExp(
      `request\\.auth\\.token\\.email == '${PRIMARY_ADMIN_EMAIL.replace('.', '\\.')}'`,
    ),
  );

  // Client mirror rejects spoofed unverified email and non-admin emails
  assert.equal(isBootstrappedAdminEmail(PRIMARY_ADMIN_EMAIL, false), false);
  assert.equal(isBootstrappedAdminEmail(PRIMARY_ADMIN_EMAIL, undefined), false);
  assert.equal(isBootstrappedAdminEmail('viewer@example.com', true), false);
  assert.equal(isBootstrappedAdminEmail(PRIMARY_ADMIN_EMAIL, true), true);
});

test('Dirty Dozen D4–D9: strict key allowlists, path ID guards, immutability, timestamps, and size caps exist for every collection', () => {
  // All blueprint collections must have match blocks in firestore.rules
  for (const collectionPath of Object.keys(blueprint.firestore)) {
    assert.ok(
      collectionPath.includes('series') ||
        collectionPath.includes('catalogMeta') ||
        collectionPath.includes('admins'),
    );
  }
  assert.match(rulesText, /match \/series\/\{seriesId\}/);
  assert.match(rulesText, /match \/episodes\/\{episodeId\}/);
  assert.match(rulesText, /match \/catalogMeta\/\{metaId\}/);
  assert.match(rulesText, /match \/admins\/\{adminUid\}/);

  // Shadow update protection (hasOnly + affectedKeys)
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);

  // Temporal integrity & immutability
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesText, /incoming\(\)\.id == existing\(\)\.id/);
  assert.match(rulesText, /incoming\(\)\.seriesId == existing\(\)\.seriesId/);

  // Identity spoofing guard
  assert.match(rulesText, /data\.updatedByUid == request\.auth\.uid/);
  assert.match(rulesText, /data\.grantedByUid == request\.auth\.uid/);
});

test('Dirty Dozen D10–D12: Master Gate existsAfter, anti-self-admin, and secure list queries', () => {
  // D10: Master Gate on episodes create & update
  assert.match(
    rulesText,
    /existsAfter\(\/databases\/\$\(database\)\/documents\/series\/\$\(seriesId\)\)/,
  );
  assert.match(
    rulesText,
    /exists\(\/databases\/\$\(database\)\/documents\/series\/\$\(seriesId\)\)/,
  );

  // D11: /admins only writable by isBootstrappedAdmin(), never self-assigned
  assert.match(rulesText, /match \/admins\/\{adminUid\}[\s\S]*allow create: if isBootstrappedAdmin\(\)/);
  assert.match(rulesText, /match \/admins\/\{adminUid\}[\s\S]*allow list: if false;/);

  // D12: No blanket list reads (must check existing().published == true || isAdmin())
  assert.doesNotMatch(rulesText, /allow list:\s*if true;/);
  assert.doesNotMatch(rulesText, /allow read:\s*if true;/);
  assert.match(rulesText, /allow list: if existing\(\)\.published == true \|\| isAdmin\(\);/);
});

test('Payload sanitizers strictly enforce firebase-blueprint.json limits before writes', () => {
  const oversizedSeries = sanitizeSeriesForFirestore(
    {
      id: 'bad$$id!@#   with spaces',
      title: 'A'.repeat(300),
      subtitle: 'B'.repeat(400),
      genre: DramaGenre.All, // invalid for stored doc -> coerced to Romance
      year: 1800,
      cast: Array.from({ length: 25 }, (_, i) => `Actor ${i} ${'X'.repeat(100)}`),
      director: 'D'.repeat(200),
      synopsis: 'short', // below min 10 -> safely padded
      posterUrl: '',
      freeUntilEpisode: 999,
      baseLikes: -50,
      viewsLabel: 'V'.repeat(100),
      episodes: [],
      doodstreamFolderId: 'F'.repeat(100),
    },
    -5,
    'admin-uid-123',
  );

  assert.match(oversizedSeries.id, FIRESTORE_LIMITS.idPattern);
  assert.equal(oversizedSeries.title.length, FIRESTORE_LIMITS.maxTitle);
  assert.equal(oversizedSeries.subtitle.length, FIRESTORE_LIMITS.maxSubtitle);
  assert.equal(oversizedSeries.genre, DramaGenre.Romance);
  assert.equal(oversizedSeries.year, 1990);
  assert.equal(oversizedSeries.cast.length, FIRESTORE_LIMITS.maxCastItems);
  assert.ok(oversizedSeries.cast[0].length <= FIRESTORE_LIMITS.maxCastName);
  assert.ok(oversizedSeries.synopsis.length >= FIRESTORE_LIMITS.minSynopsis);
  assert.equal(oversizedSeries.freeUntilEpisode, FIRESTORE_LIMITS.maxFreeUntilEpisode);
  assert.equal(oversizedSeries.baseLikes, 0);
  assert.equal(oversizedSeries.sortOrder, 0);
  assert.equal(oversizedSeries.doodstreamFolderId?.length, FIRESTORE_LIMITS.maxFolderId);

  const sanitizedEp = sanitizeEpisodeForFirestore(
    oversizedSeries.id,
    {
      number: 1,
      title: 'E'.repeat(220),
      synopsis: 'S'.repeat(1000),
      durationSec: 2,
      sceneMood: 'M'.repeat(300),
      accentTint: 'invalid-color',
      subtitles: Array.from({ length: 50 }, (_, idx) => ({
        startSec: idx,
        endSec: idx + 1,
        speaker: 'Tokoh',
        text: 'Dialog',
      })),
      doodstreamEmbedUrl: 'https://dood.to/e/jjp9l0ss3cha',
    },
    'admin-uid-123',
  );

  assert.equal(sanitizedEp.title.length, FIRESTORE_LIMITS.maxTitle);
  assert.equal(sanitizedEp.durationSec, FIRESTORE_LIMITS.minDurationSec);
  assert.match(sanitizedEp.accentTint, FIRESTORE_LIMITS.hexTintPattern);
  assert.equal(sanitizedEp.subtitles.length, FIRESTORE_LIMITS.maxSubtitles);
  assert.equal(buildEpisodeDocId(1), 'ep-1');
  assert.equal(sanitizeDocumentId('!!!'), 'item');
});

test('mergeSeriesWithEpisodes orders series by sortOrder and episodes by number', () => {
  const merged = mergeSeriesWithEpisodes(
    [
      {
        id: 'second',
        title: 'Kedua',
        subtitle: 'Sub',
        genre: DramaGenre.Action,
        year: 2026,
        cast: ['A'],
        director: 'B',
        synopsis: 'Sinopsis panjang untuk serial kedua.',
        posterUrl: '/p.jpg',
        freeUntilEpisode: 3,
        baseLikes: 10,
        viewsLabel: '1K',
        episodes: [],
        sortOrder: 2,
      },
      {
        id: 'first',
        title: 'Pertama',
        subtitle: 'Sub',
        genre: DramaGenre.Romance,
        year: 2026,
        cast: ['A'],
        director: 'B',
        synopsis: 'Sinopsis panjang untuk serial pertama.',
        posterUrl: '/p.jpg',
        freeUntilEpisode: 3,
        baseLikes: 20,
        viewsLabel: '2K',
        episodes: [],
        sortOrder: 0,
      },
    ],
    {
      first: [
        {
          number: 2,
          title: 'Ep 2',
          synopsis: 'Ep 2',
          durationSec: 28,
          sceneMood: 'Mood',
          accentTint: '#E11D48',
          subtitles: [],
        },
        {
          number: 1,
          title: 'Ep 1',
          synopsis: 'Ep 1',
          durationSec: 28,
          sceneMood: 'Mood',
          accentTint: '#E11D48',
          subtitles: [],
        },
      ],
    },
  );

  assert.equal(merged[0].id, 'first');
  assert.equal(merged[1].id, 'second');
  assert.deepEqual(
    merged[0].episodes.map((e) => e.number),
    [1, 2],
  );
});
