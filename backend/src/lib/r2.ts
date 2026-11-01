import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 (S3-compatible object storage) for lesson videos. R2 takes files of any size from the browser, charges nothing for traffic out, and
// has a free tier, which is why videos go here rather than to Supabase Storage (whose free plan refuses a file over 50MB). The rest of the app's files
// (teacher IDs, photos, certificates, backups) stay on Supabase. All of this is off until the R2_* settings exist -- see backend/.env.example.
//
//   R2_ACCOUNT_ID         Cloudflare account id (the long hex number in the R2 page's URL / "Account ID")
//   R2_ACCESS_KEY_ID      } an R2 API token with "Object Read & Write" on the videos bucket
//   R2_SECRET_ACCESS_KEY  }
//   R2_BUCKET             the bucket's name
//   R2_PUBLIC_URL         where the bucket's files are served publicly, no trailing slash: the bucket's custom domain, or its r2.dev address
//   R2_ENDPOINT           (optional) the S3 address, https://<account id>.r2.cloudflarestorage.com by default
// A value pasted into a host's settings page often carries a stray space, a new line or a pair of quotes: those are dropped.
const clean = (v: string | undefined) => v?.trim().replace(/^["']+|["']+$/g, '').trim() || undefined;
const accountId = clean(process.env.R2_ACCOUNT_ID);
const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID);
const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
const bucket = clean(process.env.R2_BUCKET);
const publicBase = clean(process.env.R2_PUBLIC_URL)?.replace(/\/+$/, '');
const endpoint = clean(process.env.R2_ENDPOINT) ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

export const r2Enabled = !!(accessKeyId && secretAccessKey && bucket && publicBase && endpoint);

const client = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      forcePathStyle: true,
      // Newer versions of the AWS library add a checksum of the (still unknown) body to an upload link -- of an empty file -- and R2 then rejects the real
      // upload as not matching it. Only add checksums where an operation requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  : null;

/** A one-time link the browser can PUT one file to, good for 15 minutes. The type and exact size are part of the signature, so nothing else is accepted. */
export async function r2UploadUrl(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(client!, new PutObjectCommand({ Bucket: bucket!, Key: key, ContentType: contentType, ContentLength: size }), {
    expiresIn: 15 * 60,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
}

/** Where a stored file is served from. */
export function r2PublicUrl(key: string): string {
  return `${publicBase}/${key}`;
}

/** The object key of a file whose public URL is `url`, or null when `url` is not one of this bucket's. */
export function r2KeyFromUrl(url: string | null): string | null {
  if (!r2Enabled || !url || !url.startsWith(`${publicBase}/`)) return null;
  return decodeURIComponent(url.slice(publicBase!.length + 1).split('?')[0]);
}

export async function r2Delete(key: string): Promise<void> {
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
}

type SelfTestStep = { step: string; ok: boolean; detail: string };

/** What went wrong, from an S3-style error, without anything secret in it. */
function describeError(err: unknown): string {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  return [e?.Code ?? e?.name, e?.$metadata?.httpStatusCode ? 'HTTP ' + e.$metadata.httpStatusCode : null].filter(Boolean).join(' · ') || (e?.message ?? String(err)).slice(0, 200);
}

/**
 * Tries what a lesson upload needs, step by step, and says which one fails (admin diagnostics, GET /api/admin/diagnostics): the keys and bucket
 * (a direct write), the one-time link the browser will use (a signed PUT, exactly as a browser sends it), the public address the video is played
 * from, and the bucket's CORS rule for the site. The test file is removed again. Never returns the keys.
 * (A browser cannot tell these apart: R2's error replies carry no CORS header, so any rejection looks like "couldn't reach the storage".)
 */
export async function r2SelfTest(siteOrigin: string): Promise<{ configured: boolean; settings: Record<string, unknown>; steps: SelfTestStep[] }> {
  // Only lengths and the like, never a key: an R2 account id and access key id are 32 characters, a secret access key 64 (anything else was pasted wrong).
  const settings = {
    accountIdLength: accountId?.length ?? 0,
    accessKeyIdLength: accessKeyId?.length ?? 0,
    secretAccessKeyLength: secretAccessKey?.length ?? 0,
    expectedLengths: { accountId: 32, accessKeyId: 32, secretAccessKey: 64 },
    accessKeyIdLooksLikeApiToken: /^cfut_|^cf[a-z]{2}_/i.test(process.env.R2_ACCESS_KEY_ID ?? ''),
    bucket: bucket ?? null,
    publicUrl: publicBase ?? null,
  };
  if (!r2Enabled || !client) return { configured: false, settings, steps: [] };
  const steps: SelfTestStep[] = [];
  const key = `diagnostics/selftest-${Date.now()}.txt`;
  const body = Buffer.from('anees r2 self-test');

  try {
    await client.send(new PutObjectCommand({ Bucket: bucket!, Key: key, Body: body, ContentType: 'text/plain' }));
    steps.push({ step: '1. Keys and bucket: write a test file', ok: true, detail: 'ok' });
  } catch (err) {
    steps.push({
      step: '1. Keys and bucket: write a test file',
      ok: false,
      detail: describeError(err) + ' -- wrong R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ACCOUNT_ID / R2_BUCKET, or the token lacks Object Read & Write on this bucket',
    });
    return { configured: true, settings, steps };
  }

  const stepName2 = '2. Upload link: send a file the way the browser does';
  try {
    const res = await fetch(await r2UploadUrl(key, 'text/plain', body.length), { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body });
    steps.push({ step: stepName2, ok: res.ok, detail: res.ok ? 'ok' : 'HTTP ' + res.status + ' ' + ((await res.text()).match(/<Code>(.*?)<\/Code>/)?.[1] ?? '') });
  } catch (err) {
    steps.push({ step: stepName2, ok: false, detail: String(err).slice(0, 200) });
  }

  const stepName3 = '3. Public address: read the file back from R2_PUBLIC_URL';
  try {
    const res = await fetch(r2PublicUrl(key));
    steps.push({
      step: stepName3,
      ok: res.ok,
      detail: res.ok ? 'ok' : 'HTTP ' + res.status + ' -- is the bucket public (Public Development URL enabled, or a custom domain) and R2_PUBLIC_URL that address, with no / at the end?',
    });
  } catch (err) {
    steps.push({ step: stepName3, ok: false, detail: String(err).slice(0, 200) });
  }

  const stepName4 = '4. CORS: the bucket allows the site (' + siteOrigin + ') to upload';
  try {
    const res = await fetch(await r2UploadUrl(key, 'text/plain', body.length), {
      method: 'OPTIONS',
      headers: { Origin: siteOrigin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
    });
    const allowed = res.headers.get('access-control-allow-origin');
    steps.push({ step: stepName4, ok: allowed === siteOrigin || allowed === '*', detail: allowed ? 'ok' : 'HTTP ' + res.status + " -- add this site to the bucket's CORS rule (AllowedMethods PUT, GET, HEAD)" });
  } catch (err) {
    steps.push({ step: stepName4, ok: false, detail: String(err).slice(0, 200) });
  }

  await r2Delete(key).catch(() => {});
  return { configured: true, settings, steps };
}
