import { sanitizeDoodstreamFolderName } from '../src/utils/doodstream';

export const DEFAULT_DOODAPI_BASE = 'https://doodapi.co/api';

/**
 * Cloudflare Free plan caps HTTP request bodies at 100 MB (and Worker memory at 128 MB).
 * Guard direct edge uploads at 95 MB so users get a clear Indonesian error message
 * guiding them to Remote Upload (URL) or Link Embed for larger videos.
 */
export const MAX_CLOUDFLARE_UPLOAD_BYTES = 95 * 1024 * 1024;

export interface DoodstreamEnv {
  DOODSTREAM_API_KEY?: string;
  DOODSTREAM_API_BASE?: string;
}

export interface DoodstreamHandlerOptions {
  fetchFn?: FetchLike;
  maxUploadBytes?: number;
  maxUploadLabel?: string;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ResolvedFolder {
  folderId: string;
  folderName: string;
  created: boolean;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function resolveDoodstreamKey(env: DoodstreamEnv): string | null {
  const raw = env.DOODSTREAM_API_KEY?.trim();
  if (!raw) {
    return null;
  }
  const key = raw.replace(/^(['"])(.*)\1$/, '$2').trim();
  if (!key || key === 'MY_DOODSTREAM_API_KEY') {
    return null;
  }
  return key;
}

export function resolveDoodApiBase(env: DoodstreamEnv): string {
  const custom = env.DOODSTREAM_API_BASE?.trim();
  if (custom && /^https?:\/\//i.test(custom)) {
    return custom.replace(/\/+$/, '');
  }
  return DEFAULT_DOODAPI_BASE;
}

export function buildDoodUploadUrl(serverUrl: string, key: string): string {
  const trimmed = serverUrl.trim();
  const sep = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${sep}key=${encodeURIComponent(key)}`;
}

export function normalizeDoodReturnedUrl(
  rawUrl: string | undefined,
  kind: 'e' | 'd',
  filecode: string,
): string {
  const fallback = `https://dood.to/${kind}/${filecode}`;
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return fallback;
  }

  let candidate = trimmed;
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  } else if (candidate.startsWith('/')) {
    candidate = `https://dood.to${candidate}`;
  }

  if (!/^https?:\/\//i.test(candidate)) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const tokenMatch = parsed.pathname.match(
      /\/(?:e|d|f)\/([a-zA-Z0-9_-]{6,64})/,
    );
    const resolvedToken = tokenMatch?.[1] || filecode;

    // Doodstream upload nodes sometimes return legacy/rotated mirrors like dsvplay.com
    // that no longer resolve in DNS. Canonical dood.to/e/<token> always 301-redirects
    // to Doodstream's currently active live player mirror.
    if (hostname === 'dsvplay.com') {
      return `https://dood.to/${kind}/${resolvedToken}`;
    }
    return candidate;
  } catch {
    return fallback;
  }
}

async function parseDoodJson<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    throw new Error(`${fallbackError} (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(
      `${fallbackError} (respons non-JSON, HTTP ${response.status}).`,
    );
  }
}

export async function ensureDoodstreamFolder(
  key: string,
  rawFolderName: string,
  existingFolderId?: string,
  fetchFn: FetchLike = fetch,
  apiBase: string = DEFAULT_DOODAPI_BASE,
): Promise<ResolvedFolder> {
  const cleanName = sanitizeDoodstreamFolderName(rawFolderName);
  const trimmedExisting = existingFolderId?.trim();
  if (trimmedExisting) {
    return {
      folderId: trimmedExisting,
      folderName: cleanName,
      created: false,
    };
  }

  // Check if a folder with the same film title already exists in Doodstream root
  try {
    const listRes = await fetchFn(
      `${apiBase}/folder/list?key=${encodeURIComponent(key)}&fld_id=0&only_folders=1`,
      { headers: { Accept: 'application/json' } },
    );
    const listJson = await parseDoodJson<{
      status?: number | string;
      result?: {
        folders?: Array<{
          fld_id?: string | number;
          name?: string;
        }>;
      };
    }>(listRes, 'Gagal membaca daftar folder Doodstream');

    if (
      Number(listJson.status) === 200 &&
      Array.isArray(listJson.result?.folders)
    ) {
      const matched = listJson.result.folders.find(
        (folder) =>
          folder.name?.trim().toLowerCase() === cleanName.toLowerCase() &&
          folder.fld_id !== undefined,
      );
      if (matched && matched.fld_id !== undefined) {
        return {
          folderId: String(matched.fld_id),
          folderName: matched.name?.trim() || cleanName,
          created: false,
        };
      }
    }
  } catch {
    // Proceed to create folder if root listing fails
  }

  const createRes = await fetchFn(
    `${apiBase}/folder/create?key=${encodeURIComponent(key)}&name=${encodeURIComponent(cleanName)}`,
    { headers: { Accept: 'application/json' } },
  );
  const createJson = await parseDoodJson<{
    status?: number | string;
    msg?: string;
    result?: {
      fld_id?: string | number;
    };
  }>(createRes, 'Gagal membuat folder judul di Doodstream');

  if (Number(createJson.status) !== 200 || !createJson.result?.fld_id) {
    throw new Error(
      createJson.msg || 'Gagal membuat folder judul di Doodstream.',
    );
  }

  return {
    folderId: String(createJson.result.fld_id),
    folderName: cleanName,
    created: true,
  };
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function handleStatus(env: DoodstreamEnv): Promise<Response> {
  const key = resolveDoodstreamKey(env);
  return jsonResponse({
    configured: Boolean(key),
    provider: 'Doodstream',
  });
}

async function handleFoldersEnsure(
  request: Request,
  env: DoodstreamEnv,
  fetchFn: FetchLike,
): Promise<Response> {
  const key = resolveDoodstreamKey(env);
  const apiBase = resolveDoodApiBase(env);
  const body = await readJsonBody<{ folderName?: string; folderId?: string }>(
    request,
  );
  if (!body) {
    return jsonResponse(
      { ok: false, error: 'Format body JSON tidak valid.' },
      400,
    );
  }

  const folderName =
    typeof body.folderName === 'string' ? body.folderName.trim() : '';

  if (!folderName) {
    return jsonResponse(
      { ok: false, error: 'Nama folder (judul film) wajib diisi.' },
      400,
    );
  }

  if (!key) {
    return jsonResponse(
      {
        ok: false,
        code: 'MISSING_DOODSTREAM_KEY',
        error:
          'Kunci Doodstream belum dikonfigurasi pada environment server (Secrets).',
      },
      503,
    );
  }

  try {
    const folder = await ensureDoodstreamFolder(
      key,
      folderName,
      body.folderId,
      fetchFn,
      apiBase,
    );
    return jsonResponse({ ok: true, ...folder });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menyiapkan folder Doodstream.',
      },
      502,
    );
  }
}

async function handleFilesList(
  url: URL,
  env: DoodstreamEnv,
  fetchFn: FetchLike,
): Promise<Response> {
  const key = resolveDoodstreamKey(env);
  const apiBase = resolveDoodApiBase(env);
  if (!key) {
    return jsonResponse({ configured: false, files: [] });
  }

  const fldId = url.searchParams.get('fld_id')?.trim() ?? '';

  try {
    const params = new URLSearchParams({
      key,
      per_page: '50',
    });
    if (fldId) {
      params.set('fld_id', fldId);
    }

    const response = await fetchFn(`${apiBase}/file/list?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    const payload = await parseDoodJson<{
      status?: number | string;
      msg?: string;
      result?: {
        files?: Array<{
          file_code?: string;
          title?: string;
          length?: string | number;
          uploaded?: string;
          single_img?: string;
          fld_id?: string | number;
        }>;
      };
    }>(response, 'Gagal mengambil daftar video Doodstream');

    if (Number(payload.status) !== 200) {
      return jsonResponse(
        {
          configured: true,
          error: payload.msg || 'Gagal mengambil daftar video Doodstream.',
          files: [],
        },
        502,
      );
    }

    const files = (payload.result?.files ?? []).map((file) => {
      const filecode = file.file_code ?? '';
      return {
        filecode,
        title: file.title ?? filecode,
        durationSec: Number(file.length) || 0,
        uploaded: file.uploaded ?? '',
        singleImg: file.single_img ?? '',
        folderId: file.fld_id !== undefined ? String(file.fld_id) : undefined,
        embedUrl: filecode ? `https://dood.to/e/${filecode}` : '',
      };
    });

    return jsonResponse({ configured: true, files });
  } catch (err) {
    return jsonResponse(
      {
        configured: true,
        error:
          err instanceof Error
            ? err.message
            : 'Tidak dapat menghubungi server Doodstream.',
        files: [],
      },
      502,
    );
  }
}

async function handleDirectUpload(
  request: Request,
  env: DoodstreamEnv,
  fetchFn: FetchLike,
  maxUploadBytes: number,
  maxUploadLabel: string,
): Promise<Response> {
  const apiBase = resolveDoodApiBase(env);
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const parsedLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedLength) && parsedLength > maxUploadBytes) {
      return jsonResponse(
        {
          ok: false,
          code: 'FILE_TOO_LARGE_FOR_EDGE',
          error: `Ukuran video melebihi batas unggah langsung (${maxUploadLabel}). Gunakan tab Remote Upload (URL) atau Link Embed Doodstream untuk berkas besar.`,
        },
        413,
      );
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: 'Format unggahan multipart/form-data tidak valid.',
      },
      400,
    );
  }

  const videoEntry = formData.get('video');
  if (!videoEntry || typeof videoEntry === 'string' || videoEntry.size === 0) {
    return jsonResponse(
      {
        ok: false,
        error: 'Pilih berkas video terlebih dahulu sebelum mengunggah.',
      },
      400,
    );
  }

  if (videoEntry.size > maxUploadBytes) {
    return jsonResponse(
      {
        ok: false,
        code: 'FILE_TOO_LARGE_FOR_EDGE',
        error: `Ukuran video melebihi batas unggah langsung (${maxUploadLabel}). Gunakan tab Remote Upload (URL) atau Link Embed Doodstream untuk berkas besar.`,
      },
      413,
    );
  }

  const key = resolveDoodstreamKey(env);
  if (!key) {
    return jsonResponse(
      {
        ok: false,
        code: 'MISSING_DOODSTREAM_KEY',
        error:
          'Penyimpanan upload server belum dikonfigurasi. Tambahkan secret DOODSTREAM_API_KEY pada Secrets server untuk mengunggah berkas video.',
      },
      503,
    );
  }

  const titleField = formData.get('title');
  const seriesTitleField = formData.get('seriesTitle');
  const folderIdField = formData.get('folderId');

  const rawTitle = typeof titleField === 'string' ? titleField.trim() : '';
  const targetSeriesTitle =
    typeof seriesTitleField === 'string' ? seriesTitleField.trim() : '';
  const existingFolderId =
    typeof folderIdField === 'string' ? folderIdField.trim() : '';

  const originalFileName =
    'name' in videoEntry && typeof videoEntry.name === 'string' && videoEntry.name
      ? videoEntry.name
      : 'episode.mp4';

  try {
    // Step 0: Automatically ensure a Doodstream folder matching the film title
    let resolvedFolder: ResolvedFolder | null = null;
    if (existingFolderId || targetSeriesTitle) {
      resolvedFolder = await ensureDoodstreamFolder(
        key,
        targetSeriesTitle || 'LayarMini',
        existingFolderId,
        fetchFn,
        apiBase,
      );
    }

    // Step 1: Request active upload server from Doodstream
    const serverRes = await fetchFn(
      `${apiBase}/upload/server?key=${encodeURIComponent(key)}`,
      { headers: { Accept: 'application/json' } },
    );
    const serverJson = await parseDoodJson<{
      status?: number | string;
      msg?: string;
      result?: string;
    }>(serverRes, 'Gagal mendapatkan server unggah dari Doodstream');

    if (Number(serverJson.status) !== 200 || !serverJson.result) {
      return jsonResponse(
        {
          ok: false,
          error:
            serverJson.msg ||
            'Gagal mendapatkan server unggah dari Doodstream.',
        },
        502,
      );
    }

    // Step 2: Upload video via Web Standard FormData (no local disk required)
    const doodForm = new FormData();
    doodForm.append('api_key', key);
    if (resolvedFolder?.folderId) {
      doodForm.append('fld_id', resolvedFolder.folderId);
    }
    doodForm.append('file', videoEntry, originalFileName);

    const uploadUrl = buildDoodUploadUrl(serverJson.result, key);
    const doodRes = await fetchFn(uploadUrl, {
      method: 'POST',
      body: doodForm,
      headers: { Accept: 'application/json' },
    });
    const doodJson = await parseDoodJson<{
      status?: number | string;
      msg?: string;
      result?: Array<{
        filecode?: string;
        title?: string;
        length?: string | number;
        download_url?: string;
        protected_dl?: string;
        protected_embed?: string;
        single_img?: string;
        splash_img?: string;
      }>;
    }>(doodRes, 'Unggahan video ke Doodstream gagal diproses');

    const item = doodJson.result?.[0];
    if (Number(doodJson.status) !== 200 || !item?.filecode) {
      return jsonResponse(
        {
          ok: false,
          error:
            doodJson.msg || 'Unggahan video ke Doodstream gagal diproses.',
        },
        502,
      );
    }

    // Step 3: Best-effort move into the series folder on Doodstream
    if (resolvedFolder?.folderId) {
      try {
        await fetchFn(
          `${apiBase}/file/move?key=${encodeURIComponent(key)}&file_code=${encodeURIComponent(item.filecode)}&fld_id=${encodeURIComponent(resolvedFolder.folderId)}`,
          { headers: { Accept: 'application/json' } },
        );
      } catch {
        // Ignore best-effort move error if upload server already filed it
      }
    }

    // Step 4: Best-effort rename file title inside Doodstream if an explicit episode title was provided
    if (rawTitle) {
      try {
        await fetchFn(
          `${apiBase}/file/rename?key=${encodeURIComponent(key)}&file_code=${encodeURIComponent(item.filecode)}&title=${encodeURIComponent(rawTitle)}`,
          { headers: { Accept: 'application/json' } },
        );
      } catch {
        // Ignore best-effort rename errors
      }
    }

    return jsonResponse({
      ok: true,
      filecode: item.filecode,
      title: rawTitle || item.title || originalFileName,
      embedUrl: normalizeDoodReturnedUrl(
        item.protected_embed,
        'e',
        item.filecode,
      ),
      downloadUrl: normalizeDoodReturnedUrl(
        item.protected_dl || item.download_url,
        'd',
        item.filecode,
      ),
      splashImg: item.splash_img || '',
      singleImg: item.single_img || '',
      durationSec: Number(item.length) || undefined,
      folderId: resolvedFolder?.folderId,
      folderName: resolvedFolder?.folderName,
      folderCreated: resolvedFolder?.created ?? false,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Terjadi gangguan jaringan saat mengunggah ke Doodstream.',
      },
      502,
    );
  }
}

