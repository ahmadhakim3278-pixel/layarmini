import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DramaGenre,
  type DramaSeries,
  type Episode,
  type SubtitleCue,
} from '../types/drama';
import {
  buildEpisodeDocId,
  isBootstrappedAdminEmail,
  mergeSeriesWithEpisodes,
  sanitizeDocumentId,
  sanitizeEpisodeForFirestore,
  sanitizeSeriesForFirestore,
} from '../utils/firestorePayloads';

export interface OnlineCatalogSnapshot {
  ready: boolean;
  isInitialized: boolean;
  seriesList: DramaSeries[];
}

function mapSeriesSnapshotDoc(
  docId: string,
  data: Record<string, unknown>,
): DramaSeries & { sortOrder: number } {
  const rawCast = Array.isArray(data.cast)
    ? data.cast.filter((item): item is string => typeof item === 'string')
    : ['Pemeran Utama'];

  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    title: typeof data.title === 'string' ? data.title : 'Drama Tanpa Judul',
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : '',
    genre: (typeof data.genre === 'string'
      ? data.genre
      : DramaGenre.Romance) as DramaGenre,
    year: typeof data.year === 'number' ? data.year : new Date().getFullYear(),
    cast: rawCast,
    director: typeof data.director === 'string' ? data.director : '',
    synopsis: typeof data.synopsis === 'string' ? data.synopsis : '',
    posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl : '',
    heroUrl: typeof data.heroUrl === 'string' && data.heroUrl ? data.heroUrl : undefined,
    freeUntilEpisode:
      typeof data.freeUntilEpisode === 'number' ? data.freeUntilEpisode : 3,
    baseLikes: typeof data.baseLikes === 'number' ? data.baseLikes : 0,
    viewsLabel: typeof data.viewsLabel === 'string' ? data.viewsLabel : 'Baru rilis',
    doodstreamFolderId:
      typeof data.doodstreamFolderId === 'string' && data.doodstreamFolderId
        ? data.doodstreamFolderId
        : undefined,
    doodstreamFolderName:
      typeof data.doodstreamFolderName === 'string' && data.doodstreamFolderName
        ? data.doodstreamFolderName
        : undefined,
    episodes: [],
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
  };
}

function mapEpisodeSnapshotDoc(data: Record<string, unknown>): Episode {
  const rawSubs = Array.isArray(data.subtitles)
    ? data.subtitles.filter(
        (cue): cue is SubtitleCue =>
          Boolean(cue) &&
          typeof cue === 'object' &&
          typeof (cue as SubtitleCue).startSec === 'number' &&
          typeof (cue as SubtitleCue).endSec === 'number' &&
          typeof (cue as SubtitleCue).speaker === 'string' &&
          typeof (cue as SubtitleCue).text === 'string',
      )
    : [];

  return {
    number: typeof data.number === 'number' ? data.number : 1,
    title: typeof data.title === 'string' ? data.title : 'Episode 1',
    synopsis: typeof data.synopsis === 'string' ? data.synopsis : '',
    durationSec: typeof data.durationSec === 'number' ? data.durationSec : 28,
    sceneMood: typeof data.sceneMood === 'string' ? data.sceneMood : '',
    accentTint:
      typeof data.accentTint === 'string' ? data.accentTint : '#E11D48',
    subtitles: rawSubs,
    doodstreamFileCode:
      typeof data.doodstreamFileCode === 'string' && data.doodstreamFileCode
        ? data.doodstreamFileCode
        : undefined,
    doodstreamEmbedUrl:
      typeof data.doodstreamEmbedUrl === 'string' && data.doodstreamEmbedUrl
        ? data.doodstreamEmbedUrl
        : undefined,
  };
}

export async function verifyAdminAccess(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) {
    return false;
  }
  if (isBootstrappedAdminEmail(user.email, user.emailVerified)) {
    return true;
  }

  const adminPath = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission')) {
      return false;
    }
    handleFirestoreError(error, OperationType.GET, adminPath);
  }
}

