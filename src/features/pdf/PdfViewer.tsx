import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { fabric } from 'fabric';
import { Annotation } from '../../core/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo {
  pageNum: number;
  width: number;
  height: number;
}

// ============================================================
// PDF VIEWER — Manages page list and coordinates annotation restore
// ============================================================
export function PdfViewer() {
  const { state, dispatch } = useAppState();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const fabricCanvasesRef = useRef<Map<number, fabric.Canvas>>(new Map());
  const pageReadyRef = useRef<Set<number>>(new Set());
  const loadingRef = useRef(false);

  // Cleanup on PDF change
  useEffect(() => {
    return () => {
      fabricCanvasesRef.current.forEach((fc) => { try { fc.off(); fc.dispose(); } catch(e) {} });
      fabricCanvasesRef.current.clear();
      pageReadyRef.current.clear();
    };
  }, [state.currentPDFPath]);

  // Load PDF
  useEffect(() => {
    if (!state.currentPDFPath) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    let cancelled = false;

    setLoading(true);
    setPages([]);
    dispatch({ type: 'SET_LOADING', payload: true });

    fetchPDF(state.currentPDFPath).then(async (data) => {
      if (cancelled) { loadingRef.current = false; return; }
      const doc = await pdfjsLib.getDocument({ data }).promise;
      pdfDocRef.current = doc;
      const pl: PageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: PDF_SCALE });
        pl.push({ pageNum: i, width: vp.width, height: vp.height });
      }
      if (!cancelled) {
        setPages(pl);
        setLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
        loadingRef.current = false;
      }
    }).catch(e => {
      console.error(e);
      if (!cancelled) {
        setLoading(false);
        dispatch({ type: 'SET_LOADING', payload: false });
        loadingRef.current = false;
      }
    });

    return () => { cancelled = true; loadingRef.current = false; };
  }, [state.currentPDFPath, dispatch]);

  // Restore annotations — only when page is ready
  useEffect(() => {
    const anns = state.annotations[state.currentPDF] || [];
    anns.forEach((ann) => {
      if (!pageReadyRef.current.has(ann.page)) return;
      const fc = fabricCanvasesRef.current.get(ann.page);
      if (!fc || !ann.objects || !ann.objects.length) return;
      fabric.util.enlivenObjects(ann.objects, (objects: fabric.Object[]) => {
        objects.forEach((o) => {
          o.set({ selectable: false, evented: false });
          (o as any)._annotationId = ann.id;
          fc.add(o);
        });
        fc.renderAll();
      });
    });
  }, [state.annotations, state.currentPDF, pages]);

  if (!state.currentPDFPath) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center">
        <div>
          <svg className="w-20 h-20 mx-auto mb-4 opacity-30" xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <h3 className="text-xl font-semibold text-white/50">Select a PDF to review</h3>
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
          pageReady={pageReadyRef.current}
          tool={state.tool}
          color={state.color}
          reviewer={state.reviewer}
          currentPDF={state.currentPDF}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

