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

export function PdfViewer() {
  const { state, dispatch } = useAppState();
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const fabricCanvasesRef = useRef<Map<number, fabric.Canvas>>(new Map());
  const pageReadyRef = useRef<Set<number>>(new Set());
  const loadingRef = useRef(false);

  useEffect(function() {
    return function() {
      fabricCanvasesRef.current.forEach(function(fc) { try { fc.off(); fc.dispose(); } catch(e) {} });
      fabricCanvasesRef.current.clear();
      pageReadyRef.current.clear();
    };
  }, [state.currentPDFPath]);

  useEffect(function() {
    if (!state.currentPDFPath) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    var cancelled = false;
    setLoading(true);
    setPages([]);
    dispatch({ type: 'SET_LOADING', payload: true });

    fetchPDF(state.currentPDFPath).then(async function(data) {
      if (cancelled) { loadingRef.current = false; return; }
      var doc = await pdfjsLib.getDocument({ data: data }).promise;
      pdfDocRef.current = doc;
      var pl: PageInfo[] = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var page = await doc.getPage(i);
        var vp = page.getViewport({ scale: PDF_SCALE });
        pl.push({ pageNum: i, width: vp.width, height: vp.height });
      }
      if (!cancelled) { setPages(pl); setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); loadingRef.current = false; }
    }).catch(function(e) { console.error(e); if (!cancelled) { setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); loadingRef.current = false; } });
    return function() { cancelled = true; loadingRef.current = false; };
  }, [state.currentPDFPath, dispatch]);

  // Restore annotations — only when pages are ready
  useEffect(function() {
    var anns = state.annotations[state.currentPDF] || [];
    anns.forEach(function(ann) {
      if (!pageReadyRef.current.has(ann.page)) return;
      var fc = fabricCanvasesRef.current.get(ann.page);
      if (!fc || !ann.objects || !ann.objects.length) return;
      fabric.util.enlivenObjects(ann.objects, function(objects: fabric.Object[]) {
        objects.forEach(function(o) { o.set({ selectable: false, evented: false }); (o as any)._annotationId = ann.id; fc.add(o); });
        fc.renderAll();
      });
    });
  }, [state.annotations, state.currentPDF, pages]);

  if (!state.currentPDFPath) {
    return React.createElement('div', { className: 'flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center' },
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-xl font-semibold text-white/50' }, 'Select a PDF to review')
      )
    );
  }
  if (loading) {
    return React.createElement('div', { className: 'flex-1 flex items-center justify-center bg-[#525659]' },
      React.createElement('span', { className: 'loading loading-spinner loading-lg text-white/50' })
    );
  }
  return React.createElement('div', { className: 'flex-1 overflow-y-auto bg-[#525659] py-5 flex flex-col items-center gap-4' },
    pages.map(function(p) {
      return React.createElement(PageRenderer, {
        key: p.pageNum, pageNum: p.pageNum, width: p.width, height: p.height,
        pdfDoc: pdfDocRef.current, fabricCanvases: fabricCanvasesRef.current,
        pageReadyRef: pageReadyRef, tool: state.tool, color: state.color,
        reviewer: state.reviewer, currentPDF: state.currentPDF, dispatch: dispatch,
      });
    })
  );
}

