import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoEpisodeTitle,
  extractDoodstreamFileCode,
  isValidRemoteVideoUrl,
  normalizeDoodstreamEmbedUrl,
  sanitizeDoodstreamFolderName,
} from './doodstream';

test('extractDoodstreamFileCode parses raw filecodes, embed URLs, and download URLs', () => {
  assert.equal(extractDoodstreamFileCode('abc123xyz999'), 'abc123xyz999');
  assert.equal(
    extractDoodstreamFileCode('https://dood.to/e/abc123xyz999'),
    'abc123xyz999',
  );
  assert.equal(
    extractDoodstreamFileCode('https://doodstream.com/d/xyz987654'),
    'xyz987654',
  );
  assert.equal(extractDoodstreamFileCode('https://example.com/e/abc123'), null);
  assert.equal(extractDoodstreamFileCode(''), null);
});

test('normalizeDoodstreamEmbedUrl outputs HTTPS /e/ embed URL', () => {
  assert.equal(
    normalizeDoodstreamEmbedUrl('abc123xyz999'),
    'https://dood.to/e/abc123xyz999',
  );
  assert.equal(
    normalizeDoodstreamEmbedUrl('https://ds2play.com/d/abc123xyz999'),
    'https://ds2play.com/e/abc123xyz999',
  );
  assert.equal(normalizeDoodstreamEmbedUrl('not a url'), null);
});

test('isValidRemoteVideoUrl validates http/https URLs only', () => {
  assert.equal(isValidRemoteVideoUrl('https://cdn.example.com/ep1.mp4'), true);
  assert.equal(isValidRemoteVideoUrl('http://cdn.example.com/ep1.mp4'), true);
  assert.equal(isValidRemoteVideoUrl('ftp://cdn.example.com/ep1.mp4'), false);
  assert.equal(isValidRemoteVideoUrl('javascript:alert(1)'), false);
});

test('sanitizeDoodstreamFolderName and buildAutoEpisodeTitle produce clean folder & episode names', () => {
  assert.equal(
    sanitizeDoodstreamFolderName('  Senja di / Sudirman  '),
    'Senja di - Sudirman',
  );
  assert.equal(sanitizeDoodstreamFolderName('   '), 'LayarMini');
  assert.equal(
    buildAutoEpisodeTitle('pertemuan_hujan-ep1.mp4', 1),
    'pertemuan hujan ep1',
  );
  assert.equal(buildAutoEpisodeTitle('', 4), 'Episode 4');
});