async function handleRemoteUpload(
  request: Request,
  env: DoodstreamEnv,
  fetchFn: FetchLike,
): Promise<Response> {
  const key = resolveDoodstreamKey(env);
  const apiBase = resolveDoodApiBase(env);
  const body = await readJsonBody<{
    url?: string;
    fld_id?: string;
    seriesTitle?: string;
  }>(request);

  if (!body) {
    return jsonResponse(
      { ok: false, error: 'Format body JSON tidak valid.' },
      400,
    );
  }

  const remoteUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!remoteUrl) {
    return jsonResponse(
      {
        ok: false,
        error: 'Masukkan URL video sumber untuk remote upload Doodstream.',
      },
      400,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return jsonResponse(
      { ok: false, error: 'Format URL video tidak valid.' },
      400,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonResponse(
      {
        ok: false,
        error: 'URL video harus menggunakan protokol http atau https.',
      },
      400,
    );
  }

  if (!key) {
    return jsonResponse(
      {
        ok: false,
        code: 'MISSING_DOODSTREAM_KEY',
        error:
          'Penyimpanan upload server belum dikonfigurasi. Tambahkan secret DOODSTREAM_API_KEY pada Secrets server untuk remote upload.',
      },
      503,
    );
  }

  try {
    let resolvedFolder: ResolvedFolder | null = null;
    const targetSeriesTitle =
      typeof body.seriesTitle === 'string' ? body.seriesTitle.trim() : '';
    const existingFolderId =
      typeof body.fld_id === 'string' ? body.fld_id.trim() : '';

    if (existingFolderId || targetSeriesTitle) {
      resolvedFolder = await ensureDoodstreamFolder(
        key,
        targetSeriesTitle || 'LayarMini',
        existingFolderId,
        fetchFn,
        apiBase,
      );
    }

    const params = new URLSearchParams({
      key,
      url: remoteUrl,
    });
    if (resolvedFolder?.folderId) {
      params.set('fld_id', resolvedFolder.folderId);
    }

    const remoteRes = await fetchFn(
      `${apiBase}/upload/url?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    );
    const remoteJson = await parseDoodJson<{
      status?: number | string;
      msg?: string;
      result?: {
        filecode?: string;
        url?: string;
      };
    }>(remoteRes, 'Permintaan remote upload ke Doodstream ditolak');

    const filecode = remoteJson.result?.filecode;
    if (Number(remoteJson.status) !== 200 || !filecode) {
      return jsonResponse(
        {
          ok: false,
          error:
            remoteJson.msg ||
            'Permintaan remote upload ke Doodstream ditolak.',
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      filecode,
      embedUrl: `https://dood.to/e/${filecode}`,
      sourceUrl: remoteJson.result?.url || remoteUrl,
      folderId: resolvedFolder?.folderId,
      folderName: resolvedFolder?.folderName,
      folderCreated: resolvedFolder?.created ?? false,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal menghubungi API remote upload Doodstream.',
      },
      502,
    );
  }
}