// ============================================================
// PAGE RENDERER — Single source of truth: fabricCanvases Map
// ============================================================
function PageRenderer({
  pageNum, width, height, pdfDoc, fabricCanvases, pageReady, tool, color, reviewer, currentPDF, dispatch,
}: PageInfo & {
  pdfDoc: any;
  fabricCanvases: Map<number, fabric.Canvas>;
  pageReady: Set<number>;
  tool: string;
  color: string;
  reviewer: string;
  currentPDF: string;
  dispatch: React.Dispatch<any>;
}) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasElRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const drawTimeoutRef = useRef<any>(null);
  const handlersRef = useRef<{ mouseup?: () => void; dblclick?: (e: MouseEvent) => void }>({});

  // Save drawings after debounce
  const scheduleSave = useCallback((page: number, annType: string, fc: fabric.Canvas) => {
    clearTimeout(drawTimeoutRef.current);
    drawTimeoutRef.current = setTimeout(() => {
      const objects = fc.getObjects();
      if (!objects.length) return;
      const serialized = objects.map(o => {
        const data = o.toJSON();
        data._annType = annType;
        return data;
      });
      const ann: Annotation = {
        id: 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        type: annType as any,
        page: page,
        status: 'open',
        comment: '',
        reviewer: reviewer || 'Anonymous',
        timestamp: new Date().toISOString(),
        color: color,
        objects: serialized,
      };
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
    }, 800);
  }, [reviewer, color, currentPDF, dispatch]);

  // FIX C: Correct highlight coordinates with canvas scale
  const createHighlight = useCallback((fc: fabric.Canvas, textLayer: HTMLElement) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) return;
    if (!sel || !textLayer.contains(sel.anchorNode)) return;

    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const tlRect = textLayer.getBoundingClientRect();
    const canvasScaleX = fc.getWidth() / tlRect.width;
    const canvasScaleY = fc.getHeight() / tlRect.height;
    const objects: any[] = [];

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const rect = new fabric.Rect({
        left: (r.left - tlRect.left) * canvasScaleX,
        top: (r.top - tlRect.top) * canvasScaleY,
        width: r.width * canvasScaleX,
        height: r.height * canvasScaleY,
        fill: color,
        selectable: false,
        evented: false,
        opacity: 0.5,
      });
      fc.add(rect);
      const objData = rect.toJSON();
      objData._annType = 'highlight';
      objects.push(objData);
    }
    fc.renderAll();

    const ann: Annotation = {
      id: 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      type: 'highlight',
      page: pageNum,
      status: 'open',
      comment: text.substring(0, 100),
      quotedText: text,
      reviewer: reviewer || 'Anonymous',
      timestamp: new Date().toISOString(),
      color: color,
      objects: objects,
    };
    dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
  }, [pageNum, color, reviewer, currentPDF, dispatch]);

  // FIX A: Properly managed event listeners
  useEffect(() => {
    if (!pdfDoc) return;
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

        // Text layer
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

        // FIX B: Single source of truth — fabricCanvases Map only
        const fabricCanvasEl = fabricCanvasElRef.current;
        if (fabricCanvasEl) {
          fabricCanvasEl.width = vp.width;
          fabricCanvasEl.height = vp.height;

          const oldFc = fabricCanvases.get(pageNum);
          if (oldFc) { oldFc.off(); oldFc.dispose(); }

          const fc = new fabric.Canvas(fabricCanvasEl, {
            selection: false,
            isDrawingMode: false,
            renderOnAddRemove: true,
          });

          (fc as any).lowerCanvasEl.style.pointerEvents = 'none';
          fabricCanvases.set(pageNum, fc);

          // Path created → save drawing
          fc.on('path:created', () => {
            scheduleSave(pageNum, 'drawing', fc);
          });

          // Apply current tool mode
          applyToolModeToCanvas(fc, tool, color);

          // FIX A: Clean event handlers
          const textLayerEl = textLayerRef.current;
          if (textLayerEl) {
            // Remove old handlers
            if (handlersRef.current.mouseup) {
              textLayerEl.removeEventListener('mouseup', handlersRef.current.mouseup);
            }
            if (handlersRef.current.dblclick) {
              textLayerEl.removeEventListener('dblclick', handlersRef.current.dblclick);
            }

            // Create new handlers
            const onMouseUp = () => {
              if (tool === 'highlight') createHighlight(fc, textLayerEl);
            };
            const onDblClick = (e: MouseEvent) => {
              if (tool !== 'comment') return;
              const rect = textLayerEl.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const comment = prompt('Add a note:');
              if (!comment) return;

              const canvasScaleX = fc.getWidth() / rect.width;
              const canvasScaleY = fc.getHeight() / rect.height;

              const marker = new fabric.Rect({
                left: x * canvasScaleX - 20,
                top: y * canvasScaleY - 20,
                width: 40, height: 40,
                fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4,
                selectable: false, evented: false,
              });
              fc.add(marker);
              fc.renderAll();

              const ann: Annotation = {
                id: 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
                type: 'comment',
                page: pageNum,
                status: 'open',
                comment: comment,
                reviewer: reviewer || 'Anonymous',
                timestamp: new Date().toISOString(),
                color: color,
                objects: [],
                x: Math.round(x * canvasScaleX),
                y: Math.round(y * canvasScaleY),
              };
              dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
            };

            textLayerEl.addEventListener('mouseup', onMouseUp);
            textLayerEl.addEventListener('dblclick', onDblClick);
            handlersRef.current = { mouseup: onMouseUp, dblclick: onDblClick };
          }

          // Mark page as ready
          pageReady.add(pageNum);
        }

      } catch (e) {
        console.error('Render error page', pageNum, e);
      }
    }

    render();

    // FIX A + B: Cleanup removes listeners AND disposes canvas
    return () => {
      cancelled = true;
      clearTimeout(drawTimeoutRef.current);

      const textLayerEl = textLayerRef.current;
      if (textLayerEl) {
        if (handlersRef.current.mouseup) {
          textLayerEl.removeEventListener('mouseup', handlersRef.current.mouseup);
        }
        if (handlersRef.current.dblclick) {
          textLayerEl.removeEventListener('dblclick', handlersRef.current.dblclick);
        }
      }

      const fc = fabricCanvases.get(pageNum);
      if (fc) { fc.off(); fc.dispose(); fabricCanvases.delete(pageNum); }
      pageReady.delete(pageNum);
    };
  }, [pdfDoc, pageNum]);

  // Update tool mode when tool/color changes
  useEffect(() => {
    const fc = fabricCanvases.get(pageNum);
    if (fc) applyToolModeToCanvas(fc, tool, color);
  }, [tool, color, pageNum, fabricCanvases]);

  return (
    <div className="page-wrapper relative bg-white flex-shrink-0 shadow-lg" style={{ width, height }} data-page={pageNum}>
      <canvas ref={pdfCanvasRef} className="block" />
      <div ref={textLayerRef} className="absolute top-0 left-0 z-10 overflow-hidden" />
      <canvas ref={fabricCanvasElRef} className="absolute top-0 left-0 z-20" />
      <div className="absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-30">
        Page {pageNum}
      </div>
    </div>
  );
}

// ============================================================
// TOOL MODE HELPER (pure function, no closure issues)
// ============================================================
function applyToolModeToCanvas(fc: fabric.Canvas, tool: string, color: string) {
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
  } else if (tool === 'rectangle') {
    el.style.pointerEvents = 'auto';
    fc.isDrawingMode = false;
    fc.selection = false;
  } else if (tool === 'comment') {
    el.style.pointerEvents = 'auto';
    fc.isDrawingMode = false;
    fc.selection = false;
  }
  fc.renderAll();
}
