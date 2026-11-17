import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutoEpisodeTitle,
  buildAutoplayStreamUrl,
  detectVideoSourceType,
  extractDoodstreamFileCode,
  isValidRemoteVideoUrl,
  normalizeDoodstreamEmbedUrl,
  normalizeStreamVideoUrl,
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
  assert.equal(
    normalizeDoodstreamEmbedUrl('https://dsvplay.com/e/1o97l8m7wba0'),
    'https://dood.to/e/1o97l8m7wba0',
  );
  assert.equal(
    normalizeDoodstreamEmbedUrl(
      'https://playmogo.com/e/nenr791c5jvcimv45g5wm3fibdi2zsbo',
    ),
    'https://playmogo.com/e/nenr791c5jvcimv45g5wm3fibdi2zsbo',
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

test('buildAutoplayStreamUrl appends autoplay params, canonicalizes dead mirrors, and supports reload tokens', () => {
  assert.equal(
    buildAutoplayStreamUrl('https://dsvplay.com/e/jjp9l0ss3cha'),
    'https://dood.to/e/jjp9l0ss3cha?autoplay=1&autostart=1&playsinline=1',
  );
  assert.equal(
    buildAutoplayStreamUrl('https://dood.to/e/jjp9l0ss3cha', {
      muted: true,
      reloadToken: 2,
    }),
    'https://dood.to/e/jjp9l0ss3cha?autoplay=1&autostart=1&playsinline=1&muted=1&mute=1&r=2',
  );
  assert.equal(buildAutoplayStreamUrl('not-a-valid-link'), null);
});

test('detectVideoSourceType and normalizeStreamVideoUrl handle direct MP4/WebM and Doodstream embeds', () => {
  assert.equal(
    detectVideoSourceType('https://pub-abc.r2.dev/dramas/ep1.mp4'),
    'direct',
  );
  assert.equal(
    detectVideoSourceType('https://cdn.example.com/video.webm?token=xyz'),
    'direct',
  );
  assert.equal(
    detectVideoSourceType('https://dsvplay.com/e/jjp9l0ss3cha'),
    'embed',
  );
  assert.equal(detectVideoSourceType('https://example.com/watch'), null);
  assert.equal(
    normalizeStreamVideoUrl('https://pub-abc.r2.dev/dramas/ep1.mp4'),
    'https://pub-abc.r2.dev/dramas/ep1.mp4',
  );
  assert.equal(
    normalizeStreamVideoUrl('https://dsvplay.com/e/jjp9l0ss3cha'),
    'https://dood.to/e/jjp9l0ss3cha',
  );
});
