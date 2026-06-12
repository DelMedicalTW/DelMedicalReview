import { PROXY, ANNOTATIONS_PATH, SCHEMA_VERSION } from '../core/constants';
import { SyncPayload } from '../core/types';

export async function fetchContents(path: string): Promise<any> {
  const res = await fetch(`${PROXY}/contents/${path}`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API ${res.status}`);
  }
  return res.json();
}

export async function fetchPDF(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${PROXY}/raw/master/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function loadAnnotationsFile(
  pdfName: string
): Promise<{ data: SyncPayload; sha: string } | null> {
  const safe = pdfName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fp = `${ANNOTATIONS_PATH}/${safe}.json`;
  try {
    const result = await fetchContents(fp);
    if (result.content && result.encoding === 'base64') {
      const decoded = atob(result.content);
      const data = JSON.parse(decoded);
      if (data.version !== SCHEMA_VERSION) {
        throw new Error(`Unsupported annotation version: ${data.version}`);
      }
      return { data, sha: result.sha };
    }
    return null;
  } catch (e: any) {
    if (e.message.includes('Unsupported')) throw e;
    return null;
  }
}

export async function saveAnnotationsFile(
  pdfName: string,
  data: SyncPayload,
  sha?: string | null
): Promise<{ sha: string }> {
  const safe = pdfName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fp = `${ANNOTATIONS_PATH}/${safe}.json`;
  const json = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const content = btoa(binary);
  const body: any = {
    message: `Update annotations for ${pdfName}`,
    content,
    branch: 'master',
  };
  if (sha) body.sha = sha;
  const res = await fetch(`${PROXY}/contents/${fp}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 409 || err.message?.includes('sha')) {
      localStorage.setItem('delmed-conflict-backup', json);
      throw new Error('Conflict: file was modified by another user. Your changes have been backed up locally.');
    }
    throw new Error(err.message || `API ${res.status}`);
  }
  const result = await res.json();
  return { sha: result.content?.sha || '' };
}
