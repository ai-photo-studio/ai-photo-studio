# Download Security

**Date:** 2026-07-23T14:59:23.399Z

## Signed URL Implementation

Existing production code (`storage.service.ts:198-210`):

```typescript
async getSignedUrl(key: string): Promise<string> {
  return await getSignedUrl(
    this.client,
    new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    { expiresIn: 15 * 60 }  // 15 minutes
  );
}
```

## Security Properties

| Property | Value | Source |
|---|---|---|
| URL type | S3 presigned (R2) | storage.service.ts:200-207 |
| Expiry | 15 minutes | storage.service.ts:206 |
| Auth requirement | requireAuth middleware | restoration.routes.ts |
| Payment gate | payment verification required | restoration.service.ts:244-249 |
| Transport | HTTPS only | Cloudflare R2 endpoint |

## Flow

```
Customer requests download (authenticated)
  ↓
Check: payment completed?
  ↓ YES
Check: item exists? restoration completed?
  ↓ YES
Generate S3 presigned GET URL (15min)
  ↓
Return URL to customer
  ↓
Customer downloads within 15 minutes
```