export function subscribeToOnlineCatalog(options: {
  isAdmin: boolean;
  onUpdate: (snapshot: OnlineCatalogSnapshot) => void;
  onError: (error: Error) => void;
}): Unsubscribe {
  const { isAdmin, onUpdate, onError } = options;

  let metaLoaded = false;
  let seriesLoaded = false;
  let isInitialized = false;
  let currentSeriesDocs: Array<DramaSeries & { sortOrder: number }> = [];
  const episodesBySeries: Record<string, Episode[]> = {};
  const loadedEpisodeSeries = new Set<string>();
  const episodeUnsubscribers = new Map<string, Unsubscribe>();

  const emitIfReady = () => {
    const allEpisodesReady = currentSeriesDocs.every((s) =>
      loadedEpisodeSeries.has(s.id),
    );
    if (!metaLoaded || !seriesLoaded) {
      return;
    }
    if (currentSeriesDocs.length > 0 && !allEpisodesReady) {
      return;
    }
    const merged = mergeSeriesWithEpisodes(currentSeriesDocs, episodesBySeries);
    onUpdate({
      ready: true,
      isInitialized: isInitialized || merged.length > 0,
      seriesList: merged,
    });
  };

  const metaRef = doc(db, 'catalogMeta', 'state');
  const unsubMeta = onSnapshot(
    metaRef,
    (snap) => {
      metaLoaded = true;
      isInitialized = snap.exists() && snap.data()?.initialized === true;
      emitIfReady();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'catalogMeta/state');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );

  const seriesRef = collection(db, 'series');
  const seriesQuery = isAdmin
    ? seriesRef
    : query(seriesRef, where('published', '==', true));

  const unsubSeries = onSnapshot(
    seriesQuery,
    (snap) => {
      seriesLoaded = true;
      const activeIds = new Set<string>();
      currentSeriesDocs = snap.docs.map((docSnap) => {
        activeIds.add(docSnap.id);
        return mapSeriesSnapshotDoc(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        );
      });

      // Tear down episode listeners for removed series
      for (const [id, unsub] of episodeUnsubscribers.entries()) {
        if (!activeIds.has(id)) {
          unsub();
          episodeUnsubscribers.delete(id);
          loadedEpisodeSeries.delete(id);
          delete episodesBySeries[id];
        }
      }

      // Attach episode subcollection listeners for newly seen series
      for (const seriesDoc of currentSeriesDocs) {
        if (episodeUnsubscribers.has(seriesDoc.id)) {
          continue;
        }
        const episodesPath = `series/${seriesDoc.id}/episodes`;
        const epCollection = collection(db, 'series', seriesDoc.id, 'episodes');
        const epQuery = isAdmin
          ? epCollection
          : query(epCollection, where('published', '==', true));

        const unsubEp = onSnapshot(
          epQuery,
          (epSnap) => {
            episodesBySeries[seriesDoc.id] = epSnap.docs.map((epDoc) =>
              mapEpisodeSnapshotDoc(epDoc.data() as Record<string, unknown>),
            );
            loadedEpisodeSeries.add(seriesDoc.id);
            emitIfReady();
          },
          (error) => {
            try {
              handleFirestoreError(error, OperationType.LIST, episodesPath);
            } catch (wrapped) {
              onError(
                wrapped instanceof Error ? wrapped : new Error(String(wrapped)),
              );
            }
          },
        );

        episodeUnsubscribers.set(seriesDoc.id, unsubEp);
      }

      emitIfReady();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'series');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );

  return () => {
    unsubMeta();
    unsubSeries();
    for (const unsub of episodeUnsubscribers.values()) {
      unsub();
    }
    episodeUnsubscribers.clear();
  };
}

async function markCatalogInitialized(uid: string): Promise<void> {
  const metaPath = 'catalogMeta/state';
  const metaRef = doc(db, 'catalogMeta', 'state');
  try {
    const existingMeta = await getDoc(metaRef);
    const payload = {
      initialized: true,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    };
    if (existingMeta.exists()) {
      await updateDoc(metaRef, payload);
    } else {
      await setDoc(metaRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, metaPath);
  }
}

export async function publishCatalogToFirestore(
  catalog: readonly DramaSeries[],
  uid: string,
): Promise<void> {
  const existingSeriesSnap = await (async () => {
    try {
      return await getDocs(collection(db, 'series'));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'series');
    }
  })();

  const existingSeriesIds = new Set(existingSeriesSnap.docs.map((d) => d.id));
  const incomingSeriesIds = new Set(
    catalog.map((s) => sanitizeDocumentId(s.id, 'drama-baru')),
  );

  // Remove stale series (and their episode subcollections) no longer in catalog
  for (const staleId of existingSeriesIds) {
    if (!incomingSeriesIds.has(staleId)) {
      await deleteSeriesDocFromFirestore(staleId);
    }
  }

  // Upsert each series and synchronize its episodes subcollection
  for (let idx = 0; idx < catalog.length; idx += 1) {
    const series = catalog[idx];
    const safeId = sanitizeDocumentId(series.id, 'drama-baru');
    const isExisting = existingSeriesIds.has(safeId);
    await saveSeriesDocToFirestore({ ...series, id: safeId }, idx, uid, !isExisting);
    await syncSeriesEpisodesInFirestore(safeId, series.episodes, uid, false);
  }

  await markCatalogInitialized(uid);
}

