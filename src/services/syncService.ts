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

  var res = await fetch(PROXY + '/contents/' + fp, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Update annotations for ' + pdfName,
      content: content,
      branch: 'master',
    }),
  });

  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    console.warn('GitHub sync failed:', err.message || res.status);
  }
}

export async function loadFromGitHub(pdfName: string): Promise<Annotation[]> {
  var safe = pdfName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  var fp = ANNOTATIONS_PATH + '/' + safe + '.json';
  try {
    var res = await fetch(PROXY + '/contents/' + fp, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return [];
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
