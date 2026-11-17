import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDoodUploadUrl,
  handleDoodstreamApiRequest,
  MAX_CLOUDFLARE_UPLOAD_BYTES,
  normalizeDoodReturnedUrl,
  resolveDoodstreamKey,
  type FetchLike,
} from './doodstreamHandler';
import {
  handlePagesApiRequest,
  onRequest,
} from '../functions/api/[[path]]';

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('resolveDoodstreamKey rejects missing, blank, and placeholder keys', () => {
  assert.equal(resolveDoodstreamKey({}), null);
  assert.equal(resolveDoodstreamKey({ DOODSTREAM_API_KEY: '   ' }), null);
  assert.equal(
    resolveDoodstreamKey({ DOODSTREAM_API_KEY: 'MY_DOODSTREAM_API_KEY' }),
    null,
  );
  assert.equal(
    resolveDoodstreamKey({ DOODSTREAM_API_KEY: '  secret-key-123  ' }),
    'secret-key-123',
  );
  assert.equal(
    resolveDoodstreamKey({ DOODSTREAM_API_KEY: '"secret-key-123"' }),
    'secret-key-123',
  );
  assert.equal(
    resolveDoodstreamKey({ DOODSTREAM_API_KEY: '"MY_DOODSTREAM_API_KEY"' }),
    null,
  );
});

test('GET /api/doodstream/status reflects secret configuration state', async () => {
  const unconfigured = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/status'),
    {},
  );
  assert.equal(unconfigured.status, 200);
  assert.deepEqual(await unconfigured.json(), {
    configured: false,
    provider: 'Doodstream',
  });

  const configured = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/status'),
    { DOODSTREAM_API_KEY: 'live-key' },
  );
  assert.equal(configured.status, 200);
  assert.deepEqual(await configured.json(), {
    configured: true,
    provider: 'Doodstream',
  });
});

test('POST /api/doodstream/folders/ensure reuses existing folder or creates new folder', async () => {
  const calls: string[] = [];
  const mockFetchExisting: FetchLike = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/folder/list')) {
      return jsonRes({
        status: 200,
        result: {
          folders: [{ fld_id: 901, name: 'Senja di Sudirman' }],
        },
      });
    }
    return jsonRes({ status: 500 });
  };

  const reuseRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/folders/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName: 'senja di sudirman' }),
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
    mockFetchExisting,
  );
  assert.equal(reuseRes.status, 200);
  assert.deepEqual(await reuseRes.json(), {
    ok: true,
    folderId: '901',
    folderName: 'Senja di Sudirman',
    created: false,
  });
  assert.equal(calls.length, 1);

  const mockFetchCreate: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/folder/list')) {
      return jsonRes({ status: 200, result: { folders: [] } });
    }
    if (url.includes('/folder/create')) {
      return jsonRes({ status: 200, result: { fld_id: 902 } });
    }
    return jsonRes({ status: 500 });
  };

  const createRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/folders/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName: 'Drama Baru / 2026' }),
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
    mockFetchCreate,
  );
  assert.equal(createRes.status, 200);
  assert.deepEqual(await createRes.json(), {
    ok: true,
    folderId: '902',
    folderName: 'Drama Baru - 2026',
    created: true,
  });
});

test('GET /api/doodstream/files handles unconfigured state and scoped folder listing', async () => {
  const noKey = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/files'),
    {},
  );
  assert.equal(noKey.status, 200);
  assert.deepEqual(await noKey.json(), { configured: false, files: [] });

  let requestedUrl = '';
  const mockFetch: FetchLike = async (input) => {
    requestedUrl = String(input);
    return jsonRes({
      status: 200,
      result: {
        files: [
          {
            file_code: 'abc123xyz',
            title: 'Ep 1',
            length: '32',
            uploaded: '2026-11-17',
            single_img: 'https://img.example/1.jpg',
            fld_id: 77,
          },
        ],
      },
    });
  };

  const listRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/files?fld_id=77&page=2'),
    { DOODSTREAM_API_KEY: 'live-key' },
    mockFetch,
  );
  assert.equal(listRes.status, 200);
  assert.ok(requestedUrl.includes('fld_id=77'));
  assert.ok(requestedUrl.includes('per_page=100'));
  assert.ok(requestedUrl.includes('page=2'));
  const body = (await listRes.json()) as {
    configured: boolean;
    files: Array<{ filecode: string; embedUrl: string; durationSec: number }>;
  };
  assert.equal(body.configured, true);
  assert.equal(body.files[0].filecode, 'abc123xyz');
  assert.equal(body.files[0].embedUrl, 'https://dood.to/e/abc123xyz');
  assert.equal(body.files[0].durationSec, 32);
});

