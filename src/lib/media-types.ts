export const FILE_TYPE_MAP: Record<string, string[]> = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp"],
  pdf: ["pdf"],
  video: ["mp4", "webm", "ogg", "mov", "avi", "mkv"],
  audio: ["mp3", "wav", "aac", "flac", "m4a"],
  document: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"],
  archive: ["zip", "rar", "tar", "gz", "7z"],
};

export const ALLOWED_EXTENSIONS = Object.values(FILE_TYPE_MAP).flat();
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB, verified from file-manager.php

/** Verified against fm_detect_type() in file-manager.php. */
export function detectFileType(ext: string): string {
  const lower = ext.toLowerCase();
  for (const [type, exts] of Object.entries(FILE_TYPE_MAP)) {
    if (exts.includes(lower)) return type;
  }
  return "other";
}
