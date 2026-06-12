import { PROXY, STORAGE_KEY, SCHEMA_VERSION } from '../core/constants';
import { Annotation } from '../core/types';

// ============================================================
// LOCAL STORAGE (always works, no network needed)
// ============================================================
export function saveLocal(annotations: Record<string, Annotation[]>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); } catch(e) {}
}

export function loadLocal(): Record<string, Annotation[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; }
}

// ============================================================
// CLOUDFLARE KV STORAGE (cross-device, no GitHub token needed)
// ============================================================
export async function saveToKV(pdfName: string, annotations: Annotation[], reviewer: string): Promise<void> {
  if (!annotations || annotations.length === 0) return;

  var payload = {
    pdfName: pdfName,
    annotations: {
      version: SCHEMA_VERSION,
      pdfName: pdfName,
      updatedBy: reviewer || 'Anonymous',
      updated: new Date().toISOString(),
      annotations: annotations,
    },
  };

  try {
    var res = await fetch(PROXY + '/annotations/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('KV save failed:', res.status);
    }
  } catch(e) {
    console.warn('KV save network error:', e);
  }
}

export async function loadFromKV(pdfName: string): Promise<Annotation[]> {
  try {
    var res = await fetch(PROXY + '/annotations/load?pdf=' + encodeURIComponent(pdfName));
    if (!res.ok) return [];
    var data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && data.annotations) return data.annotations;
    return [];
  } catch(e) {
    console.warn('KV load failed:', e);
    return [];
  }
}

// ============================================================
// COMBINED: Load from KV first, fall back to local
// ============================================================
export async function loadAnnotations(pdfName: string): Promise<Annotation[]> {
  // Try KV first
  try {
    var kvData = await loadFromKV(pdfName);
    if (kvData && kvData.length > 0) return kvData;
  } catch(e) {}

  // Fall back to local storage
  var allLocal = loadLocal();
  return allLocal[pdfName] || [];
}

// ============================================================
// COMBINED: Save to both KV and local
// ============================================================
export async function saveAnnotations(
  pdfName: string,
  allAnnotations: Record<string, Annotation[]>,
  reviewer: string
): Promise<void> {
  // Always save locally (instant)
  saveLocal(allAnnotations);

  // Save to KV in background (debounced by caller)
  var anns = allAnnotations[pdfName] || [];
  saveToKV(pdfName, anns, reviewer).catch(function() {});
}
