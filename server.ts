import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import { openAsBlob } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';

const PORT = Number(process.env.PORT || 3000);
const DOODAPI_BASE = 'https://doodapi.co/api';

const uploadDir = path.join(os.tmpdir(), 'layarmini-doodstream-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB per episode video upload
  },
});

function getDoodstreamKey(): string | null {
  const key = process.env.DOODSTREAM_API_KEY?.trim();
  if (!key || key === 'MY_DOODSTREAM_API_KEY') {
    return null;
  }
  return key;
}

function sanitizeFolderTitle(title: string): string {
  const cleaned = title
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'LayarMini';
}

async function ensureDoodstreamFolder(
  key: string,
  rawFolderName: string,
  existingFolderId?: string,
): Promise<{ folderId: string; folderName: string; created: boolean }> {
  const cleanName = sanitizeFolderTitle(rawFolderName);
  const trimmedExisting = existingFolderId?.trim();
  if (trimmedExisting) {
    return {
      folderId: trimmedExisting,
      folderName: cleanName,
      created: false,
    };
  }

  // Check if a folder with the exact title already exists on Doodstream root
  try {
    const listRes = await fetch(
      `${DOODAPI_BASE}/folder/list?key=${encodeURIComponent(key)}&fld_id=0&only_folders=1`,
    );
    const listJson = (await listRes.json()) as {
      status?: number;
      result?: {
        folders?: Array<{
          fld_id?: string | number;
          name?: string;
        }>;
      };
    };

    if (listJson.status === 200 && Array.isArray(listJson.result?.folders)) {
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
    // Proceed to create folder if listing fails
  }

  const createRes = await fetch(
    `${DOODAPI_BASE}/folder/create?key=${encodeURIComponent(key)}&name=${encodeURIComponent(cleanName)}`,
  );
  const createJson = (await createRes.json()) as {
    status?: number;
    msg?: string;
    result?: {
      fld_id?: string | number;
    };
  };

  if (createJson.status !== 200 || !createJson.result?.fld_id) {
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/doodstream/status', (_req: Request, res: Response) => {
    const key = getDoodstreamKey();
    res.json({
      configured: Boolean(key),
      provider: 'Doodstream',
    });
  });

  app.post(
    '/api/doodstream/folders/ensure',
    async (req: Request, res: Response) => {
      const key = getDoodstreamKey();
      const body = req.body as { folderName?: string; folderId?: string };
      const folderName =
        typeof body?.folderName === 'string' ? body.folderName.trim() : '';

      if (!folderName) {
        res.status(400).json({
          ok: false,
          error: 'Nama folder (judul film) wajib diisi.',
        });
        return;
      }

      if (!key) {
        res.status(503).json({
          ok: false,
          code: 'MISSING_DOODSTREAM_KEY',
          error:
            'Kunci Doodstream belum dikonfigurasi pada environment server.',
        });
        return;
      }

      try {
        const folder = await ensureDoodstreamFolder(
          key,
          folderName,
          body.folderId,
        );
        res.json({ ok: true, ...folder });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Gagal menyiapkan folder Doodstream.',
        });
      }
    },
  );

  app.get('/api/doodstream/files', async (req: Request, res: Response) => {
    const key = getDoodstreamKey();
    if (!key) {
      res.json({ configured: false, files: [] });
      return;
    }

    const fldId =
      typeof req.query.fld_id === 'string' ? req.query.fld_id.trim() : '';

    try {
      const params = new URLSearchParams({
        key,
        per_page: '50',
      });
      if (fldId) {
        params.set('fld_id', fldId);
      }

      const response = await fetch(
        `${DOODAPI_BASE}/file/list?${params.toString()}`,
      );
      const payload = (await response.json()) as {
        status?: number;
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
      };

      if (payload.status !== 200) {
        res.status(502).json({
          configured: true,
          error: payload.msg || 'Gagal mengambil daftar video Doodstream.',
          files: [],
        });
        return;
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

      res.json({ configured: true, files });
    } catch {
      res.status(502).json({
        configured: true,
        error: 'Tidak dapat menghubungi server Doodstream.',
        files: [],
      });
    }
  });

  app.post(
    '/api/doodstream/upload',
    upload.single('video'),
    async (req: Request, res: Response) => {
      const key = getDoodstreamKey();
      const uploadedFile = req.file;
      const body = req.body as {
        title?: string;
        seriesTitle?: string;
        folderId?: string;
      };

      if (!uploadedFile) {
        res.status(400).json({
          ok: false,
          error: 'Pilih berkas video terlebih dahulu sebelum mengunggah.',
        });
        return;
      }

      try {
        if (!key) {
          res.status(503).json({
            ok: false,
            code: 'MISSING_DOODSTREAM_KEY',
            error:
              'Penyimpanan upload server belum dikonfigurasi. Tambahkan kunci Doodstream di panel Secrets untuk mengunggah berkas video.',
          });
          return;
        }

        // Step 0: Automatically ensure a Doodstream folder with the same film title
        let resolvedFolder: {
          folderId: string;
          folderName: string;
          created: boolean;
        } | null = null;

        const targetSeriesTitle =
          typeof body?.seriesTitle === 'string' ? body.seriesTitle.trim() : '';
        const existingFolderId =
          typeof body?.folderId === 'string' ? body.folderId.trim() : '';

        if (existingFolderId || targetSeriesTitle) {
          resolvedFolder = await ensureDoodstreamFolder(
            key,
            targetSeriesTitle || 'LayarMini',
            existingFolderId,
          );
        }

        // Step 1: Request active upload server from Doodstream
        const serverRes = await fetch(
          `${DOODAPI_BASE}/upload/server?key=${encodeURIComponent(key)}`,
        );
        const serverJson = (await serverRes.json()) as {
          status?: number;
          msg?: string;
          result?: string;
        };

        if (serverJson.status !== 200 || !serverJson.result) {
          res.status(502).json({
            ok: false,
            error:
              serverJson.msg ||
              'Gagal mendapatkan server unggah dari Doodstream.',
          });
          return;
        }

        // Step 2: Upload video file via multipart/form-data to Doodstream upload server
        const blob = await openAsBlob(uploadedFile.path, {
          type: uploadedFile.mimetype || 'video/mp4',
        });
        const formData = new FormData();
        formData.append('api_key', key);
        if (resolvedFolder?.folderId) {
          formData.append('fld_id', resolvedFolder.folderId);
        }
        formData.append(
          'file',
          blob,
          uploadedFile.originalname || 'episode.mp4',
        );

        const uploadUrl = `${serverJson.result}?key=${encodeURIComponent(key)}`;
        const doodRes = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });
        const doodJson = (await doodRes.json()) as {
          status?: number;
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
        };

        const item = doodJson.result?.[0];
        if (doodJson.status !== 200 || !item?.filecode) {
          res.status(502).json({
            ok: false,
            error:
              doodJson.msg || 'Unggahan video ke Doodstream gagal diproses.',
          });
          return;
        }

        // Step 3: Ensure file is placed into the series folder on Doodstream
        if (resolvedFolder?.folderId) {
          try {
            await fetch(
              `${DOODAPI_BASE}/file/move?key=${encodeURIComponent(key)}&file_code=${encodeURIComponent(item.filecode)}&fld_id=${encodeURIComponent(resolvedFolder.folderId)}`,
            );
          } catch {
            // Best-effort folder move if upload server ignored fld_id
          }
        }

        res.json({
          ok: true,
          filecode: item.filecode,
          title: item.title || body?.title || uploadedFile.originalname,
          embedUrl:
            item.protected_embed || `https://dood.to/e/${item.filecode}`,
          downloadUrl:
            item.protected_dl ||
            item.download_url ||
            `https://dood.to/d/${item.filecode}`,
          splashImg: item.splash_img || '',
          singleImg: item.single_img || '',
          durationSec: Number(item.length) || undefined,
          folderId: resolvedFolder?.folderId,
          folderName: resolvedFolder?.folderName,
          folderCreated: resolvedFolder?.created ?? false,
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Terjadi gangguan jaringan saat mengunggah ke Doodstream.',
        });
      } finally {
        fs.promises.unlink(uploadedFile.path).catch(() => {});
      }
    },
  );

  app.post(
    '/api/doodstream/remote-upload',
    async (req: Request, res: Response) => {
      const key = getDoodstreamKey();
      const body = req.body as {
        url?: string;
        fld_id?: string;
        seriesTitle?: string;
      };
      const remoteUrl = typeof body?.url === 'string' ? body.url.trim() : '';

      if (!remoteUrl) {
        res.status(400).json({
          ok: false,
          error: 'Masukkan URL video sumber untuk remote upload Doodstream.',
        });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(remoteUrl);
      } catch {
        res.status(400).json({
          ok: false,
          error: 'Format URL video tidak valid.',
        });
        return;
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({
          ok: false,
          error: 'URL video harus menggunakan protokol http atau https.',
        });
        return;
      }

      if (!key) {
        res.status(503).json({
          ok: false,
          code: 'MISSING_DOODSTREAM_KEY',
          error:
            'Penyimpanan upload server belum dikonfigurasi. Tambahkan kunci Doodstream di panel Secrets untuk remote upload.',
        });
        return;
      }

      try {
        let resolvedFolder: {
          folderId: string;
          folderName: string;
          created: boolean;
        } | null = null;

        const targetSeriesTitle =
          typeof body?.seriesTitle === 'string' ? body.seriesTitle.trim() : '';
        const existingFolderId =
          typeof body?.fld_id === 'string' ? body.fld_id.trim() : '';

        if (existingFolderId || targetSeriesTitle) {
          resolvedFolder = await ensureDoodstreamFolder(
            key,
            targetSeriesTitle || 'LayarMini',
            existingFolderId,
          );
        }

        const params = new URLSearchParams({
          key,
          url: remoteUrl,
        });
        if (resolvedFolder?.folderId) {
          params.set('fld_id', resolvedFolder.folderId);
        }

        const remoteRes = await fetch(
          `${DOODAPI_BASE}/upload/url?${params.toString()}`,
        );
        const remoteJson = (await remoteRes.json()) as {
          status?: number;
          msg?: string;
          result?: {
            filecode?: string;
            url?: string;
          };
        };

        const filecode = remoteJson.result?.filecode;
        if (remoteJson.status !== 200 || !filecode) {
          res.status(502).json({
            ok: false,
            error:
              remoteJson.msg ||
              'Permintaan remote upload ke Doodstream ditolak.',
          });
          return;
        }

        res.json({
          ok: true,
          filecode,
          embedUrl: `https://dood.to/e/${filecode}`,
          sourceUrl: remoteJson.result?.url || remoteUrl,
          folderId: resolvedFolder?.folderId,
          folderName: resolvedFolder?.folderName,
          folderCreated: resolvedFolder?.created ?? false,
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Gagal menghubungi API remote upload Doodstream.',
        });
      }
    },
  );

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LayarMini server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LayarMini server:', err);
  process.exit(1);
});
