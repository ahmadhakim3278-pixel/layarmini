import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Bookmark,
  History,
  Play,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminPanel } from './components/AdminPanel';
import { HeaderNav } from './components/HeaderNav';
import { HeroShowcase } from './components/HeroShowcase';
import { InteractiveAdModal } from './components/InteractiveAdModal';
import { PosterImage } from './components/PosterImage';
import { SeriesCard } from './components/SeriesCard';
import { ShortPlayerModal } from './components/ShortPlayerModal';
import { DRAMA_SERIES, INTERACTIVE_AD_CAMPAIGNS } from './data/dramas';
import { auth } from './firebase';
import {
  bindSeriesFolderInFirestore,
  deleteSeriesDocFromFirestore,
  publishCatalogToFirestore,
  saveSeriesDocToFirestore,
  subscribeToOnlineCatalog,
  syncSeriesEpisodesInFirestore,
  updateCatalogSortOrderInFirestore,
  verifyAdminAccess,
} from './services/catalogFirestore';
import {
  DramaGenre,
  NavSection,
  type DramaSeries,
  type WatchHistoryEntry,
} from './types/drama';
import {
  appendUploadedEpisodeToSeries,
  attachDoodstreamFolderToSeries,
  attachUploadedVideoToEpisode,
  deleteEpisodeFromSeries,
  deleteSeriesFromCatalog,
  reorderEpisodeInSeries,
  setFeaturedSeriesInCatalog,
  upsertEpisodeInSeries,
  upsertSeriesInCatalog,
  type EpisodeFormInput,
  type SeriesFormInput,
  type UploadedEpisodePayload,
} from './utils/adminCatalog';
import {
  calculateProgressPercent,
  countUnlockedEpisodes,
  filterSeries,
  formatDuration,
  isEpisodeUnlocked,
  unlockEpisodesWithAd,
  upsertWatchHistory,
} from './utils/dramaLogic';

