import { useState, useCallback, useRef } from 'react';
import { syncToGitHub } from '../services/syncService';
import { Annotation } from '../core/types';

export function useSync() {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    localStorage.getItem('delmed-last-sync')
  );
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInProgress = useRef(false);
  const syncPending = useRef(false);
  const pendingPDF = useRef<string | null>(null);

  const scheduleSync = useCallback(
    (pdfName: string, annotations: Annotation[], reviewer: string, sha?: string | null) => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      pendingPDF.current = pdfName;
      syncTimer.current = setTimeout(async () => {
        const pdf = pendingPDF.current;
        pendingPDF.current = null;
        await doSync(pdf!, annotations, reviewer, sha, true);
      }, 2000);
    },
    []
  );

  const doSync = useCallback(
    async (
      pdfName: string,
      annotations: Annotation[],
      reviewer: string,
      sha?: string | null,
      silent?: boolean
    ) => {
      if (syncInProgress.current) {
        syncPending.current = true;
        pendingPDF.current = pdfName;
        return;
      }
      syncInProgress.current = true;
      syncPending.current = false;
      setSyncStatus('syncing');
      try {
        const result = await syncToGitHub(pdfName, annotations, reviewer, sha);
        const now = new Date().toISOString();
        localStorage.setItem('delmed-last-sync', now);
        setLastSyncTime(now);
        setSyncStatus('success');
        if (!silent) {
          // toast would go here via context
        }
        return result;
      } catch (e: any) {
        setSyncStatus('error');
        throw e;
      } finally {
        syncInProgress.current = false;
        if (syncPending.current) {
          syncPending.current = false;
          const pending = pendingPDF.current;
          pendingPDF.current = null;
          if (pending) scheduleSync(pending, annotations, reviewer, sha);
        }
      }
    },
    [scheduleSync]
  );

  return { syncStatus, lastSyncTime, scheduleSync, doSync, setSyncStatus };
}
