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
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');
const endpoint = process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

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
