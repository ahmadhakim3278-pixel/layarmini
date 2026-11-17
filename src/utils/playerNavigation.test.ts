import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerWatchUrl,
  createAdHistoryState,
  createBaseHistoryState,
  createPlayerHistoryState,
  parsePlayerUrlTarget,
  resolveCloseHistoryAction,
  resolvePopStateOutcome,
} from './playerNavigation';

test('buildPlayerWatchUrl formats viewer watch URLs and preserves /admin in admin preview', () => {
  assert.equal(
    buildPlayerWatchUrl('warisan-dapur-nenek', 2, false),
    '/?series=warisan-dapur-nenek&ep=2',
  );
  assert.equal(
    buildPlayerWatchUrl('senja-di-sudirman', 0, false),
    '/?series=senja-di-sudirman&ep=1',
  );
  assert.equal(
    buildPlayerWatchUrl('warisan-dapur-nenek', 3, true),
    '/admin',
  );
});

test('parsePlayerUrlTarget parses valid series & ep params safely', () => {
  assert.deepEqual(parsePlayerUrlTarget('?series=warisan-dapur-nenek&ep=4'), {
    seriesId: 'warisan-dapur-nenek',
    episodeNumber: 4,
  });
  assert.deepEqual(parsePlayerUrlTarget('?series=senja'), {
    seriesId: 'senja',
    episodeNumber: 1,
  });
  assert.equal(parsePlayerUrlTarget(''), null);
  assert.equal(parsePlayerUrlTarget('?autostart=1'), null);
});

test('resolveCloseHistoryAction only uses history-back when overlay was pushed with historyLength > 1', () => {
  const pushedPlayerState = createPlayerHistoryState('warisan-dapur-nenek', 1, true);
  assert.equal(resolveCloseHistoryAction(pushedPlayerState, 2), 'history-back');

  // Never calls history.back() if historyLength <= 1 (prevents auto-closing website!)
  assert.equal(resolveCloseHistoryAction(pushedPlayerState, 1), 'replace-to-home');

  const pushedAdState = createAdHistoryState('warisan-dapur-nenek', 4, true);
  assert.equal(resolveCloseHistoryAction(pushedAdState, 2), 'history-back');

  const homeState = createBaseHistoryState(false);
  assert.equal(resolveCloseHistoryAction(homeState, 3), 'replace-to-home');
  assert.equal(resolveCloseHistoryAction(null, 3), 'replace-to-home');
});

test('resolvePopStateOutcome closes player and returns to Home on viewer Back, stays on /admin in admin preview, and restores on Forward', () => {
  const backToHome = resolvePopStateOutcome('/', createBaseHistoryState(false));
  assert.equal(backToHome.shouldClosePlayer, true);
  assert.equal(backToHome.shouldCloseAd, true);
  assert.equal(backToHome.shouldResetToHomeSection, true);
  assert.equal(backToHome.restorePlayerTarget, null);

  const backWithEmptyState = resolvePopStateOutcome('/', null);
  assert.equal(backWithEmptyState.shouldClosePlayer, true);
  assert.equal(backWithEmptyState.shouldResetToHomeSection, true);

  const backToAdmin = resolvePopStateOutcome('/admin', createBaseHistoryState(true));
  assert.equal(backToAdmin.shouldClosePlayer, true);
  assert.equal(backToAdmin.shouldResetToHomeSection, false);

  const forwardToPlayer = resolvePopStateOutcome(
    '/',
    createPlayerHistoryState('warisan-dapur-nenek', 3, true),
  );
  assert.equal(forwardToPlayer.shouldClosePlayer, false);
  assert.equal(forwardToPlayer.shouldCloseAd, true);
  assert.deepEqual(forwardToPlayer.restorePlayerTarget, {
    seriesId: 'warisan-dapur-nenek',
    episodeNumber: 3,
  });
});