export async function handleDoodstreamApiRequest(
  request: Request,
  env: DoodstreamEnv,
  options: FetchLike | DoodstreamHandlerOptions = {},
): Promise<Response> {
  const resolvedOptions: DoodstreamHandlerOptions =
    typeof options === 'function' ? { fetchFn: options } : options;
  const fetchFn = resolvedOptions.fetchFn ?? fetch;
  const maxUploadBytes =
    resolvedOptions.maxUploadBytes ?? MAX_CLOUDFLARE_UPLOAD_BYTES;
  const maxUploadLabel =
    resolvedOptions.maxUploadLabel ?? 'maks. 95 MB di Cloudflare';

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (pathname === '/api/doodstream/status') {
    if (method !== 'GET') {
      return jsonResponse(
        { ok: false, error: 'Metode HTTP tidak didukung.' },
        405,
      );
    }
    return handleStatus(env);
  }

  if (pathname === '/api/doodstream/folders/ensure') {
    if (method !== 'POST') {
      return jsonResponse(
        { ok: false, error: 'Metode HTTP tidak didukung.' },
        405,
      );
    }
    return handleFoldersEnsure(request, env, fetchFn);
  }

  if (pathname === '/api/doodstream/files') {
    if (method !== 'GET') {
      return jsonResponse(
        { ok: false, error: 'Metode HTTP tidak didukung.' },
        405,
      );
    }
    return handleFilesList(url, env, fetchFn);
  }

  if (pathname === '/api/doodstream/upload') {
    if (method !== 'POST') {
      return jsonResponse(
        { ok: false, error: 'Metode HTTP tidak didukung.' },
        405,
      );
    }
    return handleDirectUpload(
      request,
      env,
      fetchFn,
      maxUploadBytes,
      maxUploadLabel,
    );
  }

  if (pathname === '/api/doodstream/remote-upload') {
    if (method !== 'POST') {
      return jsonResponse(
        { ok: false, error: 'Metode HTTP tidak didukung.' },
        405,
      );
    }
    return handleRemoteUpload(request, env, fetchFn);
  }

  return jsonResponse(
    { ok: false, error: 'Endpoint API tidak ditemukan.' },
    404,
  );
}
