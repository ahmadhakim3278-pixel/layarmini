import {
  handleDoodstreamApiRequest,
  type DoodstreamEnv,
  type FetchLike,
} from '../../cloudflare/doodstreamHandler';

export interface PagesFunctionContext<Env = DoodstreamEnv> {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
}

export async function handlePagesApiRequest(
  context: Pick<PagesFunctionContext<DoodstreamEnv>, 'request' | 'env'>,
  fetchFn: FetchLike = fetch,
): Promise<Response> {
  return handleDoodstreamApiRequest(context.request, context.env, { fetchFn });
}

export async function onRequest(
  context: PagesFunctionContext<DoodstreamEnv>,
): Promise<Response> {
  return handlePagesApiRequest(context);
}
