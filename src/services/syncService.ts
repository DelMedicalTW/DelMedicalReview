import { CONFLICT_KEY, SCHEMA_VERSION } from '../core/constants';
import { loadAnnotationsFile, saveAnnotationsFile } from './githubApi';
import { Annotation, SyncPayload } from '../core/types';

export async function loadFromGitHub(pdfName: string): Promise<Annotation[]> {
  const result = await loadAnnotationsFile(pdfName);
  if (result && result.data.annotations) {
    return result.data.annotations;
  }
  return [];
}

export async function syncToGitHub(
  pdfName: string,
  annotations: Annotation[],
  reviewer: string,
  sha?: string | null
): Promise<{ sha: string }> {
  const payload: SyncPayload = {
    version: SCHEMA_VERSION,
    pdfName,
    updatedBy: reviewer,
    updated: new Date().toISOString(),
    annotations,
  };
  return saveAnnotationsFile(pdfName, payload, sha);
}

export function saveLocal(annotations: Record<string, Annotation[]>): void {
  try {
    localStorage.setItem('delmed-annotations-v15', JSON.stringify(annotations));
  } catch {}
}

export function loadLocal(): Record<string, Annotation[]> {
  try {
    return JSON.parse(localStorage.getItem('delmed-annotations-v15') || '{}');
  } catch {
    return {};
  }
}

export function checkForConflictBackup(): SyncPayload | null {
  try {
    const backup = localStorage.getItem(CONFLICT_KEY);
    if (!backup) return null;
    return JSON.parse(backup);
  } catch {
    localStorage.removeItem(CONFLICT_KEY);
    return null;
  }
}

export function clearConflictBackup(): void {
  localStorage.removeItem(CONFLICT_KEY);
}
