import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { fabric } from 'fabric';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo { pageNum: number; width: number; height: number; }

export function PdfViewer() {
  const { state } = useAppState();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const fabricCanvasesRef = useRef<Map<number, fabric.Canvas>>(new Map());

  // Cleanup fabric canvases when PDF changes
  useEffect(() => {
    return () => {
      fabricCanvasesRef.current.forEach((fc) => {
        fc.off();
        fc.dispose();
      });
      fabricCanvasesRef.current.clear();
    };
  }, [state.currentPDFPath]);

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

  const handleToolChange = useCallback(() => {
    const tool = state.tool;
    const color = state.color;
    fabricCanvasesRef.current.forEach((fc) => {
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
    });
  }, [state.tool, state.color]);

  useEffect(() => {
    handleToolChange();
  }, [state.tool, state.color, pages, handleToolChange]);

  if (!state.currentPDFPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center">
        <h3 className="text-xl font-semibold text-white/50">Select a PDF</h3>
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

// ============================================================
// PAGE RENDERER — PDF canvas + text layer + Fabric canvas
// ============================================================
function PageRenderer({
  pageNum, width, height, pdfDoc, fabricCanvases, tool, color,
}: PageInfo & { pdfDoc: any; fabricCanvases: Map<number, fabric.Canvas>; tool: string; color: string }) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const fcRef = useRef<fabric.Canvas | null>(null);

  // Render PDF + text layer + Fabric canvas
  useEffect(() => {
    if (!pdfDoc || rendered) return;
    let cancelled = false;

    async function render() {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale: PDF_SCALE });
        if (cancelled) return;

        // PDF canvas
        const pdfCanvas = pdfCanvasRef.current;
        if (pdfCanvas) {
          pdfCanvas.width = vp.width;
          pdfCanvas.height = vp.height;
          const ctx = pdfCanvas.getContext('2d');
          if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }

        // Text layer for selection
        const textContent = await page.getTextContent();
        const textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = vp.width + 'px';
          textLayer.style.height = vp.height + 'px';

          for (const item of textContent.items) {
            const tx = pdfjsLib.Util.transform(vp.transform, (item as any).transform);
            const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
            const style = textContent.styles[(item as any).fontName] || {};
            const span = document.createElement('span');
            span.textContent = (item as any).str;
            span.style.left = tx[4] + 'px';
            span.style.top = (tx[5] - fontHeight) + 'px';
            span.style.fontSize = fontHeight + 'px';
            span.style.fontFamily = style.fontFamily || 'sans-serif';
            span.style.color = 'transparent';
            span.style.position = 'absolute';
            span.style.whiteSpace = 'pre';
            span.style.cursor = 'text';
            span.style.transformOrigin = '0% 0%';
            textLayer.appendChild(span);
          }
        }

        // Fabric canvas
        const fabricCanvas = fabricCanvasRef.current;
        if (fabricCanvas) {
          fabricCanvas.width = vp.width;
          fabricCanvas.height = vp.height;

          // Dispose old canvas if exists
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

  // Update tool mode when tool/color changes
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
      {/* PDF canvas (bottom layer) */}
      <canvas ref={pdfCanvasRef} className="block" />

      {/* Text layer (for text selection) */}
      <div
        ref={textLayerRef}
        className="absolute top-0 left-0 z-10 overflow-hidden"
        style={{ width, height, opacity: 1, lineHeight: 1.0 }}
      />

      {/* Fabric canvas (top layer for annotations) */}
      <canvas ref={fabricCanvasRef} className="absolute top-0 left-0 z-20" />

      {/* Page label */}
      <div className="absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-30">
        Page {pageNum}
      </div>
    </div>
  );
}
