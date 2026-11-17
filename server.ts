import 'dotenv/config';
import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { handleDoodstreamApiRequest } from './cloudflare/doodstreamHandler';

const PORT = Number(process.env.PORT || 3000);
const NODE_MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB when running on Node.js

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function toWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
  };

  if (hasBody) {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(fullUrl, init);
}

async function sendWebResponse(
  webRes: Response,
  res: ExpressResponse,
): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });
  const arrayBuffer = await webRes.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
}

async function startServer() {
  const app = express();

  // Route all /api/doodstream/* requests through the exact same Web-Standard
  // handler deployed on Cloudflare Workers (cloudflare/doodstreamHandler.ts).
  app.all('/api/doodstream/*', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const webReq = toWebRequest(req);
      const webRes = await handleDoodstreamApiRequest(
        webReq,
        {
          DOODSTREAM_API_KEY: process.env.DOODSTREAM_API_KEY,
          DOODSTREAM_API_BASE: process.env.DOODSTREAM_API_BASE,
        },
        {
          maxUploadBytes: NODE_MAX_UPLOAD_BYTES,
          maxUploadLabel: 'maks. 250 MB',
        },
      );
      await sendWebResponse(webRes, res);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan internal saat memproses permintaan Doodstream.',
      });
    }
  });

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
    app.get('*', (_req: ExpressRequest, res: ExpressResponse) => {
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
