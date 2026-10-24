/* Mujic backend routing. Keep this as a plain script (no modules).
 * Every network request (catalogue, recommendations, lyrics, media) goes to ONE origin: the
 * Cloudflare Worker. The Worker owns edge caching, so the browser never talks to upstream APIs. */
(() => {
  const PRIMARY = 'https://mujic.calverse.online';
  const RETRYABLE = status => status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530);
  const origins = () => [PRIMARY];
  const isBackendOrigin = origin => origin === PRIMARY;

  // Identical in-flight GETs share one network request (typing, repeated taps, parallel shelves).
  const inflight = new Map();

  async function attempt(url, init, timeoutMs) {
    const supplied = init?.signal;
    if (supplied?.aborted) throw supplied.reason || new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    let timedOut = false;
    const relay = () => controller.abort(supplied?.reason);
    supplied?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (supplied?.aborted) throw supplied.reason || error;
      throw timedOut ? new Error(`Backend request timed out after ${timeoutMs}ms`) : error;
    } finally {
      clearTimeout(timer);
      supplied?.removeEventListener('abort', relay);
    }
  }

  /** fetchWithFallback kept as the public name so existing callers keep working; there is no
   *  second origin any more, only a single quick retry on network failure / gateway errors. */
  async function fetchWithFallback(path, init = {}, options = {}) {
    const input = typeof path === 'string' ? path : (path && path.url) || String(path);
    const parsed = new URL(input, PRIMARY);
    const route = parsed.pathname + parsed.search;
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || 10000);
    const method = String(init?.method || 'GET').toUpperCase();
    const run = async () => {
      let lastError;
      for (let i = 0; i < 2; i++) {
        try {
          const response = await attempt(PRIMARY + route, init, i === 0 ? timeoutMs : Math.max(timeoutMs, 12000));
          if (RETRYABLE(response.status) && i === 0) { lastError = new Error(`Backend HTTP ${response.status}`); continue; }
          return response;
        } catch (error) {
          if (init?.signal?.aborted) throw error;
          lastError = error;
        }
      }
      throw lastError || new Error('Mujic backend unavailable');
    };
    const shareable = method === 'GET' && !init?.headers?.Range && !init?.signal && !options.noCoalesce;
    if (!shareable) return run();
    const key = route;
    if (!inflight.has(key)) inflight.set(key, run().finally(() => inflight.delete(key)));
    return (await inflight.get(key)).clone();
  }
  window.MujicBackend = Object.freeze({ PRIMARY, origins, isBackendOrigin, fetchWithFallback });
})();
