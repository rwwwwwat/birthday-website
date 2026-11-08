export function wishesEndpoint(baseUrl) {
  if (!baseUrl?.trim()) throw new Error('API address missing');
  const base = new URL(baseUrl.trim());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid API address');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !loopback) throw new Error('HTTPS required');
  base.pathname = base.pathname.replace(/\/+$/, '') + '/';
  return new URL('api/wishes', base).href;
}
export function validReceipt(value) {
  return !!value && Number.isSafeInteger(value.wishId) && value.wishId > 0
    && typeof value.createdAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|\+00:00)$/.test(value.createdAt)
    && Number.isFinite(Date.parse(value.createdAt))
    && value.isRead === false && typeof value.source === 'string'
    && value.source.length > 0 && value.source.length <= 100;
}
export function unknownResult(reason = 'network') {
  return { status: 'unknown', reason, canRetry: false, requiresConfirmation: true,
    message: '提交结果暂时无法确认，数据库可能已经保存。请不要立即重复提交，联系站点所有者核实。' };
}
export function retryTime(header, now) {
  if (!header) return now + 60000;
  const seconds = /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
  const requested = seconds === null ? Date.parse(header) : now + seconds * 1000;
  return Number.isFinite(requested) ? Math.max(now + 1000, Math.min(now + 3600000, requested)) : now + 60000;
}
export function createWishesApi({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 15000, now = Date.now }) {
  let endpoint;
  try { endpoint = wishesEndpoint(baseUrl); } catch { /* No request if configuration is missing. */ }
  return {
    configured: !!endpoint,
    async submit(content) {
      if (!endpoint) return { status: 'error', reason: 'configuration', canRetry: true, requiresConfirmation: false,
        message: '投递地址尚未配置。本次没有发送，心愿已保留。' };
      const controller = new AbortController();
      let timer;
      const operation = async () => {
        const response = await fetchImpl(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ content }), signal: controller.signal,
          credentials: 'same-origin', mode: 'cors', redirect: 'error', cache: 'no-store',
        });
        if (response.status === 201) {
          let receipt;
          try { receipt = await response.json(); } catch { return unknownResult('invalid-receipt'); }
          if (!validReceipt(receipt)) return unknownResult('invalid-receipt');
          return { status: 'success', httpStatus: 201, receipt: {
            wishId: receipt.wishId, createdAt: receipt.createdAt, isRead: receipt.isRead, source: receipt.source,
          }, canRetry: false, requiresConfirmation: false };
        }
        // Parse problem responses, but never echo raw server messages or SQL details.
        await response.json().catch(() => null);
        if (response.status === 429) return { status: 'error', reason: 'rate-limit', httpStatus: 429,
          canRetry: true, requiresConfirmation: false, retryAt: retryTime(response.headers.get('Retry-After'), now()),
          message: '请求太频繁，请等待倒计时结束后手动重试。草稿已保留。' };
        if (response.status === 503) return { status: 'error', reason: 'unavailable', httpStatus: 503,
          canRetry: false, requiresConfirmation: true,
          message: '服务暂时不可用，草稿已保留。保存结果仍需站点所有者核实，暂勿重复提交。' };
        const messages = {
          400: '内容验证未通过，请检查内容后手动重试。草稿已保留。',
          401: '私人网站身份验证已失效，请重新验证后再手动提交。草稿已保留，本次不会自动重试。',
          403: '当前身份无权访问，请使用允许的邮箱重新验证或联系站点所有者。草稿已保留。',
          404: '投递地址不存在。请联系站点所有者，草稿已保留。',
          405: '投递接口不接受此请求。请联系站点所有者，草稿已保留。',
          413: '请求正文过大，请缩短内容后手动重试。',
          415: '请求格式不受支持，请联系站点所有者。',
        };
        if (messages[response.status]) return { status: 'error', reason: 'rejected', httpStatus: response.status,
          canRetry: true, requiresConfirmation: false, message: messages[response.status] };
        return { ...unknownResult('unconfirmed-http'), httpStatus: response.status };
      };
      try {
        return await Promise.race([
          operation(),
          new Promise((resolve) => {
            timer = setTimeout(() => { controller.abort(); resolve(unknownResult('timeout')); }, timeoutMs);
          }),
        ]);
      } catch { return unknownResult(controller.signal.aborted ? 'timeout' : 'network'); }
      finally { clearTimeout(timer); }
    },
  };
}
