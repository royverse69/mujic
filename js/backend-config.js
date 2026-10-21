/* Mujic backend routing. Keep this as a plain script (no modules). */
(() => {
  const PRIMARY = 'https://mujic.calverse.online';
  const FALLBACK = 'https://gaana-suno-varna-machhar-aajayega.onrender.com';
  const FAILURE_TTL_MS = 3 * 60 * 1000;
  const RETRYABLE = status => status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530);
  let primaryUnhealthyUntil = 0;
  const origins = () => [PRIMARY, FALLBACK];
  const isBackendOrigin = origin => origin === PRIMARY || origin === FALLBACK;
  async function fetchWithFallback(path, init = {}, options = {}) {
    const input = path instanceof Request ? path.url : String(path);
    const parsed = new URL(input, PRIMARY);
    const route = parsed.pathname + parsed.search + parsed.hash;
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || 10000);
    const now = Date.now();
    const first = now < primaryUnhealthyUntil ? FALLBACK : PRIMARY;
    const second = first === PRIMARY ? FALLBACK : PRIMARY;
    const suppliedSignal = init?.signal;
    let lastError;
    for (let index = 0; index < 2; index++) {
      const origin = index === 0 ? first : second;
      if (suppliedSignal?.aborted) throw suppliedSignal.reason || new DOMException('Aborted', 'AbortError');
      const legTimeout = index === 1 ? Math.max(timeoutMs, 20000) : timeoutMs;
      const controller = new AbortController();
      let timedOut = false;
      const relay = () => controller.abort(suppliedSignal?.reason);
      suppliedSignal?.addEventListener('abort', relay, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, legTimeout);
      try {
        const response = await fetch(origin + route, { ...init, signal: controller.signal });
        if (index === 0 && origin === PRIMARY && (response.status === 502 || response.status === 503 || response.status === 504 || (response.status >= 520 && response.status <= 530))) {
          primaryUnhealthyUntil = Date.now() + FAILURE_TTL_MS;
          if (index === 0) { lastError = new Error(`Backend HTTP ${response.status}`); continue; }
        }
        if (response.status >= 200 && response.status <= 399 || (response.status >= 400 && response.status <= 499) || !RETRYABLE(response.status)) return response;
        lastError = new Error(`Backend HTTP ${response.status}`);
        if (origin === PRIMARY) primaryUnhealthyUntil = Date.now() + FAILURE_TTL_MS;
      } catch (error) {
        if (suppliedSignal?.aborted) throw suppliedSignal.reason || error;
        lastError = timedOut ? new Error(`Backend request timed out after ${legTimeout}ms`) : error;
        if (origin === PRIMARY) primaryUnhealthyUntil = Date.now() + FAILURE_TTL_MS;
      } finally {
        clearTimeout(timer);
        suppliedSignal?.removeEventListener('abort', relay);
      }
    }
    throw lastError || new Error('Both Mujic backends failed');
  }
  window.MujicBackend = Object.freeze({ PRIMARY, FALLBACK, origins, isBackendOrigin, fetchWithFallback });
})();
