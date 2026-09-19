import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, features } from "@/lib/env";
import { AppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Patient document storage.
 *
 * Non-negotiables for this module, because it holds X-rays and clinical
 * photographs:
 *
 *  - the bucket is PRIVATE. Nothing is ever served from a public URL.
 *  - downloads go through short-lived signed URLs, generated per request after
 *    an authorisation check. A signed URL that leaks expires in minutes rather
 *    than granting permanent access.
 *  - object keys are unguessable. A predictable key like
 *    `patients/ADC-P-000123/xray-1.jpg` means anyone who obtains one URL can
 *    walk the whole bucket by incrementing numbers.
 *  - uploads are validated on the server by declared type AND by magic bytes.
 *    A .jpg that is actually an HTML file is a stored-XSS payload if it is ever
 *    served inline.
 */

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB — CBCT exports are large.

/** Accepted types, mapped to their magic-byte signature. */
const ALLOWED_TYPES: Record<string, { extensions: string[]; magic?: number[][] }> = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/png": { extensions: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/webp": { extensions: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]] },
  "image/tiff": {
    extensions: ["tif", "tiff"],
    magic: [
      [0x49, 0x49, 0x2a, 0x00],
      [0x4d, 0x4d, 0x00, 0x2a],
    ],
  },
  "application/pdf": { extensions: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  // DICOM: the magic bytes sit at offset 128, handled separately below.
  "application/dicom": { extensions: ["dcm", "dicom"] },
  "application/zip": { extensions: ["zip"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
};

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!features.storage) {
    throw new AppError("Document storage is not configured.", {
      status: 503,
      code: "STORAGE_UNCONFIGURED",
    });
  }

  client ??= new S3Client({
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY!,
      secretAccessKey: env.STORAGE_SECRET_KEY!,
    },
  });

  return client;
}

/**
 * Builds an unguessable object key.
 *
 * The patient id is in the path for operational clarity (bulk export, deletion
 * on request), but the filename is a random UUID, so knowing one key tells you
 * nothing about any other.
 */
export function buildStorageKey(patientId: string, kind: string, extension: string): string {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `patients/${patientId}/${kind.toLowerCase()}/${randomUUID()}.${safeExtension}`;
}

export interface UploadInput {
  patientId: string;
  kind: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

export interface UploadResult {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  contentType: string;
}

export async function uploadPatientDocument(input: UploadInput): Promise<UploadResult> {
  if (input.body.length === 0) throw new ValidationError("That file is empty.");
  if (input.body.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Please compress it or send it on a disc.`,
    );
  }

  const allowed = ALLOWED_TYPES[input.contentType];
  if (!allowed) {
    throw new ValidationError(
      "That file type is not accepted. Please upload a JPEG, PNG, TIFF, PDF, DICOM or ZIP file.",
    );
  }

  const extension = input.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.extensions.includes(extension)) {
    throw new ValidationError("The file extension does not match its type.");
  }

  if (!hasValidSignature(input.body, input.contentType)) {
    // The declared type and the actual bytes disagree. Whether that is a
    // rename or an attack, storing it is wrong either way.
    throw new ValidationError("That file does not appear to be the type it claims to be.");
  }

  const storageKey = buildStorageKey(input.patientId, input.kind, extension);
  const checksum = createHash("sha256").update(input.body).digest("hex");

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: storageKey,
      Body: input.body,
      ContentType: input.contentType,
      // Forces a download rather than inline rendering. Even with the type
      // checks above, a browser should never be asked to interpret a patient
      // document as a document it can execute.
      ContentDisposition: "attachment",
      ServerSideEncryption: "AES256",
      Metadata: { patientId: input.patientId, checksum },
    }),
  );

  logger.info({ patientId: input.patientId, kind: input.kind, storageKey }, "patient document stored");

  return {
    storageKey,
    sizeBytes: input.body.length,
    checksum,
    contentType: input.contentType,
  };
}

/**
 * Short-lived download URL.
 *
 * The caller MUST have already checked that this requester may see this
 * document — this function does no authorisation of its own, and is not safe to
 * expose directly.
 */
export async function getSignedDownloadUrl(
  storageKey: string,
  options: { filename?: string; expiresInSeconds?: number } = {},
): Promise<string> {
  const expiresIn = options.expiresInSeconds ?? env.STORAGE_SIGNED_URL_TTL;

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: storageKey,
      ...(options.filename
        ? { ResponseContentDisposition: `attachment; filename="${sanitiseFilename(options.filename)}"` }
        : {}),
    }),
    { expiresIn },
  );
}

export async function deleteStoredObject(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: storageKey }),
  );
}

/** Checks the leading bytes against the declared content type. */
function hasValidSignature(body: Buffer, contentType: string): boolean {
  // DICOM puts "DICM" at offset 128, after a 128-byte preamble.
  if (contentType === "application/dicom") {
    return body.length > 132 && body.subarray(128, 132).toString("ascii") === "DICM";
  }

  const signatures = ALLOWED_TYPES[contentType]?.magic;
  if (!signatures) return false;

  return signatures.some((signature) =>
    signature.every((byte, index) => body[index] === byte),
  );
}

/** Strips path separators and quotes from a filename used in a header. */
function sanitiseFilename(filename: string): string {
  return filename.replace(/[/\\"\r\n]/g, "_").slice(0, 120);
}

export const STORAGE_LIMITS = {
  maxBytes: MAX_UPLOAD_BYTES,
  allowedTypes: Object.keys(ALLOWED_TYPES),
} as const;