export async function saveSeriesDocToFirestore(
  series: DramaSeries,
  sortOrder: number,
  uid: string,
  isNew: boolean,
): Promise<void> {
  const sanitized = sanitizeSeriesForFirestore(series, sortOrder, uid, true);
  const seriesPath = `series/${sanitized.id}`;
  const seriesRef = doc(db, 'series', sanitized.id);

  try {
    if (isNew) {
      await setDoc(seriesRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingSnap = await getDoc(seriesRef);
      if (!existingSnap.exists()) {
        await setDoc(seriesRef, {
          ...sanitized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const updatePayload: Record<string, unknown> = {
          title: sanitized.title,
          subtitle: sanitized.subtitle,
          genre: sanitized.genre,
          year: sanitized.year,
          cast: sanitized.cast,
          director: sanitized.director,
          synopsis: sanitized.synopsis,
          posterUrl: sanitized.posterUrl,
          freeUntilEpisode: sanitized.freeUntilEpisode,
          baseLikes: sanitized.baseLikes,
          viewsLabel: sanitized.viewsLabel,
          sortOrder: sanitized.sortOrder,
          published: sanitized.published,
          updatedAt: serverTimestamp(),
          updatedByUid: sanitized.updatedByUid,
          heroUrl: sanitized.heroUrl ?? deleteField(),
          doodstreamFolderId: sanitized.doodstreamFolderId ?? deleteField(),
          doodstreamFolderName: sanitized.doodstreamFolderName ?? deleteField(),
        };
        await updateDoc(seriesRef, updatePayload);
      }
    }
  } catch (error) {
    handleFirestoreError(
      error,
      isNew ? OperationType.CREATE : OperationType.UPDATE,
      seriesPath,
    );
  }
}

export async function deleteSeriesDocFromFirestore(
  seriesId: string,
): Promise<void> {
  const safeId = sanitizeDocumentId(seriesId, 'drama-baru');
  const episodesPath = `series/${safeId}/episodes`;
  const seriesPath = `series/${safeId}`;

  try {
    const epSnap = await getDocs(collection(db, 'series', safeId, 'episodes'));
    if (epSnap.docs.length > 0) {
      let batch = writeBatch(db);
      let count = 0;
      for (const epDoc of epSnap.docs) {
        batch.delete(epDoc.ref);
        count += 1;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, episodesPath);
  }

  try {
    await deleteDoc(doc(db, 'series', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, seriesPath);
  }
}

export async function updateCatalogSortOrderInFirestore(
  orderedSeriesIds: readonly string[],
  uid: string,
): Promise<void> {
  try {
    const batch = writeBatch(db);
    orderedSeriesIds.forEach((rawId, idx) => {
      const safeId = sanitizeDocumentId(rawId, 'drama-baru');
      batch.update(doc(db, 'series', safeId), {
        sortOrder: idx,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'series');
  }
}

export async function bindSeriesFolderInFirestore(
  seriesId: string,
  folderId: string,
  folderName: string,
  uid: string,
): Promise<void> {
  const safeId = sanitizeDocumentId(seriesId, 'drama-baru');
  const seriesPath = `series/${safeId}`;
  try {
    await updateDoc(doc(db, 'series', safeId), {
      doodstreamFolderId: folderId.trim().slice(0, 64),
      doodstreamFolderName: folderName.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, seriesPath);
  }
}

export async function syncSeriesEpisodesInFirestore(
  seriesId: string,
  episodes: readonly Episode[],
  uid: string,
  alsoMarkInitialized = true,
): Promise<void> {
  const safeSeriesId = sanitizeDocumentId(seriesId, 'drama-baru');
  const episodesPath = `series/${safeSeriesId}/episodes`;

  let existingIds = new Set<string>();
  try {
    const existingSnap = await getDocs(
      collection(db, 'series', safeSeriesId, 'episodes'),
    );
    existingIds = new Set(existingSnap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, episodesPath);
  }

  const targetIds = new Set<string>();

  try {
    let batch = writeBatch(db);
    let opCount = 0;

    const flushIfNeeded = async () => {
      if (opCount >= 380) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    };

    for (const ep of episodes) {
      const sanitized = sanitizeEpisodeForFirestore(safeSeriesId, ep, uid, true);
      const epDocId = buildEpisodeDocId(sanitized.number);
      targetIds.add(epDocId);
      const epRef = doc(db, 'series', safeSeriesId, 'episodes', epDocId);

      if (existingIds.has(epDocId)) {
        batch.update(epRef, {
          number: sanitized.number,
          title: sanitized.title,
          synopsis: sanitized.synopsis,
          durationSec: sanitized.durationSec,
          sceneMood: sanitized.sceneMood,
          accentTint: sanitized.accentTint,
          subtitles: sanitized.subtitles,
          published: sanitized.published,
          updatedAt: serverTimestamp(),
          updatedByUid: sanitized.updatedByUid,
          doodstreamFileCode: sanitized.doodstreamFileCode ?? deleteField(),
          doodstreamEmbedUrl: sanitized.doodstreamEmbedUrl ?? deleteField(),
        });
      } else {
        batch.set(epRef, {
          ...sanitized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      opCount += 1;
      await flushIfNeeded();
    }

    for (const staleEpId of existingIds) {
      if (!targetIds.has(staleEpId)) {
        batch.delete(doc(db, 'series', safeSeriesId, 'episodes', staleEpId));
        opCount += 1;
        await flushIfNeeded();
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, episodesPath);
  }

  if (alsoMarkInitialized) {
    await markCatalogInitialized(uid);
  }
}
