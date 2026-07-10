import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Endpoint = process.env.S3_ENDPOINT || 'https://s3.dianrp.com';
const s3Region = process.env.S3_REGION || 'auto';
const s3AccessKey = process.env.S3_ACCESS_KEY || '';
const s3SecretKey = process.env.S3_SECRET_KEY || '';
const s3Bucket = process.env.S3_BUCKET || 'public-bucket';
const s3PathPrefix = process.env.S3_PATH_PREFIX || '';

const s3Client = new S3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
  },
  forcePathStyle: true,
});

function buildKey(key) {
  return s3PathPrefix ? `${s3PathPrefix}/${key}` : key;
}

function buildUrl(key) {
  return `${s3Endpoint}/${s3Bucket}/${buildKey(key)}`;
}

export async function uploadFile({ key, body, contentType }) {
  const command = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: buildKey(key),
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
  return buildUrl(key);
}

export async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: s3Bucket,
    Key: buildKey(key),
  });
  await s3Client.send(command);
}
