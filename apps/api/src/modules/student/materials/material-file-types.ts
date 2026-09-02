const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function materialFileExtension(filename: string | null | undefined): string {
  return filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
}

/**
 * Browsers often upload raw request bodies as application/octet-stream. The original
 * filename is preserved by the portal, so use its well-known extension to restore the
 * media type needed by inline viewers.
 */
export function canonicalMaterialMimeType(
  filename: string | null | undefined,
  suppliedMimeType: string | null | undefined,
): string {
  return MIME_BY_EXTENSION[materialFileExtension(filename)]
    ?? suppliedMimeType?.split(';')[0]?.trim().toLowerCase()
    ?? 'application/octet-stream';
}

export function isPresentationMaterial(filename: string | null | undefined, mimeType: string): boolean {
  const extension = materialFileExtension(filename);
  return ['ppt', 'pptx', 'odp'].includes(extension) || /powerpoint|presentation/i.test(mimeType);
}