const STORAGE_KEYS = {
  catalog: 'layarmini_catalog_v1',
  unlocked: 'layarmini_unlocked_v1',
  history: 'layarmini_history_v1',
  saved: 'layarmini_saved_v1',
  liked: 'layarmini_liked_v1',
  adsCount: 'layarmini_ads_count_v1',
} as const;

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const GENRE_FILTERS: DramaGenre[] = [
  DramaGenre.All,
  DramaGenre.Romance,
  DramaGenre.Mystery,
  DramaGenre.Family,
  DramaGenre.Comedy,
  DramaGenre.Action,
];

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  );
  const [activeSection, setActiveSection] = useState<NavSection>(NavSection.Home);
  const [selectedGenre, setSelectedGenre] = useState<DramaGenre>(DramaGenre.All);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((path: '/' | '/admin') => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
    setPlayerState(null);
    setPendingAdUnlock(null);
    window.scrollTo({ top: 0 });
  }, []);

  const isAdminRoute =
    currentPath === '/admin' || currentPath.startsWith('/admin/');

  useEffect(() => {
    document.title = isAdminRoute
      ? 'LayarMini Studio — Panel Admin & Upload Doodstream'
      : 'LayarMini — Short Movie & Drama Pendek Gratis';
  }, [isAdminRoute]);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);

  const [onlineCatalogReady, setOnlineCatalogReady] = useState(false);
  const [isOnlineCatalogInitialized, setIsOnlineCatalogInitialized] = useState(false);
  const [isSyncingOnline, setIsSyncingOnline] = useState(false);
  const [fatalFirestoreError, setFatalFirestoreError] = useState<Error | null>(null);

  const [localCatalogDraft] = useState<DramaSeries[]>(() => {
    const stored = readStorageJson<DramaSeries[] | null>(
      STORAGE_KEYS.catalog,
      null,
    );
    return Array.isArray(stored) && stored.length > 0 ? stored : DRAMA_SERIES;
  });

  const [seriesCatalog, setSeriesCatalog] = useState<DramaSeries[]>(() =>
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' ||
      window.location.pathname.startsWith('/admin/'))
      ? localCatalogDraft
      : DRAMA_SERIES,
  );
  const seriesCatalogRef = useRef<DramaSeries[]>(seriesCatalog);
  seriesCatalogRef.current = seriesCatalog;

  const [unlockedKeys, setUnlockedKeys] = useState<string[]>(() =>
    readStorageJson<string[]>(STORAGE_KEYS.unlocked, []),
  );
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>(() =>
    readStorageJson<WatchHistoryEntry[]>(STORAGE_KEYS.history, []),
  );
  const [savedSeriesIds, setSavedSeriesIds] = useState<string[]>(() =>
    readStorageJson<string[]>(STORAGE_KEYS.saved, []),
  );
  const [likedSeriesIds, setLikedSeriesIds] = useState<string[]>(() =>
    readStorageJson<string[]>(STORAGE_KEYS.liked, []),
  );
  const [adsCompletedCount, setAdsCompletedCount] = useState<number>(() =>
    readStorageJson<number>(STORAGE_KEYS.adsCount, 0),
  );

  // Active player state
  const [playerState, setPlayerState] = useState<{
    seriesId: string;
    episodeNumber: number;
    initialTimeSec: number;
  } | null>(null);

  // Pending interactive ad unlock state
  const [pendingAdUnlock, setPendingAdUnlock] = useState<{
    series: DramaSeries;
    episodeNumber: number;
  } | null>(null);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setToastMessage(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Monitor Firebase Auth session & admin authorization
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) {
        return;
      }
      setAuthUser(user);
      if (!user) {
        setIsAdmin(false);
        setIsCheckingAdmin(false);
        setAuthReady(true);
        return;
      }
      setIsCheckingAdmin(true);
      void verifyAdminAccess(user)
        .then((allowed) => {
          if (!active) {
            return;
          }
          setIsAdmin(allowed);
          setIsCheckingAdmin(false);
          setAuthReady(true);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setIsAdmin(false);
          setIsCheckingAdmin(false);
          setAuthReady(true);
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Subscribe to real-time Firestore catalog once auth state is settled
  useEffect(() => {
    if (!authReady) {
      return;
    }
    const unsubscribe = subscribeToOnlineCatalog({
      isAdmin,
      onUpdate: (snapshot) => {
        setOnlineCatalogReady(snapshot.ready);
        setIsOnlineCatalogInitialized(snapshot.isInitialized);
        if (snapshot.isInitialized) {
          setSeriesCatalog(snapshot.seriesList);
        } else {
          setSeriesCatalog(isAdminRoute ? localCatalogDraft : DRAMA_SERIES);
        }
      },
      onError: (error) => {
        setFatalFirestoreError(error);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [authReady, isAdmin, isAdminRoute, localCatalogDraft]);

  if (fatalFirestoreError) {
    throw fatalFirestoreError;
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.unlocked,
        JSON.stringify(unlockedKeys),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [unlockedKeys]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.history,
        JSON.stringify(watchHistory),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [watchHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.saved,
        JSON.stringify(savedSeriesIds),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [savedSeriesIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.liked,
        JSON.stringify(likedSeriesIds),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [likedSeriesIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.adsCount,
        JSON.stringify(adsCompletedCount),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [adsCompletedCount]);

  // Support ?autostart=1 and shared ?series=<id>&ep=<n> deep links on consumer pages
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (isAdminRoute || deepLinkAppliedRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const sharedSeriesId = params.get('series');
    if (sharedSeriesId) {
      if (!onlineCatalogReady && !seriesCatalog.some((s) => s.id === sharedSeriesId)) {
        return;
      }
      const matched = seriesCatalog.find((s) => s.id === sharedSeriesId);
      if (matched && matched.episodes.length > 0) {
        const requestedEp = Number(params.get('ep') ?? '1');
        const safeEp = Number.isFinite(requestedEp)
          ? Math.max(1, Math.min(Math.floor(requestedEp), matched.episodes.length))
          : 1;
        deepLinkAppliedRef.current = true;
        if (
          isEpisodeUnlocked(
            matched.id,
            safeEp,
            matched.freeUntilEpisode,
            unlockedKeys,
          )
        ) {
          setPlayerState({
            seriesId: matched.id,
            episodeNumber: safeEp,
            initialTimeSec: 0,
          });
        } else {
          setPendingAdUnlock({ series: matched, episodeNumber: safeEp });
        }
      }
      return;
    }
    if (params.get('autostart') === '1') {
      const lead = seriesCatalog[0];
      if (lead && lead.episodes.length > 0) {
        deepLinkAppliedRef.current = true;
        setPlayerState({
          seriesId: lead.id,
          episodeNumber: 1,
          initialTimeSec: 0,
        });
      }
    }
  }, [isAdminRoute, onlineCatalogReady, seriesCatalog, unlockedKeys]);

  const featuredSeries = seriesCatalog[0] ?? null;

  const filteredSeries = useMemo(
    () => filterSeries(seriesCatalog, selectedGenre, searchQuery),
    [seriesCatalog, selectedGenre, searchQuery],
  );

  const savedSeriesList = useMemo(
    () => seriesCatalog.filter((s) => savedSeriesIds.includes(s.id)),
    [seriesCatalog, savedSeriesIds],
  );

  const activePlayerSeries = useMemo(
    () =>
      playerState
        ? seriesCatalog.find((s) => s.id === playerState.seriesId) ?? null
        : null,
    [seriesCatalog, playerState],
  );

  const activeAdCampaign = useMemo(() => {
    const idx = adsCompletedCount % INTERACTIVE_AD_CAMPAIGNS.length;
    return INTERACTIVE_AD_CAMPAIGNS[idx];
  }, [adsCompletedCount]);

  const handleOpenSeries = useCallback(
    (series: DramaSeries, explicitEpisode?: number) => {
      if (series.episodes.length === 0) {
        showToast(
          'Film ini belum memiliki episode. Tambahkan episode di menu Admin.',
        );
        return;
      }

      const existingHistory = watchHistory.find(
        (item) => item.seriesId === series.id,
      );
      const rawTargetEp =
        explicitEpisode ?? existingHistory?.episodeNumber ?? 1;
      const targetEp = Math.max(
        1,
        Math.min(rawTargetEp, series.episodes.length),
      );
      const resumeSec =
        explicitEpisode === undefined &&
        existingHistory &&
        existingHistory.episodeNumber === targetEp &&
        existingHistory.progressSec < existingHistory.durationSec - 1
          ? existingHistory.progressSec
          : 0;

      if (
        isEpisodeUnlocked(
          series.id,
          targetEp,
          series.freeUntilEpisode,
          unlockedKeys,
        )
      ) {
        setPlayerState({
          seriesId: series.id,
          episodeNumber: targetEp,
          initialTimeSec: resumeSec,
        });
      } else {
        setPendingAdUnlock({ series, episodeNumber: targetEp });
      }
    },
    [watchHistory, unlockedKeys, showToast],
  );

  const handlePrimaryWatch = useCallback(() => {
    if (watchHistory.length > 0) {
      const latest = watchHistory[0];
      const series = seriesCatalog.find((s) => s.id === latest.seriesId);
      if (series && series.episodes.length > 0) {
        handleOpenSeries(series);
        return;
      }
    }
    if (featuredSeries) {
      handleOpenSeries(featuredSeries, 1);
    } else {
      navigateTo('/admin');
    }
  }, [watchHistory, seriesCatalog, featuredSeries, handleOpenSeries, navigateTo]);

  const handleToggleSave = useCallback(
    (seriesId: string) => {
      setSavedSeriesIds((prev) => {
        const exists = prev.includes(seriesId);
        const next = exists
          ? prev.filter((id) => id !== seriesId)
          : [seriesId, ...prev];
        showToast(
          exists ? 'Dihapus dari daftar tersimpan' : 'Disimpan ke daftar tonton',
        );
        return next;
      });
    },
    [showToast],
  );

  const handleToggleLike = useCallback((seriesId: string) => {
    setLikedSeriesIds((prev) =>
      prev.includes(seriesId)
        ? prev.filter((id) => id !== seriesId)
        : [seriesId, ...prev],
    );
  }, []);

  const handleProgressUpdate = useCallback(
    (
      seriesId: string,
      episodeNumber: number,
      progressSec: number,
      durationSec: number,
    ) => {
      setWatchHistory((prev) =>
        upsertWatchHistory(prev, {
          seriesId,
          episodeNumber,
          progressSec,
          durationSec,
          updatedAt: Date.now(),
        }),
      );
    },
    [],
  );

  const handleAdUnlockComplete = useCallback(
    (bonusCount: number) => {
      if (!pendingAdUnlock) {
        return;
      }
      const { series, episodeNumber } = pendingAdUnlock;
      setUnlockedKeys((prev) =>
        unlockEpisodesWithAd(prev, series, episodeNumber, bonusCount),
      );
      setAdsCompletedCount((c) => c + 1);
      setPendingAdUnlock(null);
      setPlayerState({
        seriesId: series.id,
        episodeNumber,
        initialTimeSec: 0,
      });
      showToast(
        bonusCount > 1
          ? `Berhasil membuka ${bonusCount} episode gratis!`
          : `Episode ${episodeNumber} terbuka gratis!`,
      );
    },
    [pendingAdUnlock, showToast],
  );

  const handleShareSeries = useCallback(
    async (series: DramaSeries, episodeNumber: number) => {
      const shareText = `Tonton ${series.title} Episode ${episodeNumber} gratis di LayarMini`;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(
            `${window.location.origin}?series=${series.id}&ep=${episodeNumber}`,
          );
          showToast('Tautan episode disalin ke papan klip');
          return;
        }
      } catch {
        // Fallback to toast
      }
      showToast(shareText);
    },
    [showToast],
  );

  // Persist admin mutations to Firebase Firestore so all viewer devices update in real time
  const runOnlineSync = useCallback(
    async (task: (uid: string) => Promise<void>, successMessage?: string) => {
      if (!authUser || !isAdmin) {
        showToast('Masuk sebagai admin untuk menyimpan perubahan online.');
        return;
      }
      setIsSyncingOnline(true);
      try {
        await task(authUser.uid);
        if (successMessage) {
          showToast(successMessage);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Quota exceeded')) {
          showToast('Batas kuota harian database tercapai. Coba lagi besok.');
        } else {
          showToast(
            'Gagal menyimpan perubahan ke database online. Periksa koneksi & sesi admin.',
          );
        }
      } finally {
        setIsSyncingOnline(false);
      }
    },
    [authUser, isAdmin, showToast],
  );

  const handlePublishLocalCatalog = useCallback(() => {
    const current = seriesCatalogRef.current;
    void runOnlineSync(async (uid) => {
      await publishCatalogToFirestore(current, uid);
      setIsOnlineCatalogInitialized(true);
    }, 'Katalog berhasil dipublikasikan online untuk semua penonton!');
  }, [runOnlineSync]);

  // Admin catalog management handlers (optimistic UI + live Firestore sync)
  const handleAdminSaveSeries = useCallback(
    (input: SeriesFormInput, editingSeriesId?: string): string => {
      const result = upsertSeriesInCatalog(
        seriesCatalogRef.current,
        input,
        editingSeriesId,
      );
      setSeriesCatalog(result.catalog);
      const savedIndex = result.catalog.findIndex(
        (s) => s.id === result.savedSeries.id,
      );

      void runOnlineSync(
        async (uid) => {
          if (!isOnlineCatalogInitialized) {
            await publishCatalogToFirestore(result.catalog, uid);
            setIsOnlineCatalogInitialized(true);
            return;
          }
          await saveSeriesDocToFirestore(
            result.savedSeries,
            Math.max(0, savedIndex),
            uid,
            !editingSeriesId,
          );
          if (!editingSeriesId) {
            await updateCatalogSortOrderInFirestore(
              result.catalog.map((s) => s.id),
              uid,
            );
          }
        },
        editingSeriesId
          ? 'Informasi film diperbarui secara online'
          : 'Film baru dipublikasikan ke katalog online',
      );
      return result.savedSeries.id;
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminDeleteSeries = useCallback(
    (seriesId: string) => {
      const nextCatalog = deleteSeriesFromCatalog(
        seriesCatalogRef.current,
        seriesId,
      );
      setSeriesCatalog(nextCatalog);
      setPlayerState((prev) =>
        prev?.seriesId === seriesId ? null : prev,
      );
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        await deleteSeriesDocFromFirestore(seriesId);
      }, 'Film dihapus dari katalog online');
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminSetFeaturedSeries = useCallback(
    (seriesId: string) => {
      const nextCatalog = setFeaturedSeriesInCatalog(
        seriesCatalogRef.current,
        seriesId,
      );
      setSeriesCatalog(nextCatalog);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        await updateCatalogSortOrderInFirestore(
          nextCatalog.map((s) => s.id),
          uid,
        );
      }, 'Pilihan Utama Beranda diperbarui untuk semua penonton');
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminSaveEpisode = useCallback(
    (
      seriesId: string,
      input: EpisodeFormInput,
      editingEpisodeNumber?: number,
    ) => {
      const nextCatalog = upsertEpisodeInSeries(
        seriesCatalogRef.current,
        seriesId,
        input,
        editingEpisodeNumber,
      );
      setSeriesCatalog(nextCatalog);
      const updatedSeries = nextCatalog.find((s) => s.id === seriesId);
      void runOnlineSync(
        async (uid) => {
          if (!isOnlineCatalogInitialized) {
            await publishCatalogToFirestore(nextCatalog, uid);
            setIsOnlineCatalogInitialized(true);
            return;
          }
          if (updatedSeries) {
            await syncSeriesEpisodesInFirestore(
              seriesId,
              updatedSeries.episodes,
              uid,
            );
          }
        },
        editingEpisodeNumber !== undefined
          ? `Episode ${editingEpisodeNumber} diperbarui secara online`
          : 'Episode baru dipublikasikan online',
      );
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminReorderEpisode = useCallback(
    (seriesId: string, episodeNumber: number, direction: 'up' | 'down') => {
      const nextCatalog = reorderEpisodeInSeries(
        seriesCatalogRef.current,
        seriesId,
        episodeNumber,
        direction,
      );
      setSeriesCatalog(nextCatalog);
      const updatedSeries = nextCatalog.find((s) => s.id === seriesId);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        if (updatedSeries) {
          await syncSeriesEpisodesInFirestore(
            seriesId,
            updatedSeries.episodes,
            uid,
          );
        }
      }, 'Urutan episode diperbarui online');
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminDeleteEpisode = useCallback(
    (seriesId: string, episodeNumber: number) => {
      const nextCatalog = deleteEpisodeFromSeries(
        seriesCatalogRef.current,
        seriesId,
        episodeNumber,
      );
      setSeriesCatalog(nextCatalog);
      const updatedSeries = nextCatalog.find((s) => s.id === seriesId);
      const updatedIndex = nextCatalog.findIndex((s) => s.id === seriesId);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        if (updatedSeries) {
          await saveSeriesDocToFirestore(
            updatedSeries,
            Math.max(0, updatedIndex),
            uid,
            false,
          );
          await syncSeriesEpisodesInFirestore(
            seriesId,
            updatedSeries.episodes,
            uid,
          );
        }
      }, `Episode ${episodeNumber} dihapus secara online`);
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminResetCatalog = useCallback(() => {
    setSeriesCatalog(DRAMA_SERIES);
    void runOnlineSync(async (uid) => {
      await publishCatalogToFirestore(DRAMA_SERIES, uid);
      setIsOnlineCatalogInitialized(true);
    }, 'Katalog online dikembalikan ke daftar bawaan');
  }, [runOnlineSync]);

  const handleAdminAttachDoodstreamFolder = useCallback(
    (seriesId: string, folderId: string, folderName: string) => {
      const nextCatalog = attachDoodstreamFolderToSeries(
        seriesCatalogRef.current,
        seriesId,
        folderId,
        folderName,
      );
      setSeriesCatalog(nextCatalog);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        await bindSeriesFolderInFirestore(seriesId, folderId, folderName, uid);
      });
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminQuickAddUploadedEpisode = useCallback(
    (seriesId: string, payload: UploadedEpisodePayload) => {
      const nextCatalog = appendUploadedEpisodeToSeries(
        seriesCatalogRef.current,
        seriesId,
        payload,
      );
      setSeriesCatalog(nextCatalog);
      const updatedSeries = nextCatalog.find((s) => s.id === seriesId);
      const updatedIndex = nextCatalog.findIndex((s) => s.id === seriesId);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        if (updatedSeries) {
          await saveSeriesDocToFirestore(
            updatedSeries,
            Math.max(0, updatedIndex),
            uid,
            false,
          );
          await syncSeriesEpisodesInFirestore(
            seriesId,
            updatedSeries.episodes,
            uid,
          );
        }
      }, 'Video & episode baru langsung tayang online');
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminAttachVideoToEpisode = useCallback(
    (
      seriesId: string,
      episodeNumber: number,
      payload: UploadedEpisodePayload,
    ) => {
      const nextCatalog = attachUploadedVideoToEpisode(
        seriesCatalogRef.current,
        seriesId,
        episodeNumber,
        payload,
      );
      setSeriesCatalog(nextCatalog);
      const updatedSeries = nextCatalog.find((s) => s.id === seriesId);
      const updatedIndex = nextCatalog.findIndex((s) => s.id === seriesId);
      void runOnlineSync(async (uid) => {
        if (!isOnlineCatalogInitialized) {
          await publishCatalogToFirestore(nextCatalog, uid);
          setIsOnlineCatalogInitialized(true);
          return;
        }
        if (updatedSeries) {
          await saveSeriesDocToFirestore(
            updatedSeries,
            Math.max(0, updatedIndex),
            uid,
            false,
          );
          await syncSeriesEpisodesInFirestore(
            seriesId,
            updatedSeries.episodes,
            uid,
          );
        }
      }, `Video Episode ${episodeNumber} langsung tayang online`);
    },
    [isOnlineCatalogInitialized, runOnlineSync],
  );

  const handleAdminSignOut = useCallback(() => {
    void signOut(auth).then(() => {
      showToast('Berhasil keluar dari akun admin');
    });
  }, [showToast]);

  const handleAdminPreviewEpisode = useCallback(
    (series: DramaSeries, episodeNumber: number) => {
      setPlayerState({
        seriesId: series.id,
        episodeNumber,
        initialTimeSec: 0,
      });
    },
    [],
  );

  const renderFilterAndGrid = () => (
    <section
      aria-label="Katalog drama pendek"
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div
          role="tablist"
          aria-label="Filter genre drama"
          className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 md:pb-0"
        >
          {GENRE_FILTERS.map((genre) => {
            const isActive = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedGenre(genre)}
                className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                  isActive
                    ? 'bg-[#FAFAFA] text-[#09090B]'
                    : 'bg-[#141417] text-zinc-300 border border-white/8 hover:border-white/20 hover:text-white'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul atau pemeran..."
            aria-label="Cari judul drama atau pemeran"
            className="h-11 w-full rounded-lg border border-white/12 bg-[#141417] pr-4 pl-10 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
          />
        </div>
      </div>

      {filteredSeries.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
          {filteredSeries.map((series) => (
            <SeriesCard
              key={series.id}
              series={series}
              unlockedCount={countUnlockedEpisodes(series, unlockedKeys)}
              isSaved={savedSeriesIds.includes(series.id)}
              onOpenSeries={(s) => handleOpenSeries(s)}
              onToggleSave={handleToggleSave}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-white/10 bg-[#111114] p-10 text-center">
          <p className="font-display text-lg font-semibold text-white">
            Drama tidak ditemukan
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Coba kata kunci lain atau pilih semua genre untuk melihat seluruh
            serial gratis.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedGenre(DramaGenre.All);
              setSearchQuery('');
            }}
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset Pencarian</span>
          </button>
        </div>
      )}
    </section>
  );

  const playerModalNode = activePlayerSeries && playerState && (
    <ShortPlayerModal
      series={activePlayerSeries}
      episodeNumber={playerState.episodeNumber}
      initialTimeSec={playerState.initialTimeSec}
      unlockedKeys={unlockedKeys}
      isSaved={savedSeriesIds.includes(activePlayerSeries.id)}
      isLiked={likedSeriesIds.includes(activePlayerSeries.id)}
      onClose={() => setPlayerState(null)}
      onSelectEpisode={(epNum) =>
        setPlayerState({
          seriesId: activePlayerSeries.id,
          episodeNumber: epNum,
          initialTimeSec: 0,
        })
      }
      onRequestUnlockEpisode={(epNum) =>
        setPendingAdUnlock({
          series: activePlayerSeries,
          episodeNumber: epNum,
        })
      }
      onProgressUpdate={(epNum, prog, dur) =>
        handleProgressUpdate(activePlayerSeries.id, epNum, prog, dur)
      }
      onToggleSave={() => handleToggleSave(activePlayerSeries.id)}
      onToggleLike={() => handleToggleLike(activePlayerSeries.id)}
      onShare={() =>
        void handleShareSeries(
          activePlayerSeries,
          playerState.episodeNumber,
        )
      }
    />
  );

  const toastNode = toastMessage && (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-white/15 bg-[#18181D] px-4 py-2.5 text-xs font-medium text-white shadow-xl md:bottom-6"
    >
      {toastMessage}
    </div>
  );

  if (isAdminRoute) {
    if (!authReady || isCheckingAdmin || !authUser || !isAdmin) {
      return (
        <>
          <AdminAuthGate
            authReady={authReady}
            user={authUser}
            isAdmin={isAdmin}
            isCheckingAdmin={isCheckingAdmin}
            onNavigateHome={() => navigateTo('/')}
          />
          {toastNode}
        </>
      );
    }

    return (
      <>
        <AdminPanel
          seriesList={seriesCatalog}
          onSaveSeries={handleAdminSaveSeries}
          onDeleteSeries={handleAdminDeleteSeries}
          onSetFeaturedSeries={handleAdminSetFeaturedSeries}
          onSaveEpisode={handleAdminSaveEpisode}
          onReorderEpisode={handleAdminReorderEpisode}
          onDeleteEpisode={handleAdminDeleteEpisode}
          onResetCatalog={handleAdminResetCatalog}
          onPreviewEpisode={handleAdminPreviewEpisode}
          onAttachDoodstreamFolder={handleAdminAttachDoodstreamFolder}
          onQuickAddUploadedEpisode={handleAdminQuickAddUploadedEpisode}
          onAttachVideoToEpisode={handleAdminAttachVideoToEpisode}
          onNavigateHome={() => navigateTo('/')}
          adminEmail={authUser.email}
          onSignOut={handleAdminSignOut}
          isOnlineCatalogInitialized={isOnlineCatalogInitialized}
          isSyncingOnline={isSyncingOnline}
          onPublishLocalCatalog={handlePublishLocalCatalog}
        />
        {playerModalNode}
        {toastNode}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] pb-20 md:pb-8">
      <HeaderNav
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onPrimaryWatch={handlePrimaryWatch}
        hasWatchHistory={watchHistory.length > 0}
      />

      <main>
        {activeSection === NavSection.Home && (
          <>
            {featuredSeries ? (
              <HeroShowcase
                series={featuredSeries}
                isSaved={savedSeriesIds.includes(featuredSeries.id)}
                onWatchNow={(s) => handleOpenSeries(s, 1)}
                onToggleSave={handleToggleSave}
              />
            ) : (
              <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="rounded-2xl border border-white/10 bg-[#111114] p-10 text-center">
                  <h1 className="font-display text-2xl font-bold text-white">
                    Katalog Belum Tersedia
                  </h1>
                  <p className="mt-2 text-sm text-zinc-400">
                    Tambahkan film dan episode melalui Admin Panel untuk mulai
                    menayangkan drama pendek.
                  </p>
                  <a
                    href="/admin"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo('/admin');
                    }}
                    className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                  >
                    Buka Admin Panel
                  </a>
                </div>
              </section>
            )}

            {watchHistory.length > 0 && (
              <section
                aria-labelledby="continue-heading"
                className="border-b border-white/8"
              >
                <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-between gap-4">
                    <h2
                      id="continue-heading"
                      className="font-display text-xl font-bold tracking-tight text-white"
                    >
                      Lanjutkan Menonton
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveSection(NavSection.History)}
                      className="text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
                    >
                      Lihat semua riwayat
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {watchHistory.slice(0, 3).map((entry) => {
                      const series = seriesCatalog.find(
                        (s) => s.id === entry.seriesId,
                      );
                      if (!series) {
                        return null;
                      }
                      const pct = calculateProgressPercent(
                        entry.progressSec,
                        entry.durationSec,
                      );
                      return (
                        <button
                          key={entry.seriesId}
                          type="button"
                          onClick={() => handleOpenSeries(series)}
                          className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#121216] p-3 text-left transition-colors hover:border-white/25 hover:bg-[#18181D] cursor-pointer"
                        >
                          <div className="h-20 w-15 shrink-0 overflow-hidden rounded-lg bg-[#1A1A20]">
                            <PosterImage
                              src={series.posterUrl}
                              alt={`Poster ${series.title}`}
                              title={series.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="font-display text-sm font-semibold text-white truncate">
                              {series.title}
                            </p>
                            <p className="font-mono text-xs tabular-nums text-zinc-400">
                              Ep {entry.episodeNumber} · {formatDuration(entry.progressSec)} /{' '}
                              {formatDuration(entry.durationSec)}
                            </p>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full bg-[#E11D48]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                            <Play className="h-4 w-4 fill-current translate-x-0.5" aria-hidden="true" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {renderFilterAndGrid()}
          </>
        )}

        {activeSection === NavSection.Explore && renderFilterAndGrid()}

        {activeSection === NavSection.Saved && (
          <section
            aria-labelledby="saved-heading"
            className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
          >
            <div className="space-y-1">
              <h1
                id="saved-heading"
                className="font-display text-2xl font-bold tracking-tight text-white"
              >
                Daftar Tersimpan
              </h1>
              <p className="text-sm text-zinc-400">
                Serial favorit yang kamu simpan untuk ditonton kembali kapan saja.
              </p>
            </div>

            {savedSeriesList.length > 0 ? (
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
                {savedSeriesList.map((series) => (
                  <SeriesCard
                    key={series.id}
                    series={series}
                    unlockedCount={countUnlockedEpisodes(series, unlockedKeys)}
                    isSaved
                    onOpenSeries={(s) => handleOpenSeries(s)}
                    onToggleSave={handleToggleSave}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-10 rounded-2xl border border-white/10 bg-[#111114] p-10 text-center">
                <Bookmark
                  className="mx-auto h-8 w-8 text-zinc-500"
                  aria-hidden="true"
                />
                <p className="font-display mt-3 text-lg font-semibold text-white">
                  Belum ada drama tersimpan
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Ketuk tombol simpan pada kartu drama mana pun untuk menaruhnya
                  di daftar ini.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection(NavSection.Home)}
                  className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  Jelajahi Drama
                </button>
              </div>
            )}
          </section>
        )}

        {activeSection === NavSection.History && (
          <section
            aria-labelledby="history-heading"
            className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1
                  id="history-heading"
                  className="font-display text-2xl font-bold tracking-tight text-white"
                >
                  Riwayat Menonton
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Lanjutkan episode terakhir tepat di detik terakhir kamu berhenti.
                </p>
              </div>

              {watchHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setWatchHistory([]);
                    showToast('Riwayat menonton dibersihkan');
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/8 hover:text-white cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Hapus Riwayat</span>
                </button>
              )}
            </div>

            {watchHistory.length > 0 ? (
              <div className="mt-6 space-y-3">
                {watchHistory.map((entry) => {
                  const series = seriesCatalog.find(
                    (s) => s.id === entry.seriesId,
                  );
                  if (!series) {
                    return null;
                  }
                  const episodeObj = series.episodes.find(
                    (e) => e.number === entry.episodeNumber,
                  );
                  const pct = calculateProgressPercent(
                    entry.progressSec,
                    entry.durationSec,
                  );
                  return (
                    <div
                      key={entry.seriesId}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-[#121216] p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-24 w-18 shrink-0 overflow-hidden rounded-lg bg-[#1A1A20]">
                          <PosterImage
                            src={series.posterUrl}
                            alt={`Poster ${series.title}`}
                            title={series.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="space-y-1">
                          <h2 className="font-display text-base font-semibold text-white">
                            {series.title}
                          </h2>
                          <p className="text-sm text-zinc-300">
                            Episode {entry.episodeNumber}: {episodeObj?.title}
                          </p>
                          <p className="font-mono text-xs tabular-nums text-zinc-400">
                            Progres {pct}% · {formatDuration(entry.progressSec)} /{' '}
                            {formatDuration(entry.durationSec)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenSeries(series)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer shrink-0"
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                        <span>Lanjutkan</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-10 rounded-2xl border border-white/10 bg-[#111114] p-10 text-center">
                <History
                  className="mx-auto h-8 w-8 text-zinc-500"
                  aria-hidden="true"
                />
                <p className="font-display mt-3 text-lg font-semibold text-white">
                  Belum ada riwayat tontonan
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Mulai tonton episode pertama salah satu drama untuk mencatat
                  progresmu otomatis.
                </p>
                {featuredSeries ? (
                  <button
                    type="button"
                    onClick={() => handleOpenSeries(featuredSeries, 1)}
                    className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                  >
                    Tonton Pilihan Utama
                  </button>
                ) : (
                  <a
                    href="/admin"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo('/admin');
                    }}
                    className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                  >
                    Buka Admin Panel
                  </a>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="mt-12 border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-zinc-400">
            LayarMini — Short Movie &amp; Drama Pendek Vertikal Gratis Tanpa
            Langganan.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <p className="font-mono tabular-nums">
              Iklan Interaktif Diselesaikan: {adsCompletedCount}
            </p>
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/admin');
              }}
              className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Portal Admin
            </a>
          </div>
        </div>
      </footer>

      {playerModalNode}

      {pendingAdUnlock && (
        <InteractiveAdModal
          isOpen
          campaign={activeAdCampaign}
          seriesTitle={pendingAdUnlock.series.title}
          targetEpisodeNumber={pendingAdUnlock.episodeNumber}
          totalEpisodes={pendingAdUnlock.series.episodes.length}
          onComplete={handleAdUnlockComplete}
          onCancel={() => setPendingAdUnlock(null)}
        />
      )}

      {toastNode}
    </div>
  );
}
