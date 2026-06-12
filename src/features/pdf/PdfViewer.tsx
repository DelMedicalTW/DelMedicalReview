import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { fabric } from 'fabric';
import { Annotation } from '../../core/types';
import {
  createVersion, buildAnchor, drawAnchor, createAnnotation, getLatestVersion,
} from '../../core/annotationHelpers';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo { pageNum: number; width: number; height: number; }

export function PdfViewer() {
  var _a = useAppState(), state = _a.state, dispatch = _a.dispatch;
  var _b = useState<PageInfo[]>([]), pages = _b[0], setPages = _b[1];
  var _c = useState(false), loading = _c[0], setLoading = _c[1];
  var pdfDocRef = useRef<any>(null);
  var fabricCanvasesRef = useRef<Map<number, fabric.Canvas>>(new Map());
  var pageReadyRef = useRef<Set<number>>(new Set());
  var renderedAnnsRef = useRef<Set<string>>(new Set());
  var loadingRef = useRef(false);

  useEffect(function() {
    return function() {
      fabricCanvasesRef.current.forEach(function(fc) { try { fc.off(); fc.dispose(); } catch(e) {} });
      fabricCanvasesRef.current.clear();
      pageReadyRef.current.clear();
      renderedAnnsRef.current.clear();
    };
  }, [state.currentPDFPath]);

  useEffect(function() {
    if (!state.currentPDFPath) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    var cancelled = false;
    setLoading(true); setPages([]);
    dispatch({ type: 'SET_LOADING', payload: true });
    fetchPDF(state.currentPDFPath).then(async function(data) {
      if (cancelled) { loadingRef.current = false; return; }
      var doc = await pdfjsLib.getDocument({ data: data }).promise;
      pdfDocRef.current = doc;
      var pl: PageInfo[] = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var pg = await doc.getPage(i);
        var vp = pg.getViewport({ scale: PDF_SCALE });
        pl.push({ pageNum: i, width: vp.width, height: vp.height });
      }
      if (!cancelled) { setPages(pl); setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); loadingRef.current = false; }
    }).catch(function(e) { console.error(e); if (!cancelled) { setLoading(false); dispatch({ type: 'SET_LOADING', payload: false }); loadingRef.current = false; } });
    return function() { cancelled = true; loadingRef.current = false; };
  }, [state.currentPDFPath, dispatch]);

  // Restore annotations — render latest version only, use anchored rendering
  useEffect(function() {
    var anns = state.annotations[state.currentPDF] || [];
    for (var i = 0; i < anns.length; i++) {
      var ann = anns[i];
      if (!pageReadyRef.current.has(ann.page)) continue;
      if (renderedAnnsRef.current.has(ann.id)) continue;
      var fc = fabricCanvasesRef.current.get(ann.page);
      if (!fc) continue;
      renderedAnnsRef.current.add(ann.id);
      var latest = getLatestVersion(ann);
      if (!latest.objects || !latest.objects.length) continue;
      (fabric.util as any).enlivenObjects(latest.objects, function(objects: any[]) {
        for (var j = 0; j < objects.length; j++) {
          objects[j].set({ selectable: false, evented: false });
          fc.add(objects[j]);
        }
        fc.renderAll();
      });
    }
  }, [state.annotations, state.currentPDF, pages]);

  if (!state.currentPDFPath) {
    return React.createElement('div', { className: 'flex-1 flex items-center justify-center bg-[#525659] text-white/40 text-center' },
      React.createElement('h3', { className: 'text-xl font-semibold text-white/50' }, 'Select a PDF to review')
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
        pdfDoc: pdfDocRef.current,
        fabricCanvases: fabricCanvasesRef,
        pageReadyRef: pageReadyRef,
        tool: state.tool, color: state.color,
        reviewer: state.reviewer, currentPDF: state.currentPDF, dispatch: dispatch,
      });
    })
  );
}