test('POST /api/doodstream/upload validates missing file, size guard, and completes Web FormData upload', async () => {
  // Reject oversized content-length before buffering body in edge memory
  const tooLarge = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/upload', {
      method: 'POST',
      headers: {
        'Content-Length': String(MAX_CLOUDFLARE_UPLOAD_BYTES + 1024),
      },
      body: 'stub',
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
  );
  assert.equal(tooLarge.status, 413);
  const tooLargeJson = (await tooLarge.json()) as { code?: string };
  assert.equal(tooLargeJson.code, 'FILE_TOO_LARGE_FOR_EDGE');

  // Missing video entry
  const emptyForm = new FormData();
  const missingFileRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/upload', {
      method: 'POST',
      body: emptyForm,
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
  );
  assert.equal(missingFileRes.status, 400);

  // Successful multipart upload + folder creation + best-effort move
  const fetchedUrls: string[] = [];
  const mockFetch: FetchLike = async (input, init) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url.includes('/folder/list')) {
      return jsonRes({ status: 200, result: { folders: [] } });
    }
    if (url.includes('/folder/create')) {
      return jsonRes({ status: 200, result: { fld_id: 555 } });
    }
    if (url.includes('/upload/server')) {
      return jsonRes({
        status: 200,
        result: 'https://upload-node.dood.example/upload/01',
      });
    }
    if (url.startsWith('https://upload-node.dood.example/upload/01')) {
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
      return jsonRes({
        status: 200,
        result: [
          {
            filecode: 'dood987654',
            title: 'Ep 1 Pertemuan',
            length: '28',
            protected_embed: 'https://dood.to/e/dood987654',
            protected_dl: 'https://dood.to/d/dood987654',
          },
        ],
      });
    }
    if (url.includes('/file/move')) {
      return jsonRes({ status: 200, msg: 'OK' });
    }
    return jsonRes({ status: 500 });
  };

  const uploadForm = new FormData();
  uploadForm.append(
    'video',
    new File([new Uint8Array([0, 1, 2, 3])], 'ep1.mp4', { type: 'video/mp4' }),
  );
  uploadForm.append('title', 'Ep 1 Pertemuan');
  uploadForm.append('seriesTitle', 'Senja di Sudirman');

  const uploadRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/upload', {
      method: 'POST',
      body: uploadForm,
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
    mockFetch,
  );
  assert.equal(uploadRes.status, 200);
  const uploadJson = (await uploadRes.json()) as {
    ok: boolean;
    filecode: string;
    embedUrl: string;
    folderId: string;
    folderCreated: boolean;
    durationSec: number;
  };
  assert.equal(uploadJson.ok, true);
  assert.equal(uploadJson.filecode, 'dood987654');
  assert.equal(uploadJson.embedUrl, 'https://dood.to/e/dood987654');
  assert.equal(uploadJson.folderId, '555');
  assert.equal(uploadJson.folderCreated, true);
  assert.equal(uploadJson.durationSec, 28);
  assert.ok(fetchedUrls.some((u) => u.includes('/file/move')));
});

