// GET-only Access observation. No policy writes, arbitrary URL or redirect.
// API: developers.cloudflare.com/api/resources/zero_trust/subresources/access/
import { createHash } from 'node:crypto';
import { exactObject } from './funded-upgrade.mjs';
const hash = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function readFundedAccess(
  secret,
  request = fetch,
  now = () => new Date(),
) {
  exactObject(secret, ['accountId', 'applicationId', 'token']);
  if (
    !/^[a-f0-9]{32}$/.test(secret.accountId) ||
    !/^[-a-f0-9]{36}$/.test(secret.applicationId) ||
    typeof secret.token !== 'string' ||
    !secret.token ||
    /[\r\n]/.test(secret.token)
  )
    throw Error('Private Access read credential required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${secret.accountId}/access`;
  const get = async (path) => {
    const r = await request(base + path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret.token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error('Access readback unavailable');
    const raw = await r.text();
    if (raw.length > 262144) throw Error('Bounded Access readback required');
    const data = JSON.parse(raw);
    if (data.success !== true) throw Error('Access readback refused');
    return data;
  };
  const app = (await get('/apps/' + secret.applicationId)).result;
  const org = (await get('/organizations')).result;
  const page = await get(
    '/apps/' + secret.applicationId + '/policies?per_page=100&page=1',
  );
  if (
    page.result_info?.total_pages > 1 ||
    !Array.isArray(page.result) ||
    !page.result.length ||
    page.result.length > 20 ||
    app.id !== secret.applicationId ||
    app.type !== 'self_hosted' ||
    app.domain !== 'alterward.com' ||
    !/^[a-f0-9]{64}$/.test(app.aud) ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(org.auth_domain)
  )
    throw Error('Exact self-hosted Access application required');
  const emails = [];
  for (const p of page.result) {
    // Narrow supported policy shape. Groups, bypass, service-auth, excludes,
    // posture and additional identity rules need separate reviewed support.
    if (
      p.decision !== 'allow' ||
      p.require?.length ||
      p.exclude?.length ||
      !p.include?.length
    )
      throw Error('Unsupported Access policy requires review');
    for (const rule of p.include) {
      exactObject(rule, ['email']);
      exactObject(rule.email, ['email']);
      const email = rule.email.email;
      if (
        typeof email !== 'string' ||
        email !== email.toLowerCase() ||
        !/^[-a-z0-9._+]+@[-a-z0-9.]+$/.test(email)
      )
        throw Error('Exact email rule required');
      emails.push(email);
    }
  }
  if (new Set(emails).size !== emails.length)
    throw Error('Duplicate Access email rule');
  // Bind every returned policy/application/organization field conservatively.
  // Drift therefore refuses a transition even when its email projection agrees.
  const policies = page.result.toSorted((a, b) => a.id.localeCompare(b.id));
  return {
    checkedAt: now().toISOString(),
    teamDomain: org.auth_domain,
    audience: app.aud,
    allowedEmails: emails.toSorted(),
    configurationSha256: hash({ app, org, policies }),
  };
}
