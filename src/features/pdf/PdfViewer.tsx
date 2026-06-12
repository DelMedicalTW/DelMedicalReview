import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { fabric } from 'fabric';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
}

export function PdfViewer() {
  const { state, dispatch } = useAppState();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const fabricCanvasesRef = useRef<Map<number, fabric.Canvas>>(new Map());

  useEffect(() => {
    return () => {
      fabricCanvasesRef.current.forEach((fc) => { try { fc.off(); fc.dispose(); } catch(e) {} });
      fabricCanvasesRef.current.clear();
    };
  }, [state.currentPDFPath]);

  useEffect(() => {
    if (!state.currentPDFPath) return;
    let cancelled = false;
    setLoading(true);
    setPages([]);
    dispatch({ type: 'SET_LOADING', payload: true });

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
      if (!cancelled) { setPages(pl); setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); }
    }).catch(e => {
      console.error(e);
      if (!cancelled) { setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); }
    });

    return () => { cancelled = true; };
  }, [state.currentPDFPath, dispatch]);

  if (!state.currentPDFPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center">
        <div>
          <svg className="w-20 h-20 mx-auto mb-4 opacity-30" xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <circle cx="11.5" cy="14.5" r="2.5" />
            <path d="M13.3 16.3 16 19" />
          </svg>
          <h3 className="text-xl font-semibold text-white/50">Select a PDF to review</h3>
          <p className="text-sm mt-2">Browse the file tree on the left</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#525659]">
        <span className="loading loading-spinner loading-lg text-white/50" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#525659] py-5 flex flex-col items-center gap-4">
      {pages.map(p => (
        <PageRenderer
          key={p.pageNum}
          pageNum={p.pageNum}
          width={p.width}
          height={p.height}
          pdfDoc={pdfDocRef.current}
          fabricCanvases={fabricCanvasesRef.current}
          tool={state.tool}
          color={state.color}
        />
      ))}
    </div>
  );
}

function PageRenderer({
  pageNum, width, height, pdfDoc, fabricCanvases, tool, color,
}: PageInfo & {
  pdfDoc: any;
  fabricCanvases: Map<number, fabric.Canvas>;
  tool: string;
  color: string;
}) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const fcRef = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!pdfDoc || rendered) return;
    let cancelled = false;

    async function render() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale: PDF_SCALE });
        if (cancelled) return;

        const pdfCanvas = pdfCanvasRef.current;
        if (pdfCanvas) {
          pdfCanvas.width = vp.width;
          pdfCanvas.height = vp.height;
          const ctx = pdfCanvas.getContext('2d');
          if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }

        const textContent = await page.getTextContent();
        const textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = vp.width + 'px';
          textLayer.style.height = vp.height + 'px';
          for (const item of textContent.items) {
            const it = item as any;
            if (!it.str) continue;
            const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
            const span = document.createElement('span');
            span.textContent = it.str;
            span.style.cssText = 'left:' + tx[4] + 'px;top:' + (tx[5] - fontHeight) + 'px;font-size:' + fontHeight + 'px;position:absolute;color:transparent;white-space:pre;cursor:text;';
            textLayer.appendChild(span);
          }
        }

        const fabricCanvas = fabricCanvasRef.current;
        if (fabricCanvas) {
          fabricCanvas.width = vp.width;
          fabricCanvas.height = vp.height;
          const oldFc = fabricCanvases.get(pageNum);
          if (oldFc) { oldFc.off(); oldFc.dispose(); }

          const fc = new fabric.Canvas(fabricCanvas, {
            selection: false,
            isDrawingMode: false,
            renderOnAddRemove: true,
          });
          (fc as any).lowerCanvasEl.style.pointerEvents = 'none';
          fcRef.current = fc;
          fabricCanvases.set(pageNum, fc);
        }

        if (!cancelled) setRendered(true);
      } catch (e) {
        console.error('Render error page', pageNum, e);
      }
    }

    render();
    return () => {
      cancelled = true;
      const fc = fabricCanvases.get(pageNum);
      if (fc) { fc.off(); fc.dispose(); fabricCanvases.delete(pageNum); }
    };
  }, [pdfDoc, pageNum, rendered]);

  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const el = (fc as any).lowerCanvasEl as HTMLElement;
    if (!el) return;

    if (tool === 'select' || tool === 'highlight') {
      el.style.pointerEvents = 'none';
      fc.isDrawingMode = false;
      fc.selection = false;
    } else if (tool === 'draw') {
      el.style.pointerEvents = 'auto';
      fc.isDrawingMode = true;
      fc.selection = false;
      (fc as any).freeDrawingBrush.color = color.replace(/[\d.]+\)$/, '1)');
      (fc as any).freeDrawingBrush.width = 3;
    } else {
      el.style.pointerEvents = 'auto';
      fc.isDrawingMode = false;
      fc.selection = false;
    }
    fc.renderAll();
  }, [tool, color]);

  return (
    <div className="page-wrapper relative bg-white flex-shrink-0 shadow-lg" style={{ width, height }} data-page={pageNum}>
      <canvas ref={pdfCanvasRef} className="block" />
      <div ref={textLayerRef} className="absolute top-0 left-0 z-10 overflow-hidden" />
      <canvas ref={fabricCanvasRef} className="absolute top-0 left-0 z-20" />
      <div className="absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-30">
        Page {pageNum}
      </div>
    </div>
  );
}