test('POST /api/doodstream/remote-upload validates URL protocol and queues remote upload', async () => {
  const badProto = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/remote-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'ftp://example.com/video.mp4' }),
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
  );
  assert.equal(badProto.status, 400);

  const mockFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('/upload/url')) {
      return jsonRes({
        status: 200,
        result: {
          filecode: 'rem123456',
          url: 'https://cdn.example.com/ep2.mp4',
        },
      });
    }
    return jsonRes({ status: 500 });
  };

  const okRes = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/remote-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://cdn.example.com/ep2.mp4',
        fld_id: '555',
        seriesTitle: 'Senja di Sudirman',
      }),
    }),
    { DOODSTREAM_API_KEY: 'live-key' },
    mockFetch,
  );
  assert.equal(okRes.status, 200);
  const okJson = (await okRes.json()) as {
    ok: boolean;
    filecode: string;
    embedUrl: string;
    folderId: string;
  };
  assert.equal(okJson.ok, true);
  assert.equal(okJson.filecode, 'rem123456');
  assert.equal(okJson.embedUrl, 'https://dood.to/e/rem123456');
  assert.equal(okJson.folderId, '555');
});

test('Cloudflare Pages Function onRequest handles /api/doodstream/*, 404, and 405 cleanly', async () => {
  const baseCtx = {
    env: { DOODSTREAM_API_KEY: 'live-key' },
    params: { path: ['doodstream', 'status'] },
    waitUntil: () => {},
    next: async () => new Response('not used', { status: 404 }),
  };

  const apiRes = await onRequest({
    ...baseCtx,
    request: new Request('https://layarmini.pages.dev/api/doodstream/status'),
  });
  assert.equal(apiRes.status, 200);
  assert.deepEqual(await apiRes.json(), {
    configured: true,
    provider: 'Doodstream',
  });

  const missingApiRes = await handlePagesApiRequest({
    request: new Request('https://layarmini.pages.dev/api/unknown-route'),
    env: { DOODSTREAM_API_KEY: 'live-key' },
  });
  assert.equal(missingApiRes.status, 404);

  const methodNotAllowed = await handlePagesApiRequest({
    request: new Request('https://layarmini.pages.dev/api/doodstream/status', {
      method: 'DELETE',
    }),
    env: { DOODSTREAM_API_KEY: 'live-key' },
  });
  assert.equal(methodNotAllowed.status, 405);
});

test('buildDoodUploadUrl and normalizeDoodReturnedUrl handle query params and relative paths safely', () => {
  assert.equal(
    buildDoodUploadUrl('https://s1.dood.to/upload/01', 'abc'),
    'https://s1.dood.to/upload/01?key=abc',
  );
  assert.equal(
    buildDoodUploadUrl('https://s1.dood.to/upload/01?123456', 'abc'),
    'https://s1.dood.to/upload/01?123456&key=abc',
  );
  assert.equal(
    normalizeDoodReturnedUrl('/e/xyz987', 'e', 'xyz987'),
    'https://dood.to/e/xyz987',
  );
  assert.equal(
    normalizeDoodReturnedUrl('//dood.ws/e/xyz987', 'e', 'xyz987'),
    'https://dood.ws/e/xyz987',
  );
  assert.equal(
    normalizeDoodReturnedUrl('https://dood.ws/d/xyz987', 'd', 'xyz987'),
    'https://dood.ws/d/xyz987',
  );
  assert.equal(
    normalizeDoodReturnedUrl(
      'https://dsvplay.com/e/1o97l8m7wba0',
      'e',
      '1o97l8m7wba0',
    ),
    'https://dood.to/e/1o97l8m7wba0',
  );
  assert.equal(
    normalizeDoodReturnedUrl(
      'https://dsvplay.com/e/nenr791c5jvcimv45g5wm3fibdi2zsbo',
      'e',
      '1o97l8m7wba0',
    ),
    'https://dood.to/e/nenr791c5jvcimv45g5wm3fibdi2zsbo',
  );
  assert.equal(
    normalizeDoodReturnedUrl('', 'e', 'xyz987'),
    'https://dood.to/e/xyz987',
  );
});

test('non-JSON HTML upstream responses return clean 502 Indonesian errors without crashing', async () => {
  const htmlFetch: FetchLike = async () =>
    new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });

  const res = await handleDoodstreamApiRequest(
    new Request('https://layarmini.workers.dev/api/doodstream/files'),
    { DOODSTREAM_API_KEY: 'live-key' },
    htmlFetch,
  );
  assert.equal(res.status, 502);
  const body = (await res.json()) as { error?: string };
  assert.ok(body.error?.includes('respons non-JSON'));
});

