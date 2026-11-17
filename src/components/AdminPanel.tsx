import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Film,
  Folder,
  Globe,
  Link2,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { DramaGenre, type DramaSeries, type Episode } from '../types/drama';
import {
  computeCatalogStats,
  countDoodstreamEpisodes,
  POSTER_PRESETS,
  validateEpisodeInput,
  validateSeriesInput,
  type EpisodeFormErrors,
  type EpisodeFormInput,
  type SeriesFormErrors,
  type SeriesFormInput,
  type UploadedEpisodePayload,
} from '../utils/adminCatalog';
import {
  buildAutoEpisodeTitle,
  extractDoodstreamFileCode,
  isValidRemoteVideoUrl,
  normalizeStreamVideoUrl,
  sanitizeDoodstreamFolderName,
} from '../utils/doodstream';
import { formatDuration } from '../utils/dramaLogic';
import { PosterImage } from './PosterImage';

interface DoodstreamLibraryFile {
  filecode: string;
  title: string;
  durationSec: number;
  uploaded: string;
  embedUrl: string;
}

interface AdminPanelProps {
  seriesList: DramaSeries[];
  onSaveSeries: (input: SeriesFormInput, editingSeriesId?: string) => string;
  onDeleteSeries: (seriesId: string) => void;
  onSetFeaturedSeries: (seriesId: string) => void;
  onSaveEpisode: (
    seriesId: string,
    input: EpisodeFormInput,
    editingEpisodeNumber?: number,
  ) => void;
  onReorderEpisode: (
    seriesId: string,
    episodeNumber: number,
    direction: 'up' | 'down',
  ) => void;
  onDeleteEpisode: (seriesId: string, episodeNumber: number) => void;
  onResetCatalog: () => void;
  onPreviewEpisode: (series: DramaSeries, episodeNumber: number) => void;
  onAttachDoodstreamFolder: (
    seriesId: string,
    folderId: string,
    folderName: string,
  ) => void;
  onQuickAddUploadedEpisode: (
    seriesId: string,
    payload: UploadedEpisodePayload,
  ) => void;
  onAttachVideoToEpisode: (
    seriesId: string,
    episodeNumber: number,
    payload: UploadedEpisodePayload,
  ) => void;
  onNavigateHome: () => void;
  adminEmail?: string | null;
  onSignOut?: () => void;
  isOnlineCatalogInitialized?: boolean;
  isSyncingOnline?: boolean;
  onPublishLocalCatalog?: () => void;
}

const EDITABLE_GENRES: DramaGenre[] = [
  DramaGenre.Romance,
  DramaGenre.Mystery,
  DramaGenre.Family,
  DramaGenre.Comedy,
  DramaGenre.Action,
];

