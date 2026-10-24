/* Mujic API routing. All app API calls use the Cloudflare Worker origin. */
(() => {
  const PRIMARY = 'https://mujic.calverse.online';
  const origins = () => [PRIMARY];
  const isBackendOrigin = origin => origin === PRIMARY;

  async function fetchWithWorker(path, init = {}, options = {}) {
    const input = typeof Request !== 'undefined' && path instanceof Request ? path.url : String(path || '/');
    const parsed = new URL(input, PRIMARY);
    const route = parsed.pathname + parsed.search + parsed.hash;
    const timeoutMs = Math.max(500, Number(options.timeoutMs) || 10000);
    const suppliedSignal = init?.signal;
    if (suppliedSignal?.aborted) throw suppliedSignal.reason || new DOMException('Aborted', 'AbortError');

    const controller = new AbortController();
    let timedOut = false;
    const relay = () => controller.abort(suppliedSignal?.reason);
    suppliedSignal?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetch(PRIMARY + route, {
        ...init,
        credentials: 'omit',
        signal: controller.signal
      });
      // Do not silently send a request to a second host. The caller can decide how to
      // present a Worker-side service error, preserving the single-origin contract.
      return response;
    } catch (error) {
      if (suppliedSignal?.aborted) throw suppliedSignal.reason || error;
      if (timedOut) throw new Error(`Cloudflare Worker request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
      suppliedSignal?.removeEventListener('abort', relay);
    }
  }

  window.MujicBackend = Object.freeze({
    PRIMARY,
    WORKER: PRIMARY,
    origins,
    isBackendOrigin,
    fetchWithWorker
  });
})();