// ============================================================
// PAGE RENDERER
// ============================================================
function PageRenderer(props: PageInfo & {
  pdfDoc: any; fabricCanvases: React.RefObject<Map<number, fabric.Canvas>>;
  pageReadyRef: React.RefObject<Set<number>>; tool: string; color: string;
  reviewer: string; currentPDF: string; dispatch: React.Dispatch<any>;
}) {
  var pageNum = props.pageNum, width = props.width, height = props.height;
  var pdfDoc = props.pdfDoc, fabricCanvases = props.fabricCanvases;
  var pageReadyRef = props.pageReadyRef, tool = props.tool, color = props.color;
  var reviewer = props.reviewer, currentPDF = props.currentPDF, dispatch = props.dispatch;

  var pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  var fabricCanvasElRef = useRef<HTMLCanvasElement>(null);
  var textLayerRef = useRef<HTMLDivElement>(null);
  var drawTimeoutRef = useRef<any>(null);
  var handlersRef = useRef<{ mouseup: any; dblclick: any }>({ mouseup: null, dblclick: null });
  var toolRef = useRef(tool);
  var colorRef = useRef(color);
  var reviewerRef = useRef(reviewer);
  toolRef.current = tool;
  colorRef.current = color;
  reviewerRef.current = reviewer;

  var scheduleSave = useCallback(function(page: number, annType: string, fc: fabric.Canvas) {
    clearTimeout(drawTimeoutRef.current);
    drawTimeoutRef.current = setTimeout(function() {
      var objects = fc.getObjects();
      if (!objects.length) return;
      var serialized = objects.map(function(o) { var d = o.toJSON(); (d as any)._annType = annType; return d; });
      var ann: Annotation = { id: 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2,6), type: annType as any, page: page, status: 'open', comment: '', reviewer: reviewerRef.current || 'Anonymous', timestamp: new Date().toISOString(), color: colorRef.current, objects: serialized };
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
    }, 800);
  }, [currentPDF, dispatch]);

  // FIX #2 + #3: Create Fabric canvas ONCE per page, never recreate
  // FIX #1 + #4: Stable event handlers with proper cleanup
  useEffect(function() {
    if (!pdfDoc) return;
    var cancelled = false;

    async function render() {
      try {
        var page = await pdfDoc.getPage(pageNum);
        var vp = page.getViewport({ scale: PDF_SCALE });
        if (cancelled) return;

        // PDF canvas
        var pdfCanvas = pdfCanvasRef.current;
        if (pdfCanvas) { pdfCanvas.width = vp.width; pdfCanvas.height = vp.height; var ctx = pdfCanvas.getContext('2d'); if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise; }

        // Text layer
        var textContent = await page.getTextContent();
        var textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = vp.width + 'px'; textLayer.style.height = vp.height + 'px';
          var items = textContent.items;
          for (var t = 0; t < items.length; t++) {
            var it = items[t] as any; if (!it.str) continue;
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var fh = Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
            var span = document.createElement('span'); span.textContent = it.str;
            span.style.cssText = 'left:'+tx[4]+'px;top:'+(tx[5]-fh)+'px;font-size:'+fh+'px;position:absolute;color:transparent;white-space:pre;cursor:text;';
            textLayer.appendChild(span);
          }
        }

        // FIX #2: Fabric canvas — create ONCE, only resize on re-render
        var fabricCanvasEl = fabricCanvasElRef.current;
        if (fabricCanvasEl) {
          fabricCanvasEl.width = vp.width;
          fabricCanvasEl.height = vp.height;

          var fc = fabricCanvases.current.get(pageNum);
          if (!fc) {
            fc = new fabric.Canvas(fabricCanvasEl, { selection: false, isDrawingMode: false, renderOnAddRemove: true });
            (fc as any).lowerCanvasEl.style.pointerEvents = 'none';
            fc.on('path:created', function() { scheduleSave(pageNum, 'drawing', fc!); });
            fabricCanvases.current.set(pageNum, fc);
          } else {
            fc.setWidth(vp.width);
            fc.setHeight(vp.height);
          }

          // FIX #1: Stable event handlers using refs, with proper cleanup
          var textLayerEl = textLayerRef.current;
          if (textLayerEl) {
            // Remove previous handlers
            if (handlersRef.current.mouseup) textLayerEl.removeEventListener('mouseup', handlersRef.current.mouseup);
            if (handlersRef.current.dblclick) textLayerEl.removeEventListener('dblclick', handlersRef.current.dblclick);

            // Create new handlers (use refs for current values)
            var onMouseUp = function() {
              var currentTool = toolRef.current;
              if (currentTool !== 'highlight') return;
              var sel = window.getSelection(); var text = sel ? sel.toString().trim() : '';
              if (!text || !sel || !textLayerEl!.contains(sel.anchorNode)) return;
              var range = sel.getRangeAt(0); var rects = range.getClientRects();
              var tlRect = textLayerEl!.getBoundingClientRect();
              var sx = fc!.getWidth() / tlRect.width; var sy = fc!.getHeight() / tlRect.height;
              var objects: any[] = [];
              for (var i = 0; i < rects.length; i++) {
                var r = rects[i];
                var rect = new fabric.Rect({ left: (r.left-tlRect.left)*sx, top: (r.top-tlRect.top)*sy, width: r.width*sx, height: r.height*sy, fill: colorRef.current, selectable: false, evented: false, opacity: 0.5 });
                fc!.add(rect); var od = rect.toJSON(); (od as any)._annType = 'highlight'; objects.push(od);
              }
              fc!.renderAll();
              dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: { id: 'ann-'+Date.now()+'-'+Math.random().toString(36).substr(2,6), type: 'highlight', page: pageNum, status: 'open', comment: text.substring(0,100), quotedText: text, reviewer: reviewerRef.current||'Anonymous', timestamp: new Date().toISOString(), color: colorRef.current, objects: objects } });
            };

            var onDblClick = function(e: MouseEvent) {
              var currentTool = toolRef.current;
              if (currentTool !== 'comment') return;
              var rect = textLayerEl!.getBoundingClientRect(); var x = e.clientX - rect.left; var y = e.clientY - rect.top;
              var comment = prompt('Add a note:'); if (!comment) return;
              var sx = fc!.getWidth() / rect.width; var sy = fc!.getHeight() / rect.height;
              var marker = new fabric.Rect({ left: x*sx-20, top: y*sy-20, width: 40, height: 40, fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4, selectable: false, evented: false });
              fc!.add(marker); fc!.renderAll();
              dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: { id: 'ann-'+Date.now()+'-'+Math.random().toString(36).substr(2,6), type: 'comment', page: pageNum, status: 'open', comment: comment, reviewer: reviewerRef.current||'Anonymous', timestamp: new Date().toISOString(), color: colorRef.current, objects: [], x: Math.round(x*sx), y: Math.round(y*sy) } });
            };

            textLayerEl.addEventListener('mouseup', onMouseUp);
            textLayerEl.addEventListener('dblclick', onDblClick);
            handlersRef.current = { mouseup: onMouseUp, dblclick: onDblClick };
          }

          applyToolModeToCanvas(fc, tool, color);
          // FIX #3: Use ref to mutate
          pageReadyRef.current.add(pageNum);
        }
      } catch(e) { console.error('Render error page', pageNum, e); }
    }

    render();

    return function() {
      cancelled = true;
      clearTimeout(drawTimeoutRef.current);
      var tl = textLayerRef.current;
      if (tl) {
        if (handlersRef.current.mouseup) tl.removeEventListener('mouseup', handlersRef.current.mouseup);
        if (handlersRef.current.dblclick) tl.removeEventListener('dblclick', handlersRef.current.dblclick);
      }
      // Do NOT dispose fabric canvas here — it persists across re-renders
    };
  }, [pdfDoc, pageNum, scheduleSave, dispatch, currentPDF, tool, color]);

  // Cleanup on unmount only
  useEffect(function() {
    return function() {
      clearTimeout(drawTimeoutRef.current);
      var fc = fabricCanvases.current.get(pageNum);
      if (fc) { fc.off(); fc.dispose(); fabricCanvases.current.delete(pageNum); }
      pageReadyRef.current.delete(pageNum);
    };
  }, []);

  // Update tool mode when tool/color changes
  useEffect(function() {
    var fc = fabricCanvases.current.get(pageNum);
    if (fc) applyToolModeToCanvas(fc, tool, color);
  }, [tool, color, pageNum, fabricCanvases]);

  return React.createElement('div', { className: 'page-wrapper relative bg-white flex-shrink-0 shadow-lg', style: { width: width, height: height }, 'data-page': pageNum },
    React.createElement('canvas', { ref: pdfCanvasRef, className: 'block' }),
    React.createElement('div', { ref: textLayerRef, className: 'absolute top-0 left-0 z-10 overflow-hidden' }),
    React.createElement('canvas', { ref: fabricCanvasElRef, className: 'absolute top-0 left-0 z-20' }),
    React.createElement('div', { className: 'absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-30' }, 'Page ' + pageNum)
  );
}

function applyToolModeToCanvas(fc: fabric.Canvas, tool: string, color: string) {
  var el = (fc as any).lowerCanvasEl as HTMLElement; if (!el) return;
  if (tool === 'select' || tool === 'highlight') { el.style.pointerEvents = 'none'; fc.isDrawingMode = false; fc.selection = false; }
  else if (tool === 'draw') { el.style.pointerEvents = 'auto'; fc.isDrawingMode = true; fc.selection = false; (fc as any).freeDrawingBrush.color = color.replace(/[\d.]+\)$/,'1)'); (fc as any).freeDrawingBrush.width = 3; }
  else { el.style.pointerEvents = 'auto'; fc.isDrawingMode = false; fc.selection = false; }
  fc.renderAll();
}