const ACCENT_OPTIONS = [
  { label: 'Crimson', value: '#E11D48' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Sky', value: '#38BDF8' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Red', value: '#EF4444' },
];

function createEmptySeriesInput(): SeriesFormInput {
  return {
    title: '',
    subtitle: '',
    genre: DramaGenre.Romance,
    year: new Date().getFullYear(),
    castText: '',
    director: '',
    synopsis: '',
    posterUrl: POSTER_PRESETS[0].url,
    freeUntilEpisode: 3,
    viewsLabel: 'Baru rilis',
  };
}

function seriesToFormInput(series: DramaSeries): SeriesFormInput {
  return {
    title: series.title,
    subtitle: series.subtitle,
    genre: series.genre === DramaGenre.All ? DramaGenre.Romance : series.genre,
    year: series.year,
    castText: series.cast.join(', '),
    director: series.director,
    synopsis: series.synopsis,
    posterUrl: series.posterUrl,
    freeUntilEpisode: series.freeUntilEpisode,
    viewsLabel: series.viewsLabel,
  };
}

function createEmptyEpisodeInput(): EpisodeFormInput {
  return {
    title: '',
    synopsis: '',
    durationSec: 28,
    sceneMood: '',
    accentTint: '#E11D48',
    doodstreamFileCode: '',
    doodstreamEmbedUrl: '',
    subtitles: [
      {
        startSec: 1,
        endSec: 6,
        speaker: 'Tokoh Utama',
        text: '',
      },
    ],
  };
}

function episodeToFormInput(episode: Episode): EpisodeFormInput {
  return {
    title: episode.title,
    synopsis: episode.synopsis,
    durationSec: episode.durationSec,
    sceneMood: episode.sceneMood,
    accentTint: episode.accentTint,
    doodstreamFileCode: episode.doodstreamFileCode ?? '',
    doodstreamEmbedUrl: episode.doodstreamEmbedUrl ?? '',
    subtitles: episode.subtitles.map((cue) => ({ ...cue })),
  };
}

export function AdminPanel({
  seriesList,
  onSaveSeries,
  onDeleteSeries,
  onSetFeaturedSeries,
  onSaveEpisode,
  onReorderEpisode,
  onDeleteEpisode,
  onResetCatalog,
  onPreviewEpisode,
  onAttachDoodstreamFolder,
  onQuickAddUploadedEpisode,
  onAttachVideoToEpisode,
  onNavigateHome,
  adminEmail,
  onSignOut,
  isOnlineCatalogInitialized = true,
  isSyncingOnline = false,
  onPublishLocalCatalog,
}: AdminPanelProps) {
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
    seriesList[0]?.id ?? '',
  );
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [adminSearch, setAdminSearch] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteSeriesId, setConfirmDeleteSeriesId] = useState<string | null>(
    null,
  );
  const [confirmDeleteEpisodeNum, setConfirmDeleteEpisodeNum] = useState<
    number | null
  >(null);

  // Doodstream server & modal upload state
  const [doodConfigured, setDoodConfigured] = useState<boolean | null>(null);
  const [doodLibrary, setDoodLibrary] = useState<DoodstreamLibraryFile[]>([]);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [remoteVideoUrl, setRemoteVideoUrl] = useState('');
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Unified inline video + episode upload state under active title
  const [inlineEpisodeTitle, setInlineEpisodeTitle] = useState('');
  const [inlineVideoFile, setInlineVideoFile] = useState<File | null>(null);
  const [inlineFileInputKey, setInlineFileInputKey] = useState(0);
  const [inlineRemoteUrl, setInlineRemoteUrl] = useState('');
  const [inlineEmbedInput, setInlineEmbedInput] = useState('');
  const [inlineUploadMode, setInlineUploadMode] = useState<
    'file' | 'remote' | 'embed'
  >('file');
  const [isInlineUploading, setIsInlineUploading] = useState(false);
  const [inlineFeedback, setInlineFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-episode inline upload state inside selected title detail workspace
  const [perEpisodeUploadNum, setPerEpisodeUploadNum] = useState<number | null>(
    null,
  );
  const [perEpisodeMode, setPerEpisodeMode] = useState<
    'file' | 'remote' | 'embed'
  >('file');
  const [perEpisodeFile, setPerEpisodeFile] = useState<File | null>(null);
  const [perEpisodeFileInputKey, setPerEpisodeFileInputKey] = useState(0);
  const [perEpisodeRemoteUrl, setPerEpisodeRemoteUrl] = useState('');
  const [perEpisodeEmbedInput, setPerEpisodeEmbedInput] = useState('');
  const [isPerEpisodeUploading, setIsPerEpisodeUploading] = useState(false);
  const [perEpisodeFeedback, setPerEpisodeFeedback] = useState<{
    episodeNumber: number;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Film modal state
  const [seriesModal, setSeriesModal] = useState<{
    mode: 'create' | 'edit';
    editingId?: string;
    form: SeriesFormInput;
    errors: SeriesFormErrors;
  } | null>(null);

  // Episode modal state
  const [episodeModal, setEpisodeModal] = useState<{
    mode: 'create' | 'edit';
    seriesId: string;
    editingNumber?: number;
    form: EpisodeFormInput;
    errors: EpisodeFormErrors;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/doodstream/status')
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        if (!active) return;
        setDoodConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (active) setDoodConfigured(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => computeCatalogStats(seriesList), [seriesList]);

  const filteredSeries = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) {
      return seriesList;
    }
    return seriesList.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.genre.toLowerCase().includes(q) ||
        item.director.toLowerCase().includes(q),
    );
  }, [seriesList, adminSearch]);

  const activeSeries = useMemo(
    () =>
      seriesList.find((item) => item.id === selectedSeriesId) ??
      seriesList[0] ??
      null,
    [seriesList, selectedSeriesId],
  );

  // Load Doodstream library files scoped to the selected title's folder when configured
  useEffect(() => {
    if (!doodConfigured) {
      return;
    }
    let active = true;
    const fldQuery = activeSeries?.doodstreamFolderId
      ? `?fld_id=${encodeURIComponent(activeSeries.doodstreamFolderId)}`
      : '';
    fetch(`/api/doodstream/files${fldQuery}`)
      .then((r) => r.json())
      .then((listData: { files?: DoodstreamLibraryFile[] }) => {
        if (active && Array.isArray(listData.files)) {
          setDoodLibrary(listData.files);
        }
      })
      .catch(() => {
        // Ignore transient library fetch errors
      });
    return () => {
      active = false;
    };
  }, [doodConfigured, activeSeries?.id, activeSeries?.doodstreamFolderId]);

  useEffect(() => {
    setInlineFeedback(null);
    setInlineEpisodeTitle('');
    setInlineVideoFile(null);
    setInlineFileInputKey((prev) => prev + 1);
    setInlineRemoteUrl('');
    setInlineEmbedInput('');
    setPerEpisodeUploadNum(null);
    setPerEpisodeFile(null);
    setPerEpisodeFileInputKey((prev) => prev + 1);
    setPerEpisodeRemoteUrl('');
    setPerEpisodeEmbedInput('');
    setPerEpisodeFeedback(null);
  }, [activeSeries?.id]);

  const openTitleDetail = (seriesId: string) => {
    setSelectedSeriesId(seriesId);
    setViewMode('detail');
    setConfirmDeleteEpisodeNum(null);
    setConfirmDeleteSeriesId(null);
    setPerEpisodeUploadNum(null);
    setPerEpisodeFeedback(null);
  };

  const openCreateSeries = () => {
    setSeriesModal({
      mode: 'create',
      form: createEmptySeriesInput(),
      errors: {},
    });
  };

  const openEditSeries = (series: DramaSeries) => {
    setSeriesModal({
      mode: 'edit',
      editingId: series.id,
      form: seriesToFormInput(series),
      errors: {},
    });
  };

  const handleSubmitSeries = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seriesModal) {
      return;
    }
    const errors = validateSeriesInput(seriesModal.form);
    if (Object.keys(errors).length > 0) {
      setSeriesModal({ ...seriesModal, errors });
      return;
    }
    const isCreating = seriesModal.mode === 'create';
    const savedId = onSaveSeries(seriesModal.form, seriesModal.editingId);
    setSelectedSeriesId(savedId);
    if (isCreating) {
      setViewMode('detail');
      setConfirmDeleteEpisodeNum(null);
      setPerEpisodeUploadNum(null);
      setPerEpisodeFeedback(null);
    }
    setSeriesModal(null);
  };

  const openCreateEpisode = (seriesId: string) => {
    setSelectedVideoFile(null);
    setRemoteVideoUrl('');
    setUploadFeedback(null);
    setEpisodeModal({
      mode: 'create',
      seriesId,
      form: createEmptyEpisodeInput(),
      errors: {},
    });
  };

  const openEditEpisode = (seriesId: string, episode: Episode) => {
    setSelectedVideoFile(null);
    setRemoteVideoUrl('');
    setUploadFeedback(null);
    setEpisodeModal({
      mode: 'edit',
      seriesId,
      editingNumber: episode.number,
      form: episodeToFormInput(episode),
      errors: {},
    });
  };

  const handleUploadVideoToDoodstream = async () => {
    if (!episodeModal) {
      return;
    }
    if (!selectedVideoFile) {
      setUploadFeedback({
        type: 'error',
        message: 'Pilih berkas video terlebih dahulu sebelum mengunggah.',
      });
      return;
    }

    const modalSeries = seriesList.find((s) => s.id === episodeModal.seriesId);
    setIsUploadingVideo(true);
    setUploadFeedback(null);

    try {
      const formData = new FormData();
      formData.append('video', selectedVideoFile);
      if (episodeModal.form.title.trim()) {
        formData.append('title', episodeModal.form.title.trim());
      }
      if (modalSeries) {
        formData.append(
          'seriesTitle',
          sanitizeDoodstreamFolderName(modalSeries.title),
        );
        if (modalSeries.doodstreamFolderId) {
          formData.append('folderId', modalSeries.doodstreamFolderId);
        }
      }

      const response = await fetch('/api/doodstream/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        durationSec?: number;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setUploadFeedback({
          type: 'error',
          message: data.error || 'Gagal mengunggah video ke Doodstream.',
        });
        return;
      }

      if (data.folderId && modalSeries) {
        onAttachDoodstreamFolder(
          modalSeries.id,
          data.folderId,
          data.folderName || modalSeries.title,
        );
      }

      setEpisodeModal((prev) =>
        prev
          ? {
              ...prev,
              form: {
                ...prev.form,
                doodstreamFileCode: data.filecode,
                doodstreamEmbedUrl: data.embedUrl,
                durationSec:
                  data.durationSec && data.durationSec >= 5
                    ? Math.min(600, Math.round(data.durationSec))
                    : prev.form.durationSec,
              },
              errors: { ...prev.errors, doodstreamEmbedUrl: undefined },
            }
          : null,
      );
      setUploadFeedback({
        type: 'success',
        message: data.folderCreated
          ? `Folder "${data.folderName}" dibuat di Doodstream & video terunggah (${data.filecode}).`
          : `Video terunggah ke folder "${data.folderName || modalSeries?.title || 'Doodstream'}" (${data.filecode}).`,
      });
      setSelectedVideoFile(null);
    } catch {
      setUploadFeedback({
        type: 'error',
        message: 'Koneksi ke server unggah terputus.',
      });
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleRemoteUploadToDoodstream = async () => {
    if (!episodeModal) {
      return;
    }
    if (!isValidRemoteVideoUrl(remoteVideoUrl)) {
      setUploadFeedback({
        type: 'error',
        message: 'Masukkan URL video sumber (http/https) yang valid.',
      });
      return;
    }

    const modalSeries = seriesList.find((s) => s.id === episodeModal.seriesId);
    setIsUploadingVideo(true);
    setUploadFeedback(null);

    try {
      const response = await fetch('/api/doodstream/remote-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: remoteVideoUrl.trim(),
          seriesTitle: modalSeries
            ? sanitizeDoodstreamFolderName(modalSeries.title)
            : undefined,
          fld_id: modalSeries?.doodstreamFolderId,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setUploadFeedback({
          type: 'error',
          message: data.error || 'Remote upload Doodstream gagal diproses.',
        });
        return;
      }

      if (data.folderId && modalSeries) {
        onAttachDoodstreamFolder(
          modalSeries.id,
          data.folderId,
          data.folderName || modalSeries.title,
        );
      }

      setEpisodeModal((prev) =>
        prev
          ? {
              ...prev,
              form: {
                ...prev.form,
                doodstreamFileCode: data.filecode,
                doodstreamEmbedUrl: data.embedUrl,
              },
              errors: { ...prev.errors, doodstreamEmbedUrl: undefined },
            }
          : null,
      );
      setUploadFeedback({
        type: 'success',
        message: data.folderCreated
          ? `Folder "${data.folderName}" dibuat & remote upload dikirim (${data.filecode}).`
          : `Remote upload dikirim ke folder "${data.folderName || modalSeries?.title || 'Doodstream'}" (${data.filecode}).`,
      });
      setRemoteVideoUrl('');
    } catch {
      setUploadFeedback({
        type: 'error',
        message: 'Gagal menghubungi server remote upload.',
      });
    } finally {
      setIsUploadingVideo(false);
    }
  };

  // Inline unified handlers inside active film workspace (1 judul -> folder + video + episode)
  const handleInlineUploadAndCreateEpisode = async () => {
    if (!activeSeries) {
      return;
    }
    if (!inlineVideoFile) {
      setInlineFeedback({
        type: 'error',
        message: 'Pilih berkas video episode terlebih dahulu.',
      });
      return;
    }

    const nextEpNumber = activeSeries.episodes.length + 1;
    const epTitle = buildAutoEpisodeTitle(
      inlineEpisodeTitle || inlineVideoFile.name,
      nextEpNumber,
    );

    setIsInlineUploading(true);
    setInlineFeedback(null);

    try {
      const formData = new FormData();
      formData.append('video', inlineVideoFile);
      formData.append('title', epTitle);
      formData.append(
        'seriesTitle',
        sanitizeDoodstreamFolderName(activeSeries.title),
      );
      if (activeSeries.doodstreamFolderId) {
        formData.append('folderId', activeSeries.doodstreamFolderId);
      }

      const response = await fetch('/api/doodstream/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        durationSec?: number;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setInlineFeedback({
          type: 'error',
          message: data.error || 'Unggah video ke Doodstream gagal diproses.',
        });
        return;
      }

      onQuickAddUploadedEpisode(activeSeries.id, {
        title: epTitle,
        embedUrl: data.embedUrl,
        filecode: data.filecode,
        durationSec: data.durationSec,
        folderId: data.folderId,
        folderName: data.folderName || activeSeries.title,
      });

      setInlineFeedback({
        type: 'success',
        message: data.folderCreated
          ? `Folder Doodstream "${data.folderName}" dibuat otomatis & Episode ${nextEpNumber} ditambahkan.`
          : `Video ditambahkan sebagai Episode ${nextEpNumber} di folder "${data.folderName || activeSeries.title}".`,
      });
      setInlineEpisodeTitle('');
      setInlineVideoFile(null);
      setInlineFileInputKey((prev) => prev + 1);
    } catch {
      setInlineFeedback({
        type: 'error',
        message: 'Koneksi ke server unggah terputus.',
      });
    } finally {
      setIsInlineUploading(false);
    }
  };

  const handleInlineRemoteAndCreateEpisode = async () => {
    if (!activeSeries) {
      return;
    }
    if (!isValidRemoteVideoUrl(inlineRemoteUrl)) {
      setInlineFeedback({
        type: 'error',
        message: 'Masukkan URL video sumber (http/https) yang valid.',
      });
      return;
    }

    const nextEpNumber = activeSeries.episodes.length + 1;
    const epTitle = buildAutoEpisodeTitle(inlineEpisodeTitle, nextEpNumber);

    setIsInlineUploading(true);
    setInlineFeedback(null);

    try {
      const response = await fetch('/api/doodstream/remote-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inlineRemoteUrl.trim(),
          seriesTitle: sanitizeDoodstreamFolderName(activeSeries.title),
          fld_id: activeSeries.doodstreamFolderId,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setInlineFeedback({
          type: 'error',
          message: data.error || 'Remote upload Doodstream gagal diproses.',
        });
        return;
      }

      onQuickAddUploadedEpisode(activeSeries.id, {
        title: epTitle,
        embedUrl: data.embedUrl,
        filecode: data.filecode,
        folderId: data.folderId,
        folderName: data.folderName || activeSeries.title,
      });

      setInlineFeedback({
        type: 'success',
        message: data.folderCreated
          ? `Folder "${data.folderName}" dibuat otomatis & Episode ${nextEpNumber} ditambahkan.`
          : `Remote upload ditambahkan sebagai Episode ${nextEpNumber}.`,
      });
      setInlineEpisodeTitle('');
      setInlineRemoteUrl('');
    } catch {
      setInlineFeedback({
        type: 'error',
        message: 'Gagal menghubungi server remote upload.',
      });
    } finally {
      setIsInlineUploading(false);
    }
  };

  const handleInlineEmbedAndCreateEpisode = () => {
    if (!activeSeries) {
      return;
    }
    const normalizedEmbed = normalizeStreamVideoUrl(inlineEmbedInput);
    if (!normalizedEmbed) {
      setInlineFeedback({
        type: 'error',
        message:
          'Masukkan link embed Doodstream (contoh: https://dood.to/e/kode), filecode, atau link MP4/WebM langsung yang valid.',
      });
      return;
    }

    const nextEpNumber = activeSeries.episodes.length + 1;
    const epTitle = buildAutoEpisodeTitle(inlineEpisodeTitle, nextEpNumber);

    onQuickAddUploadedEpisode(activeSeries.id, {
      title: epTitle,
      embedUrl: normalizedEmbed,
      filecode: extractDoodstreamFileCode(normalizedEmbed) ?? undefined,
    });

    setInlineFeedback({
      type: 'success',
      message: `Episode ${nextEpNumber} (${epTitle}) terhubung ke video Doodstream di bawah judul "${activeSeries.title}".`,
    });
    setInlineEpisodeTitle('');
    setInlineEmbedInput('');
  };

  // Per-episode upload handlers directly inside each episode row
  const openPerEpisodeUploader = (ep: Episode) => {
    if (perEpisodeUploadNum === ep.number) {
      setPerEpisodeUploadNum(null);
      return;
    }
    setPerEpisodeUploadNum(ep.number);
    setPerEpisodeMode('file');
    setPerEpisodeFile(null);
    setPerEpisodeFileInputKey((prev) => prev + 1);
    setPerEpisodeRemoteUrl('');
    setPerEpisodeEmbedInput(ep.doodstreamEmbedUrl ?? '');
    setPerEpisodeFeedback(null);
  };

  const handlePerEpisodeFileUpload = async (ep: Episode) => {
    if (!activeSeries) {
      return;
    }
    if (!perEpisodeFile) {
      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'error',
        message: 'Pilih berkas video terlebih dahulu untuk episode ini.',
      });
      return;
    }

    setIsPerEpisodeUploading(true);
    setPerEpisodeFeedback(null);

    try {
      const formData = new FormData();
      formData.append('video', perEpisodeFile);
      formData.append(
        'title',
        `${activeSeries.title} - Ep ${ep.number} ${ep.title}`,
      );
      formData.append(
        'seriesTitle',
        sanitizeDoodstreamFolderName(activeSeries.title),
      );
      if (activeSeries.doodstreamFolderId) {
        formData.append('folderId', activeSeries.doodstreamFolderId);
      }

      const response = await fetch('/api/doodstream/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        durationSec?: number;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setPerEpisodeFeedback({
          episodeNumber: ep.number,
          type: 'error',
          message: data.error || 'Gagal mengunggah video episode ke Doodstream.',
        });
        return;
      }

      onAttachVideoToEpisode(activeSeries.id, ep.number, {
        title: ep.title,
        embedUrl: data.embedUrl,
        filecode: data.filecode,
        durationSec: data.durationSec,
        folderId: data.folderId,
        folderName: data.folderName || activeSeries.title,
      });

      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'success',
        message: data.folderCreated
          ? `Folder "${data.folderName}" dibuat otomatis & video Episode ${ep.number} terpasang (${data.filecode}).`
          : `Video Episode ${ep.number} terunggah ke folder "${data.folderName || activeSeries.title}" (${data.filecode}).`,
      });
      setPerEpisodeFile(null);
      setPerEpisodeFileInputKey((prev) => prev + 1);
      setPerEpisodeUploadNum(null);
    } catch {
      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'error',
        message: 'Koneksi ke server unggah terputus.',
      });
    } finally {
      setIsPerEpisodeUploading(false);
    }
  };

  const handlePerEpisodeRemoteUpload = async (ep: Episode) => {
    if (!activeSeries) {
      return;
    }
    if (!isValidRemoteVideoUrl(perEpisodeRemoteUrl)) {
      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'error',
        message: 'Masukkan URL video sumber (http/https) yang valid.',
      });
      return;
    }

    setIsPerEpisodeUploading(true);
    setPerEpisodeFeedback(null);

    try {
      const response = await fetch('/api/doodstream/remote-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: perEpisodeRemoteUrl.trim(),
          seriesTitle: sanitizeDoodstreamFolderName(activeSeries.title),
          fld_id: activeSeries.doodstreamFolderId,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        filecode?: string;
        embedUrl?: string;
        folderId?: string;
        folderName?: string;
        folderCreated?: boolean;
      };

      if (!response.ok || !data.ok || !data.filecode || !data.embedUrl) {
        setPerEpisodeFeedback({
          episodeNumber: ep.number,
          type: 'error',
          message: data.error || 'Remote upload Doodstream gagal diproses.',
        });
        return;
      }

      onAttachVideoToEpisode(activeSeries.id, ep.number, {
        title: ep.title,
        embedUrl: data.embedUrl,
        filecode: data.filecode,
        folderId: data.folderId,
        folderName: data.folderName || activeSeries.title,
      });

      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'success',
        message: data.folderCreated
          ? `Folder "${data.folderName}" dibuat & remote upload Episode ${ep.number} terpasang (${data.filecode}).`
          : `Remote upload Episode ${ep.number} terpasang ke folder "${data.folderName || activeSeries.title}" (${data.filecode}).`,
      });
      setPerEpisodeRemoteUrl('');
      setPerEpisodeUploadNum(null);
    } catch {
      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'error',
        message: 'Gagal menghubungi server remote upload.',
      });
    } finally {
      setIsPerEpisodeUploading(false);
    }
  };

  const handlePerEpisodeEmbedSave = (ep: Episode) => {
    if (!activeSeries) {
      return;
    }
    const normalizedEmbed = normalizeStreamVideoUrl(perEpisodeEmbedInput);
    if (!normalizedEmbed) {
      setPerEpisodeFeedback({
        episodeNumber: ep.number,
        type: 'error',
        message:
          'Masukkan link embed Doodstream (contoh: https://dood.to/e/kode), filecode, atau link MP4/WebM langsung yang valid.',
      });
      return;
    }

    const code = extractDoodstreamFileCode(normalizedEmbed) ?? undefined;
    onAttachVideoToEpisode(activeSeries.id, ep.number, {
      title: ep.title,
      embedUrl: normalizedEmbed,
      filecode: code,
    });

    setPerEpisodeFeedback({
      episodeNumber: ep.number,
      type: 'success',
      message: `Link Doodstream terpasang pada Episode ${ep.number}${code ? ` (${code})` : ''}.`,
    });
    setPerEpisodeEmbedInput('');
    setPerEpisodeUploadNum(null);
  };

  const handleSubmitEpisode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!episodeModal) {
      return;
    }
    const errors = validateEpisodeInput(episodeModal.form);
    if (Object.keys(errors).length > 0) {
      setEpisodeModal({ ...episodeModal, errors });
      return;
    }
    onSaveEpisode(
      episodeModal.seriesId,
      episodeModal.form,
      episodeModal.editingNumber,
    );
    setEpisodeModal(null);
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] pb-12">
      {/* Standalone Admin Top Bar (completely separated from main viewer site) */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#09090B]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 md:h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/admin"
              onClick={(e) => e.preventDefault()}
              className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
            >
              LayarMini Studio
            </a>
            <span aria-hidden="true" className="text-zinc-600 hidden sm:inline">
              /
            </span>
            <span className="text-xs text-zinc-400 truncate hidden sm:inline">
              Panel Admin &amp; Penyimpanan Doodstream
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {adminEmail && (
              <span className="hidden md:inline max-w-[200px] truncate text-xs text-zinc-400">
                {adminEmail}
              </span>
            )}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigateHome();
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 bg-[#141417] px-3.5 py-2 text-xs sm:text-sm font-medium text-zinc-200 whitespace-nowrap shrink-0 transition-colors hover:border-white/25 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Halaman Utama</span>
            </a>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Keluar dari akun admin"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#141417] px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-[#E11D48]/50 hover:text-white cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        <section
          aria-labelledby="admin-heading"
          className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        >
          {!isOnlineCatalogInitialized && onPublishLocalCatalog && (
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Globe
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-display text-sm font-semibold text-white">
                    Publikasikan Katalog Perangkat Ini ke Online ({seriesList.length} Film)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                    Katalog di browser ini belum disinkronkan ke database online. Klik tombol di
                    samping agar penonton di HP lain dan semua perangkat langsung melihat daftar
                    film serta video terbaru Anda.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSyncingOnline}
                onClick={onPublishLocalCatalog}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#E11D48] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#BE123C] disabled:opacity-60 cursor-pointer"
              >
                {isSyncingOnline ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Memublikasikan...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="h-4 w-4" aria-hidden="true" />
                    <span>Publikasikan ke Online</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Top Admin Header */}
          <div className="flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-400">
                Admin Terpisah / Katalog &amp; Video Doodstream
              </p>
              <h1
                id="admin-heading"
                className="font-display mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl"
              >
                Kelola Film &amp; Episode
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Atur serial drama pendek, unggah video episode ke penyimpanan
                Doodstream, dan kelola dialog subtitle secara langsung.
              </p>
            </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {confirmReset ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5">
              <span className="text-xs text-amber-200 whitespace-nowrap">
                Kembalikan katalog awal?
              </span>
              <button
                type="button"
                onClick={() => {
                  onResetCatalog();
                  setViewMode('list');
                  setConfirmReset(false);
                  setConfirmDeleteSeriesId(null);
                  setConfirmDeleteEpisodeNum(null);
                  setPerEpisodeUploadNum(null);
                  setPerEpisodeFeedback(null);
                }}
                className="rounded px-2.5 py-1 text-xs font-semibold bg-amber-500 text-black hover:bg-amber-400 cursor-pointer whitespace-nowrap"
              >
                Ya, Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded px-2 py-1 text-xs text-zinc-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 bg-[#141417] px-3.5 py-2 text-xs font-medium text-zinc-300 whitespace-nowrap shrink-0 transition-colors hover:border-white/25 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Bawaan</span>
            </button>
          )}

          <button
            type="button"
            onClick={openCreateSeries}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#BE123C] cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Tambah Film</span>
          </button>
        </div>
      </div>

      {/* 4-Column Summary Strip (hairline borders, tabular numerals) */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/8 sm:grid-cols-4">
        <div className="bg-[#111114] p-4">
          <p className="text-xs text-zinc-400">Total Film</p>
          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-white">
            {stats.totalSeries}
          </p>
        </div>
        <div className="bg-[#111114] p-4">
          <p className="text-xs text-zinc-400">Total Episode</p>
          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-white">
            {stats.totalEpisodes}
          </p>
        </div>
        <div className="bg-[#111114] p-4">
          <p className="text-xs text-zinc-400">Episode Gratis Langsung</p>
          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-emerald-400">
            {stats.totalFreeEpisodes}
          </p>
        </div>
        <div className="bg-[#111114] p-4">
          <p className="text-xs text-zinc-400">Episode via Iklan</p>
          <p className="font-mono mt-1 text-2xl font-bold tabular-nums text-amber-400">
            {stats.totalAdEpisodes}
          </p>
        </div>
      </div>

      {/* Master-Detail Studio Workspace */}
      {seriesList.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#111114] p-10 text-center">
          <Film className="mx-auto h-9 w-9 text-zinc-500" aria-hidden="true" />
          <p className="font-display mt-3 text-lg font-semibold text-white">
            Belum ada film di katalog
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Tambahkan judul film pendek baru atau pulihkan katalog bawaan.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={openCreateSeries}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Tambah Film Pertama</span>
            </button>
            <button
              type="button"
              onClick={onResetCatalog}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/12 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/8 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Pulihkan Katalog Bawaan</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'list' || !activeSeries ? (
        /* Step 1: Full-width Film Title List (klik judul untuk masuk ke pengelolaan episode & video) */
        <div className="mt-6 rounded-xl border border-white/10 bg-[#111114]">
          <div className="flex flex-col gap-3 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Daftar Judul Film ({filteredSeries.length})
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Klik salah satu judul film untuk masuk ke dalamnya dan mengelola
                episode serta upload video per episode.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Filter judul atau sutradara..."
                aria-label="Filter daftar film admin"
                className="h-10 w-full rounded-lg border border-white/10 bg-[#16161B] pr-3 pl-9 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
              />
            </div>
          </div>

          {filteredSeries.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-white">
                Tidak ada film yang cocok
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Ubah kata kunci filter atau tambahkan judul film baru.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {filteredSeries.map((series) => {
                const isSelected = activeSeries?.id === series.id;
                const isFeatured = seriesList[0]?.id === series.id;
                const isDeleting = confirmDeleteSeriesId === series.id;
                const videoCount = countDoodstreamEpisodes(series);

                return (
                  <div
                    key={series.id}
                    className={`p-4 transition-colors ${
                      isSelected ? 'bg-[#16161C]' : 'hover:bg-[#15151A]'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => openTitleDetail(series.id)}
                        aria-label={`Pilih film ${series.title}`}
                        className="group flex min-w-0 flex-1 items-start gap-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E11D48] rounded-md"
                      >
                        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#1B1B22]">
                          <PosterImage
                            src={series.posterUrl}
                            alt={`Poster ${series.title}`}
                            title={series.title}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-base font-semibold text-white group-hover:text-[#FDA4AF] transition-colors truncate">
                              {series.title}
                            </p>
                            {isFeatured && (
                              <span className="text-[11px] font-medium text-amber-300">
                                · Pilihan Utama
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-zinc-400 flex flex-wrap items-center gap-1.5">
                            <span>{series.genre}</span>
                            <span aria-hidden="true" className="text-zinc-600">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-200">
                              {series.episodes.length} Episode
                            </span>
                            <span aria-hidden="true" className="text-zinc-600">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-sky-300">
                              {videoCount} Video Doodstream
                            </span>
                            <span aria-hidden="true" className="text-zinc-600">
                              ·
                            </span>
                            <span className="font-mono tabular-nums">
                              Gratis Ep 1–{series.freeUntilEpisode}
                            </span>
                          </p>

                          <p className="mt-1.5 text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                            <span className="truncate">
                              Folder Doodstream:{' '}
                              <span className="text-zinc-300">
                                {series.doodstreamFolderName ||
                                  sanitizeDoodstreamFolderName(series.title)}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 font-medium text-zinc-300 group-hover:text-white">
                              <span>Kelola Episode &amp; Video</span>
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => openTitleDetail(series.id)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#16161B] px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap hover:border-white/25 hover:text-white cursor-pointer"
                        >
                          <span>Buka Judul</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        {!isFeatured && (
                          <button
                            type="button"
                            onClick={() => {
                              onSetFeaturedSeries(series.id);
                              setSelectedSeriesId(series.id);
                            }}
                            title="Jadikan Pilihan Utama di Beranda"
                            aria-label={`Jadikan ${series.title} pilihan utama`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-amber-300 cursor-pointer"
                          >
                            <Star className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditSeries(series)}
                          aria-label={`Edit film ${series.title}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteSeriesId(
                              isDeleting ? null : series.id,
                            )
                          }
                          aria-label={`Hapus film ${series.title}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {isDeleting && (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2">
                        <span className="text-xs text-red-200 truncate">
                          Hapus film &ldquo;{series.title}&rdquo;?
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteSeries(series.id);
                              setConfirmDeleteSeriesId(null);
                            }}
                            className="rounded px-2.5 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                          >
                            Ya, Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSeriesId(null)}
                            className="rounded px-2 py-1 text-xs text-zinc-300 hover:text-white cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Inside Selected Film Title Workspace (Kelola Episode & Upload Video per Episode) */
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setViewMode('list');
                setPerEpisodeUploadNum(null);
                setPerEpisodeFeedback(null);
                setConfirmDeleteEpisodeNum(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/12 bg-[#141417] px-3.5 py-2 text-xs sm:text-sm font-medium text-zinc-200 whitespace-nowrap hover:border-white/25 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Daftar Judul</span>
            </button>

            <p className="text-xs text-zinc-400 truncate">
              Daftar Judul <span className="mx-1.5 text-zinc-600">/</span>
              <span className="font-medium text-white">{activeSeries.title}</span>
            </p>
          </div>

          <div className="flex flex-col rounded-xl border border-white/10 bg-[#111114]">
            <div className="flex flex-col gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#1B1B22]">
                  <PosterImage
                    src={activeSeries.posterUrl}
                    alt={`Poster ${activeSeries.title}`}
                    title={activeSeries.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-1.5">
                    <span>{activeSeries.genre}</span>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span className="font-mono tabular-nums">
                      {activeSeries.year}
                    </span>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span>Sutradara: {activeSeries.director}</span>
                  </p>
                  <h2 className="font-display text-xl font-bold text-white">
                    {activeSeries.title}
                  </h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {activeSeries.synopsis}
                  </p>
                  <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span>Pemeran: {activeSeries.cast.join(', ')}</span>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span className="font-mono tabular-nums whitespace-nowrap text-zinc-200">
                      Gratis Ep 1–{activeSeries.freeUntilEpisode}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditSeries(activeSeries)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#16161B] px-3.5 py-2 text-xs font-medium text-zinc-200 whitespace-nowrap hover:border-white/25 hover:text-white cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit Film</span>
                </button>

                <button
                  type="button"
                  onClick={() => openCreateEpisode(activeSeries.id)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#BE123C] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Tambah Episode</span>
                </button>
              </div>
            </div>

            {/* Unified Video & Episode Studio Bar for This Single Film Title */}
            <div className="border-b border-white/8 bg-[#141418] p-5 space-y-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Folder
                    className="h-4 w-4 shrink-0 mt-0.5 text-amber-300"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Folder Doodstream: {activeSeries.doodstreamFolderName || sanitizeDoodstreamFolderName(activeSeries.title)}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {activeSeries.doodstreamFolderId
                        ? `Terhubung (ID: ${activeSeries.doodstreamFolderId}) · Semua upload video & episode berada di folder judul ini`
                        : `Otomatis membuat folder "${sanitizeDoodstreamFolderName(activeSeries.title)}" di Doodstream saat upload video pertama`}
                    </p>
                  </div>
                </div>

                <div
                  role="tablist"
                  aria-label="Metode tambah video dan episode"
                  className="flex items-center gap-1.5 shrink-0"
                >
                  {(
                    [
                      { id: 'file', label: 'Upload File' },
                      { id: 'remote', label: 'Remote URL' },
                      { id: 'embed', label: 'Link Embed' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={inlineUploadMode === tab.id}
                      onClick={() => {
                        setInlineUploadMode(tab.id);
                        setInlineFeedback(null);
                      }}
                      className={`min-h-[34px] rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        inlineUploadMode === tab.id
                          ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                          : 'border border-white/10 bg-[#0F0F13] text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="inline-ep-title"
                    className="block text-[11px] font-medium text-zinc-300"
                  >
                    Judul Episode Baru (opsional)
                  </label>
                  <input
                    id="inline-ep-title"
                    type="text"
                    value={inlineEpisodeTitle}
                    onChange={(e) => setInlineEpisodeTitle(e.target.value)}
                    placeholder={`Otomatis: Episode ${activeSeries.episodes.length + 1}`}
                    className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#0F0F13] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                </div>

                {inlineUploadMode === 'file' && (
                  <div className="sm:col-span-8 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor="inline-video-file"
                        className="block text-[11px] font-medium text-zinc-300"
                      >
                        Unggah Video ke Folder &amp; Jadi Episode {activeSeries.episodes.length + 1}
                      </label>
                      <input
                        key={inlineFileInputKey}
                        id="inline-video-file"
                        type="file"
                        accept="video/*"
                        onChange={(e) =>
                          setInlineVideoFile(e.target.files?.[0] ?? null)
                        }
                        className="mt-1 block w-full text-xs text-zinc-300 file:mr-2.5 file:rounded-lg file:border file:border-white/12 file:bg-[#0F0F13] file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:border-white/25 cursor-pointer"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isInlineUploading}
                      onClick={() => void handleInlineUploadAndCreateEpisode()}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                    >
                      {isInlineUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {isInlineUploading ? 'Mengunggah...' : 'Upload & Buat Episode'}
                      </span>
                    </button>
                  </div>
                )}

                {inlineUploadMode === 'remote' && (
                  <div className="sm:col-span-8 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor="inline-remote-url"
                        className="block text-[11px] font-medium text-zinc-300"
                      >
                        URL Video Sumber (Remote Upload ke Folder Judul)
                      </label>
                      <input
                        id="inline-remote-url"
                        type="url"
                        value={inlineRemoteUrl}
                        onChange={(e) => setInlineRemoteUrl(e.target.value)}
                        placeholder="https://cdn.example.com/episode-baru.mp4"
                        className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#0F0F13] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isInlineUploading}
                      onClick={() => void handleInlineRemoteAndCreateEpisode()}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remote Upload</span>
                    </button>
                  </div>
                )}

                {inlineUploadMode === 'embed' && (
                  <div className="sm:col-span-8 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor="inline-embed-url"
                        className="block text-[11px] font-medium text-zinc-300"
                      >
                        Link Embed / Filecode Doodstream
                      </label>
                      <input
                        id="inline-embed-url"
                        type="text"
                        value={inlineEmbedInput}
                        onChange={(e) => setInlineEmbedInput(e.target.value)}
                        placeholder="https://dood.to/e/kodefile atau filecode"
                        className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#0F0F13] px-3 font-mono text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleInlineEmbedAndCreateEpisode}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Tambah Episode</span>
                    </button>
                  </div>
                )}
              </div>

              {inlineFeedback && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    inlineFeedback.type === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                      : 'border-red-500/35 bg-red-500/10 text-red-200'
                  }`}
                >
                  {inlineFeedback.type === 'success' && (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                  <span>{inlineFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Episode Table Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-5 py-3">
              <h3 className="font-display text-sm font-semibold text-white">
                Daftar Episode &amp; Video ({activeSeries.episodes.length})
              </h3>
              <span className="text-xs text-zinc-400">
                {countDoodstreamEpisodes(activeSeries)} video Doodstream · Klik
                Upload Video pada tiap episode untuk mengunggah video khusus episode tersebut
              </span>
            </div>

            {activeSeries.episodes.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-display text-base font-semibold text-white">
                  Belum ada episode untuk film ini
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Tambahkan episode baru lalu unggah video langsung pada baris
                  episode, atau gunakan bar upload cepat di atas.
                </p>
                <button
                  type="button"
                  onClick={() => openCreateEpisode(activeSeries.id)}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Tambah Episode Pertama</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/8">
                {activeSeries.episodes.map((ep, index) => {
                  const isFree = ep.number <= activeSeries.freeUntilEpisode;
                  const isConfirmingEp = confirmDeleteEpisodeNum === ep.number;
                  const isUploadingThisEp = perEpisodeUploadNum === ep.number;
                  const epFeedback =
                    perEpisodeFeedback?.episodeNumber === ep.number
                      ? perEpisodeFeedback
                      : null;

                  return (
                    <div
                      key={`${activeSeries.id}-ep-${ep.number}`}
                      className="px-5 py-4 transition-colors hover:bg-[#15151A]"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/8 font-mono text-xs font-semibold tabular-nums text-white">
                            {String(ep.number).padStart(2, '0')}
                          </span>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {ep.title}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-400 flex flex-wrap items-center gap-1.5">
                              <span className="font-mono tabular-nums">
                                {formatDuration(ep.durationSec)}
                              </span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span
                                className={
                                  isFree ? 'text-emerald-400' : 'text-amber-300'
                                }
                              >
                                {isFree ? 'Gratis langsung' : 'Via iklan'}
                              </span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span className="font-mono tabular-nums">
                                {ep.subtitles.length} dialog
                              </span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span
                                className={
                                  ep.doodstreamEmbedUrl
                                    ? 'text-sky-300 font-mono'
                                    : 'text-zinc-400'
                                }
                              >
                                {ep.doodstreamEmbedUrl
                                  ? `Doodstream (${ep.doodstreamFileCode || 'Embed'})`
                                  : 'Belum ada video'}
                              </span>
                              <span aria-hidden="true" className="text-zinc-600">
                                ·
                              </span>
                              <span className="truncate">{ep.sceneMood}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end md:self-center">
                          <button
                            type="button"
                            onClick={() => openPerEpisodeUploader(ep)}
                            aria-label={`${ep.doodstreamEmbedUrl ? 'Ganti' : 'Upload'} video episode ${ep.number} ${ep.title}`}
                            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                              isUploadingThisEp
                                ? 'bg-white text-[#09090B]'
                                : ep.doodstreamEmbedUrl
                                  ? 'border border-sky-400/35 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                                  : 'bg-[#E11D48] text-white hover:bg-[#BE123C]'
                            }`}
                          >
                            <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {isUploadingThisEp
                                ? 'Tutup Upload'
                                : ep.doodstreamEmbedUrl
                                  ? 'Ganti Video'
                                  : 'Upload Video'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() =>
                              onReorderEpisode(
                                activeSeries.id,
                                ep.number,
                                'up',
                              )
                            }
                            aria-label={`Naikkan urutan episode ${ep.number}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            disabled={
                              index === activeSeries.episodes.length - 1
                            }
                            onClick={() =>
                              onReorderEpisode(
                                activeSeries.id,
                                ep.number,
                                'down',
                              )
                            }
                            aria-label={`Turunkan urutan episode ${ep.number}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onPreviewEpisode(activeSeries, ep.number)
                            }
                            aria-label={`Pratinjau putar episode ${ep.number} ${ep.title}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-[#E11D48]/15 hover:text-[#E11D48] cursor-pointer"
                          >
                            <Play className="h-4 w-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openEditEpisode(activeSeries.id, ep)
                            }
                            aria-label={`Edit episode ${ep.number} ${ep.title}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteEpisodeNum(
                                isConfirmingEp ? null : ep.number,
                              )
                            }
                            aria-label={`Hapus episode ${ep.number} ${ep.title}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {epFeedback && !isUploadingThisEp && (
                        <div
                          role="status"
                          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                            epFeedback.type === 'success'
                              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                              : 'border-red-500/35 bg-red-500/10 text-red-200'
                          }`}
                        >
                          {epFeedback.type === 'success' && (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400"
                              aria-hidden="true"
                            />
                          )}
                          <span>{epFeedback.message}</span>
                        </div>
                      )}

                      {isUploadingThisEp && (
                        <div className="mt-3 rounded-xl border border-white/12 bg-[#0F0F13] p-4 space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold text-white">
                                Upload Video untuk Episode {ep.number}: {ep.title}
                              </p>
                              <p className="text-[11px] text-zinc-400">
                                Disimpan ke folder Doodstream &ldquo;
                                {activeSeries.doodstreamFolderName ||
                                  sanitizeDoodstreamFolderName(activeSeries.title)}
                                &rdquo;
                              </p>
                            </div>

                            <div
                              role="tablist"
                              aria-label={`Metode upload video episode ${ep.number}`}
                              className="flex items-center gap-1.5 shrink-0"
                            >
                              {(
                                [
                                  { id: 'file', label: 'Upload File' },
                                  { id: 'remote', label: 'Remote URL' },
                                  { id: 'embed', label: 'Link Embed' },
                                ] as const
                              ).map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  role="tab"
                                  aria-selected={perEpisodeMode === tab.id}
                                  onClick={() => {
                                    setPerEpisodeMode(tab.id);
                                    setPerEpisodeFeedback(null);
                                  }}
                                  className={`min-h-[32px] rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                    perEpisodeMode === tab.id
                                      ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                                      : 'border border-white/10 bg-[#16161B] text-zinc-300 hover:border-white/25'
                                  }`}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {perEpisodeMode === 'file' && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`ep-upload-file-${ep.number}`}
                                  className="block text-[11px] font-medium text-zinc-300"
                                >
                                  Pilih Berkas Video untuk Episode {ep.number}
                                </label>
                                <input
                                  key={perEpisodeFileInputKey}
                                  id={`ep-upload-file-${ep.number}`}
                                  type="file"
                                  accept="video/*"
                                  onChange={(e) =>
                                    setPerEpisodeFile(
                                      e.target.files?.[0] ?? null,
                                    )
                                  }
                                  className="mt-1 block w-full text-xs text-zinc-300 file:mr-2.5 file:rounded-lg file:border file:border-white/12 file:bg-[#16161B] file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:border-white/25 cursor-pointer"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={isPerEpisodeUploading}
                                onClick={() => void handlePerEpisodeFileUpload(ep)}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                              >
                                {isPerEpisodeUploading ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CloudUpload
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>
                                  {isPerEpisodeUploading
                                    ? 'Mengunggah...'
                                    : `Upload Episode ${ep.number}`}
                                </span>
                              </button>
                            </div>
                          )}

                          {perEpisodeMode === 'remote' && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`ep-remote-url-${ep.number}`}
                                  className="block text-[11px] font-medium text-zinc-300"
                                >
                                  URL Video Sumber untuk Episode {ep.number}
                                </label>
                                <input
                                  id={`ep-remote-url-${ep.number}`}
                                  type="url"
                                  value={perEpisodeRemoteUrl}
                                  onChange={(e) =>
                                    setPerEpisodeRemoteUrl(e.target.value)
                                  }
                                  placeholder="https://cdn.example.com/ep.mp4"
                                  className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={isPerEpisodeUploading}
                                onClick={() =>
                                  void handlePerEpisodeRemoteUpload(ep)
                                }
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                              >
                                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Remote Upload</span>
                              </button>
                            </div>
                          )}

                          {perEpisodeMode === 'embed' && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1 min-w-0">
                                <label
                                  htmlFor={`ep-embed-url-${ep.number}`}
                                  className="block text-[11px] font-medium text-zinc-300"
                                >
                                  Link Embed / Filecode Doodstream Episode{' '}
                                  {ep.number}
                                </label>
                                <input
                                  id={`ep-embed-url-${ep.number}`}
                                  type="text"
                                  value={perEpisodeEmbedInput}
                                  onChange={(e) =>
                                    setPerEpisodeEmbedInput(e.target.value)
                                  }
                                  placeholder="https://dood.to/e/kodefile atau filecode"
                                  className="mt-1 h-10 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 font-mono text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePerEpisodeEmbedSave(ep)}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] cursor-pointer"
                              >
                                <CheckCircle2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Simpan Link Video</span>
                              </button>
                            </div>
                          )}

                          {epFeedback && (
                            <div
                              role="status"
                              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                                epFeedback.type === 'success'
                                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                                  : 'border-red-500/35 bg-red-500/10 text-red-200'
                              }`}
                            >
                              <span>{epFeedback.message}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {isConfirmingEp && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2">
                          <span className="text-xs text-red-200 truncate">
                            Hapus Episode {ep.number}: &ldquo;{ep.title}&rdquo;?
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteEpisode(activeSeries.id, ep.number);
                                setConfirmDeleteEpisodeNum(null);
                              }}
                              className="rounded px-2.5 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEpisodeNum(null)}
                              className="rounded px-2 py-1 text-xs text-zinc-300 hover:text-white cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Film */}
      {seriesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="series-modal-title"
        >
          <div className="no-scrollbar max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/12 bg-[#111114] p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
              <h2
                id="series-modal-title"
                className="font-display text-lg font-bold text-white"
              >
                {seriesModal.mode === 'create' ? 'Tambah Film Baru' : 'Edit Info Film'}
              </h2>
              <button
                type="button"
                onClick={() => setSeriesModal(null)}
                aria-label="Tutup formulir film"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitSeries} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="film-title"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Judul Film
                  </label>
                  <input
                    id="film-title"
                    type="text"
                    value={seriesModal.form.title}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: { ...seriesModal.form, title: e.target.value },
                      })
                    }
                    placeholder="Contoh: Jejak di Kemang"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                  {seriesModal.errors.title && (
                    <p className="mt-1 text-xs text-red-400">
                      {seriesModal.errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="film-subtitle"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Subjudul / Tagline
                  </label>
                  <input
                    id="film-subtitle"
                    type="text"
                    value={seriesModal.form.subtitle}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: { ...seriesModal.form, subtitle: e.target.value },
                      })
                    }
                    placeholder="Tagline singkat serial"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="film-genre"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Genre
                  </label>
                  <select
                    id="film-genre"
                    value={seriesModal.form.genre}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: {
                          ...seriesModal.form,
                          genre: e.target.value as DramaGenre,
                        },
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white focus:border-[#E11D48] focus:outline-none"
                  >
                    {EDITABLE_GENRES.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="film-year"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Tahun Rilis
                  </label>
                  <input
                    id="film-year"
                    type="number"
                    value={seriesModal.form.year}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: {
                          ...seriesModal.form,
                          year: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 font-mono text-sm tabular-nums text-white focus:border-[#E11D48] focus:outline-none"
                  />
                  {seriesModal.errors.year && (
                    <p className="mt-1 text-xs text-red-400">
                      {seriesModal.errors.year}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="film-free-until"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Batas Episode Gratis
                  </label>
                  <input
                    id="film-free-until"
                    type="number"
                    min={0}
                    value={seriesModal.form.freeUntilEpisode}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: {
                          ...seriesModal.form,
                          freeUntilEpisode: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 font-mono text-sm tabular-nums text-white focus:border-[#E11D48] focus:outline-none"
                  />
                  {seriesModal.errors.freeUntilEpisode && (
                    <p className="mt-1 text-xs text-red-400">
                      {seriesModal.errors.freeUntilEpisode}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="film-director"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Sutradara
                  </label>
                  <input
                    id="film-director"
                    type="text"
                    value={seriesModal.form.director}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: { ...seriesModal.form, director: e.target.value },
                      })
                    }
                    placeholder="Nama sutradara"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                  {seriesModal.errors.director && (
                    <p className="mt-1 text-xs text-red-400">
                      {seriesModal.errors.director}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="film-cast"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Pemeran (pisahkan koma)
                  </label>
                  <input
                    id="film-cast"
                    type="text"
                    value={seriesModal.form.castText}
                    onChange={(e) =>
                      setSeriesModal({
                        ...seriesModal,
                        form: { ...seriesModal.form, castText: e.target.value },
                      })
                    }
                    placeholder="Contoh: Rani Wijaya, Dimas Putra"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="film-synopsis"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Sinopsis Film
                </label>
                <textarea
                  id="film-synopsis"
                  rows={3}
                  value={seriesModal.form.synopsis}
                  onChange={(e) =>
                    setSeriesModal({
                      ...seriesModal,
                      form: { ...seriesModal.form, synopsis: e.target.value },
                    })
                  }
                  placeholder="Ringkasan cerita serial drama pendek..."
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#16161B] p-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                />
                {seriesModal.errors.synopsis && (
                  <p className="mt-1 text-xs text-red-400">
                    {seriesModal.errors.synopsis}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="film-poster-url"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Poster Film (pilih preset atau masukkan URL)
                </label>
                <div className="flex flex-wrap gap-2">
                  {POSTER_PRESETS.map((preset) => {
                    const selected = seriesModal.form.posterUrl === preset.url;
                    return (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() =>
                          setSeriesModal({
                            ...seriesModal,
                            form: {
                              ...seriesModal.form,
                              posterUrl: preset.url,
                            },
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                          selected
                            ? 'border-[#E11D48] bg-[#E11D48]/15 text-white font-semibold'
                            : 'border-white/10 bg-[#16161B] text-zinc-300 hover:border-white/25'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="film-poster-url"
                  type="text"
                  value={seriesModal.form.posterUrl}
                  onChange={(e) =>
                    setSeriesModal({
                      ...seriesModal,
                      form: { ...seriesModal.form, posterUrl: e.target.value },
                    })
                  }
                  className="h-10 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 font-mono text-xs text-zinc-200 focus:border-[#E11D48] focus:outline-none"
                />
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-[#16161B] p-3 text-xs text-zinc-300">
                <Folder
                  className="h-4 w-4 shrink-0 mt-0.5 text-amber-300"
                  aria-hidden="true"
                />
                <span>
                  Saat video pertama diunggah untuk judul{' '}
                  <strong className="text-white">
                    {seriesModal.form.title.trim() || 'baru ini'}
                  </strong>
                  , folder Doodstream dengan nama judul yang sama akan dibuat
                  otomatis sehingga seluruh video &amp; episode tersimpan dalam satu
                  judul.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/8 pt-4">
                <button
                  type="button"
                  onClick={() => setSeriesModal(null)}
                  className="min-h-[42px] rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/8 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] rounded-lg bg-[#E11D48] px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  Simpan Film
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Episode */}
      {episodeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-modal-title"
        >
          <div className="no-scrollbar max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/12 bg-[#111114] p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
              <h2
                id="episode-modal-title"
                className="font-display text-lg font-bold text-white"
              >
                {episodeModal.mode === 'create'
                  ? 'Tambah Episode Baru'
                  : `Edit Episode ${episodeModal.editingNumber}`}
              </h2>
              <button
                type="button"
                onClick={() => setEpisodeModal(null)}
                aria-label="Tutup formulir episode"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitEpisode} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ep-title"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Judul Episode
                  </label>
                  <input
                    id="ep-title"
                    type="text"
                    value={episodeModal.form.title}
                    onChange={(e) =>
                      setEpisodeModal({
                        ...episodeModal,
                        form: { ...episodeModal.form, title: e.target.value },
                      })
                    }
                    placeholder="Contoh: Rahasia Lantai Dasar"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                  {episodeModal.errors.title && (
                    <p className="mt-1 text-xs text-red-400">
                      {episodeModal.errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="ep-duration"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Durasi (detik)
                  </label>
                  <input
                    id="ep-duration"
                    type="number"
                    min={5}
                    max={600}
                    value={episodeModal.form.durationSec}
                    onChange={(e) =>
                      setEpisodeModal({
                        ...episodeModal,
                        form: {
                          ...episodeModal.form,
                          durationSec: Number(e.target.value),
                        },
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 font-mono text-sm tabular-nums text-white focus:border-[#E11D48] focus:outline-none"
                  />
                  {episodeModal.errors.durationSec && (
                    <p className="mt-1 text-xs text-red-400">
                      {episodeModal.errors.durationSec}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ep-mood"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Latar Adegan / Mood
                  </label>
                  <input
                    id="ep-mood"
                    type="text"
                    value={episodeModal.form.sceneMood}
                    onChange={(e) =>
                      setEpisodeModal({
                        ...episodeModal,
                        form: {
                          ...episodeModal.form,
                          sceneMood: e.target.value,
                        },
                      })
                    }
                    placeholder="Contoh: Lobi Gedung · Malam Hujan"
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                  {episodeModal.errors.sceneMood && (
                    <p className="mt-1 text-xs text-red-400">
                      {episodeModal.errors.sceneMood}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="ep-accent"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Warna Nuansa Adegan
                  </label>
                  <select
                    id="ep-accent"
                    value={episodeModal.form.accentTint}
                    onChange={(e) =>
                      setEpisodeModal({
                        ...episodeModal,
                        form: {
                          ...episodeModal.form,
                          accentTint: e.target.value,
                        },
                      })
                    }
                    className="mt-1.5 h-11 w-full rounded-lg border border-white/12 bg-[#16161B] px-3 text-sm text-white focus:border-[#E11D48] focus:outline-none"
                  >
                    {ACCENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ep-synopsis"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Sinopsis Episode
                </label>
                <textarea
                  id="ep-synopsis"
                  rows={2}
                  value={episodeModal.form.synopsis}
                  onChange={(e) =>
                    setEpisodeModal({
                      ...episodeModal,
                      form: { ...episodeModal.form, synopsis: e.target.value },
                    })
                  }
                  placeholder="Ringkasan adegan di episode ini..."
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#16161B] p-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                />
              </div>

              {/* Doodstream Video Storage & Upload Section */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#15151B] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Penyimpanan Video Doodstream
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Unggah berkas video langsung ke Doodstream atau tempel link
                      embed / filecode
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      doodConfigured ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {doodConfigured === null
                      ? 'Memeriksa koneksi penyimpanan...'
                      : doodConfigured
                        ? 'Penyimpanan Doodstream aktif'
                        : 'Mode link embed aktif · Server upload belum terhubung'}
                  </span>
                </div>

                {/* Direct File Upload to Doodstream */}
                <div className="space-y-2">
                  <label
                    htmlFor="ep-video-file"
                    className="block text-[11px] font-medium text-zinc-300"
                  >
                    Upload Berkas Video (MP4 / MOV / MKV, maks 250 MB)
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      id="ep-video-file"
                      type="file"
                      accept="video/*"
                      onChange={(e) =>
                        setSelectedVideoFile(e.target.files?.[0] ?? null)
                      }
                      className="block w-full flex-1 text-xs text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-white/12 file:bg-[#0F0F13] file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:border-white/25 cursor-pointer"
                    />
                    <button
                      type="button"
                      disabled={isUploadingVideo}
                      onClick={() => void handleUploadVideoToDoodstream()}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                    >
                      {isUploadingVideo ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {isUploadingVideo ? 'Mengunggah...' : 'Upload ke Doodstream'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Remote Upload URL */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="ep-remote-url"
                    className="block text-[11px] font-medium text-zinc-300"
                  >
                    Atau Remote Upload dari Link Video Langsung
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      id="ep-remote-url"
                      type="url"
                      value={remoteVideoUrl}
                      onChange={(e) => setRemoteVideoUrl(e.target.value)}
                      placeholder="https://cdn.example.com/episode-1.mp4"
                      className="h-10 w-full flex-1 rounded-lg border border-white/12 bg-[#0F0F13] px-3 text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isUploadingVideo}
                      onClick={() => void handleRemoteUploadToDoodstream()}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-[#0F0F13] px-3.5 py-2 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 hover:border-white/25 hover:text-white disabled:opacity-50 cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remote Upload</span>
                    </button>
                  </div>
                </div>

                {/* Doodstream Embed URL / Filecode Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="ep-dood-embed"
                    className="block text-[11px] font-medium text-zinc-300"
                  >
                    Link Embed / Filecode Doodstream (terisi otomatis setelah unggah)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="ep-dood-embed"
                      type="text"
                      value={episodeModal.form.doodstreamEmbedUrl ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const code = extractDoodstreamFileCode(val) ?? '';
                        setEpisodeModal({
                          ...episodeModal,
                          form: {
                            ...episodeModal.form,
                            doodstreamEmbedUrl: val,
                            doodstreamFileCode: code,
                          },
                        });
                      }}
                      onBlur={() => {
                        const val = episodeModal.form.doodstreamEmbedUrl?.trim() ?? '';
                        const norm = normalizeStreamVideoUrl(val);
                        if (norm) {
                          setEpisodeModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  form: {
                                    ...prev.form,
                                    doodstreamEmbedUrl: norm,
                                    doodstreamFileCode:
                                      extractDoodstreamFileCode(norm) ?? '',
                                  },
                                }
                              : null,
                          );
                        }
                      }}
                      placeholder="https://dood.to/e/kodefile atau filecode"
                      className="h-10 w-full flex-1 rounded-lg border border-white/12 bg-[#0F0F13] px-3 font-mono text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                    />
                    {episodeModal.form.doodstreamEmbedUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEpisodeModal({
                            ...episodeModal,
                            form: {
                              ...episodeModal.form,
                              doodstreamEmbedUrl: '',
                              doodstreamFileCode: '',
                            },
                          })
                        }
                        className="h-10 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer whitespace-nowrap"
                      >
                        Hapus Video
                      </button>
                    )}
                  </div>
                  {episodeModal.errors.doodstreamEmbedUrl && (
                    <p className="text-xs text-red-400">
                      {episodeModal.errors.doodstreamEmbedUrl}
                    </p>
                  )}
                </div>

                {doodLibrary.length > 0 && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ep-dood-library"
                      className="block text-[11px] text-zinc-400"
                    >
                      Pilih dari Daftar Video Doodstream Anda
                    </label>
                    <select
                      id="ep-dood-library"
                      value=""
                      onChange={(e) => {
                        const picked = doodLibrary.find(
                          (f) => f.filecode === e.target.value,
                        );
                        if (!picked) return;
                        setEpisodeModal({
                          ...episodeModal,
                          form: {
                            ...episodeModal.form,
                            doodstreamFileCode: picked.filecode,
                            doodstreamEmbedUrl: picked.embedUrl,
                            durationSec:
                              picked.durationSec >= 5
                                ? Math.min(600, picked.durationSec)
                                : episodeModal.form.durationSec,
                          },
                        });
                      }}
                      className="h-10 w-full rounded-lg border border-white/12 bg-[#0F0F13] px-3 text-xs text-white focus:border-[#E11D48] focus:outline-none"
                    >
                      <option value="">
                        -- Pilih video tersimpan di akun Doodstream --
                      </option>
                      {doodLibrary.map((file) => (
                        <option key={file.filecode} value={file.filecode}>
                          {file.title} ({file.filecode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {uploadFeedback && (
                  <div
                    role="status"
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      uploadFeedback.type === 'success'
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                        : 'border-red-500/35 bg-red-500/10 text-red-200'
                    }`}
                  >
                    {uploadFeedback.type === 'success' && (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400"
                        aria-hidden="true"
                      />
                    )}
                    <span>{uploadFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Dynamic Dialog / Subtitle Cues */}
              <div className="space-y-3 border-t border-white/8 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Dialog &amp; Subtitle ({episodeModal.form.subtitles.length})
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Ditampilkan sinkron saat episode diputar
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = episodeModal.form.subtitles;
                      const lastEnd =
                        prev.length > 0 ? prev[prev.length - 1].endSec : 0;
                      setEpisodeModal({
                        ...episodeModal,
                        form: {
                          ...episodeModal.form,
                          subtitles: [
                            ...prev,
                            {
                              startSec: Number((lastEnd + 0.5).toFixed(1)),
                              endSec: Number((lastEnd + 4.5).toFixed(1)),
                              speaker: 'Tokoh',
                              text: '',
                            },
                          ],
                        },
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#16161B] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-white/25 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tambah Dialog</span>
                  </button>
                </div>

                {episodeModal.errors.subtitles && (
                  <p className="text-xs text-red-400">
                    {episodeModal.errors.subtitles}
                  </p>
                )}

                <div className="space-y-2.5">
                  {episodeModal.form.subtitles.map((cue, idx) => (
                    <div
                      key={idx}
                      className="space-y-2.5 rounded-lg border border-white/8 bg-[#16161B] p-3"
                    >
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3 sm:col-span-2">
                          <label
                            htmlFor={`cue-start-${idx}`}
                            className="block text-[11px] text-zinc-400"
                          >
                            Mulai (d)
                          </label>
                          <input
                            id={`cue-start-${idx}`}
                            type="number"
                            step="0.5"
                            min={0}
                            value={cue.startSec}
                            onChange={(e) => {
                              const next = [...episodeModal.form.subtitles];
                              next[idx] = {
                                ...next[idx],
                                startSec: Number(e.target.value),
                              };
                              setEpisodeModal({
                                ...episodeModal,
                                form: { ...episodeModal.form, subtitles: next },
                              });
                            }}
                            className="mt-1 h-9 w-full rounded border border-white/10 bg-[#0F0F13] px-2 font-mono text-xs tabular-nums text-white"
                          />
                        </div>

                        <div className="col-span-3 sm:col-span-2">
                          <label
                            htmlFor={`cue-end-${idx}`}
                            className="block text-[11px] text-zinc-400"
                          >
                            Selesai (d)
                          </label>
                          <input
                            id={`cue-end-${idx}`}
                            type="number"
                            step="0.5"
                            min={0}
                            value={cue.endSec}
                            onChange={(e) => {
                              const next = [...episodeModal.form.subtitles];
                              next[idx] = {
                                ...next[idx],
                                endSec: Number(e.target.value),
                              };
                              setEpisodeModal({
                                ...episodeModal,
                                form: { ...episodeModal.form, subtitles: next },
                              });
                            }}
                            className="mt-1 h-9 w-full rounded border border-white/10 bg-[#0F0F13] px-2 font-mono text-xs tabular-nums text-white"
                          />
                        </div>

                        <div className="col-span-4 sm:col-span-7">
                          <label
                            htmlFor={`cue-speaker-${idx}`}
                            className="block text-[11px] text-zinc-400"
                          >
                            Tokoh
                          </label>
                          <input
                            id={`cue-speaker-${idx}`}
                            type="text"
                            value={cue.speaker}
                            onChange={(e) => {
                              const next = [...episodeModal.form.subtitles];
                              next[idx] = {
                                ...next[idx],
                                speaker: e.target.value,
                              };
                              setEpisodeModal({
                                ...episodeModal,
                                form: { ...episodeModal.form, subtitles: next },
                              });
                            }}
                            className="mt-1 h-9 w-full rounded border border-white/10 bg-[#0F0F13] px-2.5 text-xs text-white"
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const next = episodeModal.form.subtitles.filter(
                                (_, i) => i !== idx,
                              );
                              setEpisodeModal({
                                ...episodeModal,
                                form: { ...episodeModal.form, subtitles: next },
                              });
                            }}
                            aria-label={`Hapus baris dialog ${idx + 1}`}
                            className="flex h-9 w-9 items-center justify-center rounded text-zinc-400 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`cue-text-${idx}`}
                          className="block text-[11px] text-zinc-400"
                        >
                          Teks Dialog
                        </label>
                        <input
                          id={`cue-text-${idx}`}
                          type="text"
                          value={cue.text}
                          onChange={(e) => {
                            const next = [...episodeModal.form.subtitles];
                            next[idx] = {
                              ...next[idx],
                              text: e.target.value,
                            };
                            setEpisodeModal({
                              ...episodeModal,
                              form: { ...episodeModal.form, subtitles: next },
                            });
                          }}
                          placeholder="Kalimat dialog..."
                          className="mt-1 h-9 w-full rounded border border-white/10 bg-[#0F0F13] px-2.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/8 pt-4">
                <button
                  type="button"
                  onClick={() => setEpisodeModal(null)}
                  className="min-h-[42px] rounded-lg border border-white/12 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/8 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] rounded-lg bg-[#E11D48] px-5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  Simpan Episode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </section>
      </main>
    </div>
  );
}
