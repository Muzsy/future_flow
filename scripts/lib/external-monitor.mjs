const checks = [
  {
    path: '/account-access',
    status: 200,
    heading: 'Account access',
    type: 'text/html',
  },
  {
    path: '/privacy-notice',
    status: 200,
    heading: 'Privacy and your data',
    type: 'text/html',
  },
  {
    path: '/api/v1/me/export',
    status: 401,
    code: 'AUTH_REQUIRED',
    type: 'application/json',
  },
];
async function boundedText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw Error('Oversize response');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel();
  }
}
export async function inspectExternalAvailability(
  fetcher = fetch,
  origin = 'https://alterward.com',
) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('Credential-free HTTPS origin required');
  const results = [];
  for (const check of checks) {
    try {
      const response = await fetcher(new URL(check.path, url), {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': 'Alterward-external-availability/1',
        },
        signal: AbortSignal.timeout(10000),
      });
      const text = await boundedText(response);
      let expectedBody = false;
      if (check.heading)
        expectedBody =
          text.includes(check.heading) &&
          !text.includes('Start a new life branch.');
      else {
        try {
          const value = JSON.parse(text);
          expectedBody =
            Object.keys(value).length === 1 && value.error?.code === check.code;
        } catch {
          /* No raw body in results. */
        }
      }
      const noStore = /\bno-store\b/i.test(
        response.headers.get('cache-control') ?? '',
      );
      const cached = /^(HIT|STALE|UPDATING|REVALIDATED)$/i.test(
        response.headers.get('cf-cache-status') ?? '',
      );
      const contentType = (response.headers.get('content-type') ?? '').includes(
        check.type,
      );
      results.push({
        path: check.path,
        passed:
          response.status === check.status &&
          expectedBody &&
          noStore &&
          !cached &&
          contentType,
        status: response.status,
        expectedBody,
        noStore,
        cached,
        contentType,
      });
    } catch {
      results.push({
        path: check.path,
        passed: false,
        reason: 'UNREACHABLE_OR_INVALID_RESPONSE',
      });
    }
  }
  return {
    passed: results.every((r) => r.passed),
    checks: results,
    scope: 'public-web-and-unauthenticated-api',
    workerOrDatabaseHealthVerified: false,
    credentialsUsed: false,
    paidAiCalls: 0,
  };
}
