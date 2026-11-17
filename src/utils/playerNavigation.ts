export type LayarMiniHistoryView = 'home' | 'player' | 'ad' | 'admin';

export interface LayarMiniHistoryState {
  layarminiView: LayarMiniHistoryView;
  canPopToHome?: boolean;
  seriesId?: string;
  episodeNumber?: number;
}

export interface PlayerUrlTarget {
  seriesId: string;
  episodeNumber: number;
}

export type CloseHistoryAction = 'history-back' | 'replace-to-home';

export interface PopStateResolution {
  nextPath: string;
  shouldClosePlayer: boolean;
  shouldCloseAd: boolean;
  shouldResetToHomeSection: boolean;
  restorePlayerTarget: PlayerUrlTarget | null;
}

export function isLayarMiniHistoryState(
  value: unknown,
): value is LayarMiniHistoryState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const view = (value as Record<string, unknown>).layarminiView;
  return (
    view === 'home' || view === 'player' || view === 'ad' || view === 'admin'
  );
}

export function buildPlayerWatchUrl(
  seriesId: string,
  episodeNumber: number,
  isAdminRoute = false,
): string {
  if (isAdminRoute) {
    return '/admin';
  }
  const safeEp =
    Number.isFinite(episodeNumber) && episodeNumber >= 1
      ? Math.floor(episodeNumber)
      : 1;
  const params = new URLSearchParams();
  params.set('series', seriesId);
  params.set('ep', String(safeEp));
  return `/?${params.toString()}`;
}

export function parsePlayerUrlTarget(search: string): PlayerUrlTarget | null {
  const params = new URLSearchParams(search);
  const seriesId = params.get('series')?.trim();
  if (!seriesId) {
    return null;
  }
  const rawEp = Number(params.get('ep') ?? '1');
  const episodeNumber =
    Number.isFinite(rawEp) && rawEp >= 1 ? Math.floor(rawEp) : 1;
  return { seriesId, episodeNumber };
}

export function createBaseHistoryState(
  isAdminRoute: boolean,
): LayarMiniHistoryState {
  return {
    layarminiView: isAdminRoute ? 'admin' : 'home',
    canPopToHome: false,
  };
}

export function createPlayerHistoryState(
  seriesId: string,
  episodeNumber: number,
  canPopToHome = true,
): LayarMiniHistoryState {
  return {
    layarminiView: 'player',
    canPopToHome,
    seriesId,
    episodeNumber: Math.max(1, Math.floor(episodeNumber)),
  };
}

export function createAdHistoryState(
  seriesId: string,
  episodeNumber: number,
  canPopToHome = true,
): LayarMiniHistoryState {
  return {
    layarminiView: 'ad',
    canPopToHome,
    seriesId,
    episodeNumber: Math.max(1, Math.floor(episodeNumber)),
  };
}

/**
 * Decides how an in-app "Kembali" / Close click should sync browser history.
 * Only calls history.back() when we explicitly pushed the overlay entry AND
 * there is a base entry behind it (historyLength > 1) — guaranteeing clicking
 * Back can NEVER auto-close the website or exit the tab.
 */
export function resolveCloseHistoryAction(
  currentHistoryState: unknown,
  historyLength: number,
): CloseHistoryAction {
  if (
    isLayarMiniHistoryState(currentHistoryState) &&
    (currentHistoryState.layarminiView === 'player' ||
      currentHistoryState.layarminiView === 'ad') &&
    currentHistoryState.canPopToHome === true &&
    historyLength > 1
  ) {
    return 'history-back';
  }
  return 'replace-to-home';
}

/**
 * Resolves what App state should change when the browser fires `popstate`
 * (e.g. hardware Back button on Android, swipe-back on iOS, or browser Back/Forward).
 */
export function resolvePopStateOutcome(
  pathname: string,
  historyState: unknown,
): PopStateResolution {
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (
    isLayarMiniHistoryState(historyState) &&
    historyState.layarminiView === 'player' &&
    typeof historyState.seriesId === 'string' &&
    historyState.seriesId.trim().length > 0
  ) {
    const ep =
      typeof historyState.episodeNumber === 'number' &&
      Number.isFinite(historyState.episodeNumber) &&
      historyState.episodeNumber >= 1
        ? Math.floor(historyState.episodeNumber)
        : 1;
    return {
      nextPath: pathname,
      shouldClosePlayer: false,
      shouldCloseAd: true,
      shouldResetToHomeSection: false,
      restorePlayerTarget: {
        seriesId: historyState.seriesId,
        episodeNumber: ep,
      },
    };
  }

  return {
    nextPath: pathname,
    shouldClosePlayer: true,
    shouldCloseAd: true,
    shouldResetToHomeSection: !isAdmin,
    restorePlayerTarget: null,
  };
}