// ============================================================
// PAGE RENDERER
// ============================================================
function PageRenderer(props: {
  pageNum: number; width: number; height: number;
  pdfDoc: any;
  fabricCanvases: React.MutableRefObject<Map<number, fabric.Canvas>>;
  pageReadyRef: React.MutableRefObject<Set<number>>;
  tool: string; color: string;
  reviewer: string; currentPDF: string; dispatch: React.Dispatch<any>;
}) {
  var pageNum = props.pageNum, width = props.width, height = props.height;
  var pdfDoc = props.pdfDoc, fabricCanvases = props.fabricCanvases;
  var pageReadyRef = props.pageReadyRef;
  var tool = props.tool, color = props.color;
  var reviewer = props.reviewer, currentPDF = props.currentPDF, dispatch = props.dispatch;

  var pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  var fabricCanvasElRef = useRef<HTMLCanvasElement>(null);
  var textLayerRef = useRef<HTMLDivElement>(null);
  var drawTimeoutRef = useRef<any>(null);
  var handlersRef = useRef<{ mouseup: any; dblclick: any }>({ mouseup: null, dblclick: null });
  var pathHandlerRef = useRef<any>(null);
  var fcRef = useRef<fabric.Canvas | null>(null);
  var vpRef = useRef<any>(null);
  var toolRef = useRef(tool);
  var colorRef = useRef(color);
  var reviewerRef = useRef(reviewer);
  toolRef.current = tool;
  colorRef.current = color;
  reviewerRef.current = reviewer;

  var scheduleSave = useCallback(function(page: number, annType: string, fc: fabric.Canvas, existing?: Annotation) {
    clearTimeout(drawTimeoutRef.current);
    drawTimeoutRef.current = setTimeout(function() {
      var version = createVersion(fc, reviewerRef.current, existing);
      var ann: Annotation = existing
        ? {
            ...existing,
            objects: version.objects,
            versions: existing.versions.concat([version]),
            currentVersion: existing.versions.length,
            timestamp: version.timestamp,
            comment: existing.comment,
          }
        : createAnnotation(page, annType, reviewerRef.current, colorRef.current, version);
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
    }, 600);
  }, [currentPDF, dispatch]);

  useEffect(function() {
    if (!pdfDoc) return;
    var cancelled = false;
    async function render() {
      try {
        var page = await pdfDoc.getPage(pageNum);
        var vp = page.getViewport({ scale: PDF_SCALE });
        vpRef.current = vp;
        if (cancelled) return;

        var pdfCanvas = pdfCanvasRef.current;
        if (pdfCanvas) { pdfCanvas.width = vp.width; pdfCanvas.height = vp.height; var ctx = pdfCanvas.getContext('2d'); if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise; }

        var textContent = await page.getTextContent();
        var textLayer = textLayerRef.current;
        if (textLayer) {
          textLayer.innerHTML = '';
          textLayer.style.width = vp.width + 'px'; textLayer.style.height = vp.height + 'px';
          for (var t = 0; t < textContent.items.length; t++) {
            var it = textContent.items[t] as any; if (!it.str) continue;
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var fh = Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
            var span = document.createElement('span'); span.textContent = it.str;
            span.style.cssText = 'left:'+tx[4]+'px;top:'+(tx[5]-fh)+'px;font-size:'+fh+'px;position:absolute;color:transparent;white-space:pre;cursor:text;';
            textLayer.appendChild(span);
          }
        }

        var fabricCanvasEl = fabricCanvasElRef.current;
        if (fabricCanvasEl) {
          fabricCanvasEl.width = vp.width; fabricCanvasEl.height = vp.height;
          var fc = fabricCanvases.current.get(pageNum);
          if (!fc) {
            fc = new fabric.Canvas(fabricCanvasEl, { selection: false, isDrawingMode: false, renderOnAddRemove: true });
            fc.selection = false; fc.skipTargetFind = true;
            fabricCanvases.current.set(pageNum, fc); fcRef.current = fc;
            if (pathHandlerRef.current) fc.off('path:created', pathHandlerRef.current);
            pathHandlerRef.current = function() { scheduleSave(pageNum, 'drawing', fc!); };
            fc.on('path:created', pathHandlerRef.current);
          } else { fc.setWidth(vp.width); fc.setHeight(vp.height); fcRef.current = fc; }

          applyToolMode(fc, tool, color);
          fc.renderAll();
          pageReadyRef.current.add(pageNum);

          var textLayerEl = textLayerRef.current;
          if (textLayerEl && !handlersRef.current.mouseup) {
            var onMouseUp = function() {
              var ct = toolRef.current; if (ct !== 'highlight') return;
              var sel = window.getSelection(); var txt = sel ? sel.toString().trim() : '';
              if (!txt || !sel || !textLayerEl!.contains(sel.anchorNode)) return;
              var range = sel.getRangeAt(0); var rects = range.getClientRects();
              var tlRect = textLayerEl!.getBoundingClientRect();
              var thisFc = fcRef.current; if (!thisFc) return;
              var sx = vpRef.current.width / textLayerEl!.offsetWidth;
              var sy = vpRef.current.height / textLayerEl!.offsetHeight;
              var objects: any[] = [];
              for (var i = 0; i < rects.length; i++) {
                var r = rects[i];
                var left = (r.left - tlRect.left) * sx, top = (r.top - tlRect.top) * sy;
                var w = r.width * sx, h = r.height * sy;
                var rect = new fabric.Rect({ left: left, top: top, width: w, height: h, fill: colorRef.current, selectable: false, evented: false, opacity: 0.5 });
                thisFc.add(rect); objects.push(rect.toJSON());
              }
              thisFc.renderAll();
              var version = createVersion(thisFc, reviewerRef.current);
              var anchor = buildAnchor(pageNum, rects, tlRect, txt);
              var ann = createAnnotation(pageNum, 'highlight', reviewerRef.current, colorRef.current, version, anchor, txt.substring(0, 100), txt);
              dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
            };
            var onDblClick = function(e: MouseEvent) {
              var ct = toolRef.current; if (ct !== 'comment') return;
              var thisFc = fcRef.current; if (!thisFc) return;
              var tlRect = textLayerEl!.getBoundingClientRect();
              var sx = vpRef.current.width / textLayerEl!.offsetWidth;
              var sy = vpRef.current.height / textLayerEl!.offsetHeight;
              var x = (e.clientX - tlRect.left) * sx, y = (e.clientY - tlRect.top) * sy;
              var comment = prompt('Add a note:'); if (!comment) return;
              var marker = new fabric.Rect({ left: x-20, top: y-20, width: 40, height: 40, fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4, selectable: false, evented: false });
              thisFc.add(marker); thisFc.renderAll();
              var version = createVersion(thisFc, reviewerRef.current);
              var ann = createAnnotation(pageNum, 'comment', reviewerRef.current, colorRef.current, version, undefined, comment);
              ann.x = Math.round(x); ann.y = Math.round(y);
              dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
            };
            textLayerEl.addEventListener('mouseup', onMouseUp);
            textLayerEl.addEventListener('dblclick', onDblClick);
            handlersRef.current = { mouseup: onMouseUp, dblclick: onDblClick };
          }
        }
      } catch(e) { console.error('Render error page', pageNum, e); }
    }
    render();
    return function() { cancelled = true; clearTimeout(drawTimeoutRef.current); };
  }, [pdfDoc, pageNum]);

  useEffect(function() {
    return function() {
      clearTimeout(drawTimeoutRef.current);
      var tl = textLayerRef.current;
      if (tl) { if (handlersRef.current.mouseup) tl.removeEventListener('mouseup', handlersRef.current.mouseup); if (handlersRef.current.dblclick) tl.removeEventListener('dblclick', handlersRef.current.dblclick); }
      var fc = fabricCanvases.current.get(pageNum);
      if (fc) { if (pathHandlerRef.current) fc.off('path:created', pathHandlerRef.current); fc.off(); fc.dispose(); fabricCanvases.current.delete(pageNum); }
      pageReadyRef.current.delete(pageNum);
      handlersRef.current = { mouseup: null, dblclick: null }; pathHandlerRef.current = null; fcRef.current = null;
    };
  }, []);

  useEffect(function() { var fc = fabricCanvases.current.get(pageNum); if (fc) applyToolMode(fc, tool, color); }, [tool, color, pageNum]);

  return React.createElement('div', { className: 'page-wrapper relative bg-white flex-shrink-0 shadow-lg', style: { width: width, height: height }, 'data-page': pageNum },
    React.createElement('canvas', { ref: pdfCanvasRef, className: 'block' }),
    React.createElement('div', { ref: textLayerRef, className: 'absolute top-0 left-0 z-10 overflow-hidden' }),
    React.createElement('canvas', { ref: fabricCanvasElRef, className: 'absolute top-0 left-0 z-20' }),
    React.createElement('div', { className: 'absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-30' }, 'Page ' + pageNum)
  );
}

function applyToolMode(fc: fabric.Canvas, tool: string, color: string) {
  var el = fc.getElement() as HTMLElement; if (!el) return;
  if (tool === 'select' || tool === 'highlight') { fc.isDrawingMode = false; fc.selection = false; fc.skipTargetFind = true; el.style.pointerEvents = 'auto'; }
  else if (tool === 'draw') { fc.isDrawingMode = true; fc.selection = false; fc.skipTargetFind = false; el.style.pointerEvents = 'auto'; (fc as any).freeDrawingBrush.color = color.replace(/[\d.]+\)$/,'1)'); (fc as any).freeDrawingBrush.width = 3; }
  else { fc.isDrawingMode = false; fc.selection = false; fc.skipTargetFind = false; el.style.pointerEvents = 'auto'; }
  fc.renderAll();
}
