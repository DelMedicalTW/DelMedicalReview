import { PROXY, STORAGE_KEY, SCHEMA_VERSION } from '../core/constants';
import { Annotation } from '../core/types';

var ANNOTATIONS_PATH = 'annotations';

export function saveLocal(annotations: Record<string, Annotation[]>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); } catch(e) {}
}

export function loadLocal(): Record<string, Annotation[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
}

export async function saveToGitHub(pdfName: string, annotations: Annotation[], reviewer: string): Promise<void> {
  // Skip if no annotations to save
  if (!annotations || annotations.length === 0) return;

  var safe = pdfName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  var fp = ANNOTATIONS_PATH + '/' + safe + '.json';

  var payload = {
    version: SCHEMA_VERSION,
    pdfName: pdfName,
    updatedBy: reviewer || 'Anonymous',
    updated: new Date().toISOString(),
    annotations: annotations,
  };
  var json = JSON.stringify(payload, null, 2);
  var bytes = new TextEncoder().encode(json);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
  var content = btoa(binary);

  // Step 1: Try to get existing file SHA
  var existingSha: string | null = null;
  try {
    var checkRes = await fetch(PROXY + '/contents/' + fp, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (checkRes.ok) {
      var checkData = await checkRes.json();
      existingSha = checkData.sha;
    }
    // 404 means file doesn't exist yet — that's fine, we'll create it
  } catch(e) {
    // Network error — skip this sync attempt
    console.warn('GitHub check failed:', e);
    return;
  }

  // Step 2: Build the request body
  var body: any = {
    message: 'Update annotations for ' + pdfName,
    content: content,
    branch: 'master',
  };

  // Only include SHA if the file already exists (for updates)
  if (existingSha) {
    body.sha = existingSha;
  }

  // Step 3: Create or update the file
  try {
    var res = await fetch(PROXY + '/contents/' + fp, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      // Only log if it's not a 404 (404 on PUT with no SHA means the proxy issue)
      if (res.status !== 404) {
        console.warn('GitHub sync failed:', res.status, err.message || 'Unknown error');
      }
    }
  } catch(e) {
    console.warn('GitHub sync network error:', e);
  }
}

export async function loadFromGitHub(pdfName: string): Promise<Annotation[]> {
  var safe = pdfName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  var fp = ANNOTATIONS_PATH + '/' + safe + '.json';
  try {
    var res = await fetch(PROXY + '/contents/' + fp, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      // 404 means no annotations yet — return empty
      return [];
    }
    var data = await res.json();
    if (data.content && data.encoding === 'base64') {
      var decoded = atob(data.content);
      var parsed = JSON.parse(decoded);
      return parsed.annotations || [];
    }
    return [];
  } catch(e) {
    console.warn('GitHub load failed:', e);
    return [];
  }
}
