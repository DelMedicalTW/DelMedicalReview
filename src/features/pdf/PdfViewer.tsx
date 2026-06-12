import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo { pageNum: number; width: number; height: number; }

export function PdfViewer() {
  const { state } = useAppState();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    if (!state.currentPDFPath) return;
    let cancelled = false;
    setLoading(true);
    setPages([]);
    fetchPDF(state.currentPDFPath).then(async (data) => {
      if (cancelled) return;
      const doc = await pdfjsLib.getDocument({ data }).promise;
      pdfDocRef.current = doc;
      const pl: PageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: PDF_SCALE });
        pl.push({ pageNum: i, width: vp.width, height: vp.height });
      }
      if (!cancelled) { setPages(pl); setLoading(false); }
    }).catch(e => { console.error(e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state.currentPDFPath]);

  if (!state.currentPDFPath) return <div className="flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center"><h3 className="text-xl font-semibold text-white/50">Select a PDF</h3></div>;
  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#525659]"><span className="loading loading-spinner loading-lg text-white/50" /></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-[#525659] py-5 flex flex-col items-center gap-4">
      {pages.map(p => <PageRenderer key={p.pageNum} {...p} pdfDoc={pdfDocRef.current} />)}
    </div>
  );
}

function PageRenderer({ pageNum, width, height, pdfDoc }: PageInfo & { pdfDoc: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || rendered) return;
    let cancelled = false;
    pdfDoc.getPage(pageNum).then((page: any) => {
      if (cancelled) return;
      const vp = page.getViewport({ scale: PDF_SCALE });
      const c = canvasRef.current; if (!c) return;
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d');
      if (ctx) page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => { if (!cancelled) setRendered(true); });
    });
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, rendered]);

  return (
    <div className="page-wrapper relative bg-white flex-shrink-0 shadow-lg" style={{ width, height }} data-page={pageNum}>
      <canvas ref={canvasRef} className="block" />
      <div className="absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-20">Page {pageNum}</div>
    </div>
  );
}
