import { PROXY, STORAGE_KEY, SCHEMA_VERSION } from '../core/constants';
import { Annotation } from '../core/types';

// Store annotations in the app repo, not the PDF source repo
var ANNOTATIONS_REPO_OWNER = 'DelMedicalTW';
var ANNOTATIONS_REPO_NAME = 'DelMedicalReview';
var ANNOTATIONS_PATH = 'annotations';
var ANNOTATIONS_API_BASE = 'https://api.github.com/repos/' + ANNOTATIONS_REPO_OWNER + '/' + ANNOTATIONS_REPO_NAME;

export function saveLocal(annotations: Record<string, Annotation[]>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); } catch(e) {}
}

export function loadLocal(): Record<string, Annotation[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
}

export async function saveToGitHub(pdfName: string, annotations: Annotation[], reviewer: string): Promise<void> {
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

  // Step 1: Check if file exists in DelMedicalReview repo
  var existingSha: string | null = null;
  try {
    var checkRes = await fetch(PROXY + '/contents/' + fp, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (checkRes.ok) {
      var checkData = await checkRes.json();
      existingSha = checkData.sha;
    }
  } catch(e) {
    console.warn('GitHub check failed:', e);
    return;
  }

  // Step 2: Build request body
  var body: any = {
    message: 'Update annotations for ' + pdfName,
    content: content,
    branch: 'main',
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  // Step 3: Create or update
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
