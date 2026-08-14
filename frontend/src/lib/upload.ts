// Multipart upload helper — separate from lib/api.ts (protected, JSON-only:
// it unconditionally JSON.stringifies `body`, so it can't carry a File).
// Duplicates just the CSRF-cookie lookup api.ts already does internally,
// since that helper isn't exported.
import { API_URL, COOKIE_PREFIX } from './constants';
import { ApiError } from './api';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;

function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_COOKIE_NAME);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

export interface UploadedFile {
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  projectId: string | null;
  createdAt: string;
}

/** POST a File to /api/upload, optionally linking it to a project. */
export async function uploadFile(file: File, projectId?: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  if (projectId) form.append('projectId', projectId);

  const csrfToken = getCsrfToken();
  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    body: form,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, (body.message as string) ?? `Error ${res.status}`, body);
  }
  return res.json() as Promise<UploadedFile>;
}
