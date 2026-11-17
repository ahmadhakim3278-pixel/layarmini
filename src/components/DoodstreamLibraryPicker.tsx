import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  Film,
  Folder,
  Globe,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { Episode } from '../types/drama';
import {
  filterDoodstreamLibraryFiles,
  type DoodstreamLibraryFile,
  type DoodstreamLibrarySort,
} from '../utils/doodstreamLibrary';
import { formatDuration } from '../utils/dramaLogic';

export type DoodstreamLibraryScope = 'folder' | 'all';

interface DoodstreamLibraryPickerProps {
  idPrefix: string;
  mode: 'append' | 'attach' | 'modal';
  targetEpisodeNumber?: number;
  doodConfigured: boolean | null;
  files: readonly DoodstreamLibraryFile[];
  episodes: readonly Episode[];
  isLoading: boolean;
  error: string | null;
  scope: DoodstreamLibraryScope;
  hasSeriesFolder: boolean;
  seriesFolderName?: string;
  selectedFileCode?: string;
  onChangeScope: (scope: DoodstreamLibraryScope) => void;
  onRefresh: () => void;
  onSelectFile: (file: DoodstreamLibraryFile) => void;
  onSwitchToEmbed?: () => void;
}

export function DoodstreamLibraryPicker({
  idPrefix,
  mode,
  targetEpisodeNumber,
  doodConfigured,
  files,
  episodes,
  isLoading,
  error,
  scope,
  hasSeriesFolder,
  seriesFolderName,
  selectedFileCode,
  onChangeScope,
  onRefresh,
  onSelectFile,
  onSwitchToEmbed,
}: DoodstreamLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hideUsed, setHideUsed] = useState(false);
  const [sortOrder, setSortOrder] = useState<DoodstreamLibrarySort>('newest');
  const [dropdownFileCode, setDropdownFileCode] = useState('');
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  const annotatedAll = useMemo(
    () => filterDoodstreamLibraryFiles(files, episodes, '', false),
    [files, episodes],
  );

  const unusedCount = useMemo(
    () => annotatedAll.filter((file) => file.usedInEpisode === null).length,
    [annotatedAll],
  );

  const visibleFiles = useMemo(
    () =>
      filterDoodstreamLibraryFiles(
        files,
        episodes,
        searchQuery,
        hideUsed,
        sortOrder,
      ),
    [files, episodes, searchQuery, hideUsed, sortOrder],
  );

  const handleConfirmDropdown = () => {
    const picked = visibleFiles.find((f) => f.filecode === dropdownFileCode);
    if (!picked) {
      return;
    }
    onSelectFile(picked);
    setDropdownFileCode('');
  };

  const actionButtonLabel =
    mode === 'append' && targetEpisodeNumber
      ? `Jadikan Episode ${targetEpisodeNumber}`
      : mode === 'attach' && targetEpisodeNumber
        ? `Pasang ke Ep ${targetEpisodeNumber}`
        : 'Pilih Video';

  const rowButtonLabel =
    mode === 'append' && targetEpisodeNumber
      ? `+ Ep ${targetEpisodeNumber}`
      : mode === 'attach'
        ? 'Pasang'
        : 'Pilih';

  return (
    <div
      data-testid={`${idPrefix}-doodstream-library-picker`}
      className="space-y-3"
    >
      {/* Header row with scope toggle & refresh */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label
            htmlFor={`${idPrefix}-dood-select`}
            className="block text-[11px] font-semibold text-white"
          >
            Pilih dari Daftar Video Doodstream Anda
          </label>
          <p className="text-[11px] text-zinc-400">
            {doodConfigured
              ? scope === 'folder' && hasSeriesFolder
                ? `Menampilkan video di folder "${seriesFolderName || 'Judul ini'}" (${files.length} video)`
                : `Menampilkan semua video tersimpan di akun Doodstream Anda (${files.length} video)`
              : 'Hubungkan akun Doodstream via server agar daftar video tampil otomatis'}
          </p>
        </div>

        {doodConfigured && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {hasSeriesFolder && (
              <div
                role="group"
                aria-label="Cakupan daftar video Doodstream"
                className="inline-flex items-center rounded-md border border-white/10 bg-[#0F0F13] p-0.5"
              >
                <button
                  type="button"
                  onClick={() => onChangeScope('folder')}
                  className={`inline-flex min-h-[28px] items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    scope === 'folder'
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Folder className="h-3 w-3" aria-hidden="true" />
                  <span>Folder Judul</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeScope('all')}
                  className={`inline-flex min-h-[28px] items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    scope === 'all'
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  <span>Semua Video</span>
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isLoading}
              onClick={onRefresh}
              aria-label="Muat ulang daftar video Doodstream"
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-md border border-white/12 bg-[#0F0F13] px-2.5 text-[11px] font-medium text-zinc-200 hover:border-white/25 hover:text-white disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Muat Ulang</span>
            </button>
          </div>
        )}
      </div>

      {/* State 1: Checking status */}
      {doodConfigured === null && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0F0F13] px-3.5 py-3 text-xs text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-300" aria-hidden="true" />
          <span>Memeriksa koneksi ke akun Doodstream...</span>
        </div>
      )}

      {/* State 2: Server key not configured */}
      {doodConfigured === false && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-amber-100/90">
            Untuk memuat daftar video Doodstream secara otomatis, tambahkan
            variabel <span className="font-mono text-white">DOODSTREAM_API_KEY</span>{' '}
            di Cloudflare Pages (Settings &rarr; Environment Variables) lalu
            redeploy. Sementara itu Anda tetap bisa menempel tautan lewat tab{' '}
            <strong className="text-white">Link Embed</strong>.
          </p>
          {onSwitchToEmbed && (
            <button
              type="button"
              onClick={onSwitchToEmbed}
              className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Buka Link Embed</span>
            </button>
          )}
        </div>
      )}

      {/* State 3: Configured — Loading / Error / Empty / Ready */}
      {doodConfigured === true && (
        <>
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-md border border-red-400/35 px-2.5 text-[11px] font-semibold text-white hover:bg-red-500/20 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Coba Lagi</span>
              </button>
            </div>
          )}

          {isLoading && files.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0F0F13] px-3.5 py-4 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#E11D48]" aria-hidden="true" />
              <span>Mengambil daftar video dari akun Doodstream Anda...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col gap-2.5 rounded-lg border border-white/10 bg-[#0F0F13] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-zinc-400">
                <p className="font-medium text-zinc-200">
                  {scope === 'folder' && hasSeriesFolder
                    ? 'Belum ada video di folder judul ini.'
                    : 'Belum ada video tersimpan di akun Doodstream Anda.'}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {scope === 'folder' && hasSeriesFolder
                    ? 'Jika video diunggah langsung lewat situs Doodstream, klik tombol di samping untuk menampilkan semua video akun.'
                    : 'Unggah video melalui tab Upload File atau dashboard Doodstream lalu klik Muat Ulang.'}
                </p>
              </div>
              {scope === 'folder' && hasSeriesFolder && (
                <button
                  type="button"
                  onClick={() => onChangeScope('all')}
                  className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                >
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Lihat Semua Video Akun</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Quick Dropdown + Primary Action */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  id={`${idPrefix}-dood-select`}
                  value={mode === 'modal' ? '' : dropdownFileCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    if (mode === 'modal') {
                      const picked = visibleFiles.find((f) => f.filecode === code);
                      if (picked) {
                        onSelectFile(picked);
                      }
                      return;
                    }
                    setDropdownFileCode(code);
                  }}
                  className="h-10 w-full flex-1 rounded-lg border border-white/12 bg-[#0F0F13] px-3 text-xs text-white focus:border-[#E11D48] focus:outline-none"
                >
                  <option value="">
                    -- Pilih dari daftar video Doodstream ({visibleFiles.length}{' '}
                    tersedia) --
                  </option>
                  {visibleFiles.map((file) => (
                    <option key={file.filecode} value={file.filecode}>
                      {file.title}
                      {file.durationSec > 0
                        ? ` · ${formatDuration(file.durationSec)}`
                        : ''}
                      {` (${file.filecode})`}
                      {file.usedInEpisode !== null
                        ? ` [Sudah di Ep ${file.usedInEpisode}]`
                        : ''}
                    </option>
                  ))}
                </select>

                {mode !== 'modal' && (
                  <button
                    type="button"
                    disabled={!dropdownFileCode}
                    onClick={handleConfirmDropdown}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#BE123C] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {mode === 'append' ? (
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{actionButtonLabel}</span>
                  </button>
                )}
              </div>

              {/* Search, Sort & Unused Filter Bar */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari judul video atau filecode Doodstream..."
                    aria-label="Cari video di daftar Doodstream"
                    className="h-9 w-full rounded-lg border border-white/10 bg-[#0F0F13] pr-3 pl-8 text-xs text-white placeholder:text-zinc-500 focus:border-[#E11D48] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-pressed={sortOrder === 'name-asc'}
                    onClick={() =>
                      setSortOrder((prev) =>
                        prev === 'newest' ? 'name-asc' : 'newest',
                      )
                    }
                    className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      sortOrder === 'name-asc'
                        ? 'border-sky-400/45 bg-sky-500/15 text-sky-200'
                        : 'border-white/10 bg-[#0F0F13] text-zinc-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    <span>
                      {sortOrder === 'name-asc' ? 'Urut Ep 1→N' : 'Terbaru'}
                    </span>
                  </button>

                  {episodes.length > 0 && (
                    <button
                      type="button"
                      aria-pressed={hideUsed}
                      onClick={() => setHideUsed((prev) => !prev)}
                      className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        hideUsed
                          ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-[#0F0F13] text-zinc-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <span>
                        {hideUsed
                          ? `Hanya belum dipakai (${unusedCount})`
                          : `Sembunyikan yg terpakai (${unusedCount} baru)`}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Scrollable Video List for 1-Click Episode Selection */}
              {visibleFiles.length === 0 ? (
                <div className="rounded-lg border border-white/8 bg-[#0F0F13] px-3.5 py-4 text-center text-xs text-zinc-400">
                  Tidak ada video Doodstream yang cocok dengan filter saat ini.
                </div>
              ) : (
                <div className="max-h-56 divide-y divide-white/8 overflow-y-auto rounded-lg border border-white/10 bg-[#0F0F13]">
                  {visibleFiles.map((file) => {
                    const isSelected =
                      selectedFileCode?.toLowerCase() ===
                      file.filecode.toLowerCase();
                    const showThumb =
                      Boolean(file.singleImg) && !brokenThumbs[file.filecode];

                    return (
                      <div
                        key={file.filecode}
                        className={`flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[#17171E] ${
                          isSelected ? 'bg-[#E11D48]/10' : ''
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-[#18181F]">
                            {showThumb ? (
                              <img
                                src={file.singleImg}
                                alt={file.title}
                                loading="lazy"
                                onError={() =>
                                  setBrokenThumbs((prev) => ({
                                    ...prev,
                                    [file.filecode]: true,
                                  }))
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Film
                                className="h-4 w-4 text-zinc-500"
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">
                              {file.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                              <span className="font-mono text-zinc-300">
                                {file.filecode}
                              </span>
                              {file.durationSec > 0 && (
                                <>
                                  <span aria-hidden="true" className="text-zinc-600">
                                    ·
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatDuration(file.durationSec)}
                                  </span>
                                </>
                              )}
                              {file.usedInEpisode !== null ? (
                                <>
                                  <span aria-hidden="true" className="text-zinc-600">
                                    ·
                                  </span>
                                  <span className="font-medium text-sky-300">
                                    Terpasang di Ep {file.usedInEpisode}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span aria-hidden="true" className="text-zinc-600">
                                    ·
                                  </span>
                                  <span className="text-emerald-400">
                                    Siap dipakai
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-label={`${actionButtonLabel}: ${file.title}`}
                          onClick={() => onSelectFile(file)}
                          className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                            file.usedInEpisode !== null
                              ? 'border border-white/12 bg-[#16161B] text-zinc-200 hover:border-white/25 hover:text-white'
                              : 'bg-[#E11D48] text-white hover:bg-[#BE123C]'
                          }`}
                        >
                          {mode === 'append' && (
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{rowButtonLabel}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
