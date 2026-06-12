import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { Annotation } from '../../core/types';
import { buildAnchor, createAnnotation, createVersion } from '../../core/annotationHelpers';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo { pageNum: number; width: number; height: number; }

export function PdfViewer() {
  var _a = useAppState(), state = _a.state, dispatch = _a.dispatch;
  var _b = useState<PageInfo[]>([]), pages = _b[0], setPages = _b[1];
  var _c = useState(false), loading = _c[0], setLoading = _c[1];
  var pdfDocRef = useRef<any>(null);
  var pageReadyRef = useRef<Set<number>>(new Set());
  var loadingRef = useRef(false);

  useEffect(function() {
    return function() { pageReadyRef.current.clear(); };
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
      return React.createElement(SvgPdfPage, {
        key: p.pageNum, pageNum: p.pageNum, width: p.width, height: p.height,
        pdfDoc: pdfDocRef.current, tool: state.tool, color: state.color,
        reviewer: state.reviewer, currentPDF: state.currentPDF, dispatch: dispatch,
        pageReadyRef: pageReadyRef,
        globalAnnotations: state.annotations[state.currentPDF] || [],
      });
    })
  );
}

// ============================================================
// SVG PDF PAGE — Resizable rects, draggable annotations, proper selection
// ============================================================
function SvgPdfPage(props: {
  pageNum: number; width: number; height: number;
  pdfDoc: any; tool: string; color: string; reviewer: string;
  currentPDF: string; dispatch: React.Dispatch<any>;
  pageReadyRef: React.MutableRefObject<Set<number>>;
  globalAnnotations: Annotation[];
}) {
  var pageNum = props.pageNum, width = props.width, height = props.height;
  var pdfDoc = props.pdfDoc, tool = props.tool, color = props.color;
  var reviewer = props.reviewer, currentPDF = props.currentPDF, dispatch = props.dispatch;
  var pageReadyRef = props.pageReadyRef, globalAnnotations = props.globalAnnotations;

  var containerRef = useRef<HTMLDivElement>(null);
  var canvasRef = useRef<HTMLCanvasElement>(null);
  var textLayerRef = useRef<HTMLDivElement>(null);
  var [annotations, setAnnotations] = useState<Annotation[]>([]);
  var [isDrawing, setIsDrawing] = useState(false);
  var [currentPath, setCurrentPath] = useState('');
  var [rendered, setRendered] = useState(false);
  var [dragging, setDragging] = useState<{ annId: string; objIdx: number; type: string; startX: number; startY: number; origX: number; origY: number; origW?: number; origH?: number; handle?: string } | null>(null);
  var vpRef = useRef<any>(null);
  var toolRef = useRef(tool); toolRef.current = tool;
  var colorRef = useRef(color); colorRef.current = color;
  var reviewerRef = useRef(reviewer); reviewerRef.current = reviewer;

  // Merge global annotations
  useEffect(function() {
    var merged: Annotation[] = [];
    var seen: Record<string, boolean> = {};
    for (var i = 0; i < globalAnnotations.length; i++) {
      if (globalAnnotations[i].page === pageNum) { merged.push(globalAnnotations[i]); seen[globalAnnotations[i].id] = true; }
    }
    for (var j = 0; j < annotations.length; j++) {
      if (!seen[annotations[j].id]) merged.push(annotations[j]);
    }
    setAnnotations(merged);
  }, [globalAnnotations, pageNum]);

  // Render PDF
  useEffect(function() {
    if (!pdfDoc || rendered) return;
    var cancelled = false;
    async function render() {
      try {
        var page = await pdfDoc.getPage(pageNum);
        var vp = page.getViewport({ scale: PDF_SCALE });
        vpRef.current = vp;
        if (cancelled) return;
        var cvs = canvasRef.current;
        if (cvs) { cvs.width = vp.width; cvs.height = vp.height; var ctx = cvs.getContext('2d'); if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise; }
        var textContent = await page.getTextContent();
        var tl = textLayerRef.current;
        if (tl) {
          tl.innerHTML = '';
          tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px';
          for (var t = 0; t < textContent.items.length; t++) {
            var it = textContent.items[t] as any; if (!it.str) continue;
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var fh = Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
            var span = document.createElement('span');
            span.textContent = it.str;
            span.style.cssText = 'left:'+tx[4]+'px;top:'+(tx[5]-fh)+'px;font-size:'+fh+'px;position:absolute;color:transparent;white-space:pre;cursor:text;font-family:sans-serif;';
            tl.appendChild(span);
          }
        }
        if (!cancelled) { setRendered(true); pageReadyRef.current.add(pageNum); }
      } catch(e) { console.error('Render error page', pageNum, e); }
    }
    render();
    return function() { cancelled = true; };
  }, [pdfDoc, pageNum, rendered]);

  // FIXED: Text selection for highlight tool
  var handleTextSelection = function() {
    if (toolRef.current !== 'highlight') return;
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text || !sel) return;
    var tl = textLayerRef.current;
    if (!tl || !tl.contains(sel.anchorNode)) return;
    var range = sel.getRangeAt(0);
    var rects = range.getClientRects();
    var tlRect = tl.getBoundingClientRect();
    var anchor = buildAnchor(pageNum, rects, tlRect, text);
    var sx = vpRef.current.width / tl.offsetWidth;
    var sy = vpRef.current.height / tl.offsetHeight;
    var objects: any[] = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      objects.push({ type: 'highlight', x: (r.left - tlRect.left) * sx, y: (r.top - tlRect.top) * sy, w: r.width * sx, h: r.height * sy });
    }
    var ann = createAnnotation(pageNum, 'highlight', reviewerRef.current, colorRef.current, {
      id: 'ver-' + Date.now(), timestamp: new Date().toISOString(), objects: objects, updatedBy: reviewerRef.current || 'Anonymous',
    }, anchor, text.substring(0, 100), text);
    var newAnns = annotations.concat([ann]);
    setAnnotations(newAnns);
    dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
    // Clear selection after creating highlight
    sel.removeAllRanges();
  };

  // Click handler for shapes and notes
  var handlePageClick = function(e: React.MouseEvent) {
    if (dragging) return;
    if (toolRef.current === 'select' || toolRef.current === 'draw' || toolRef.current === 'highlight') return;
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (toolRef.current === 'rectangle') {
      var newAnn = createAnnotation(pageNum, 'rectangle', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(), objects: [{ type: 'rectangle', x: x - 50, y: y - 30, w: 100, h: 60 }], updatedBy: reviewerRef.current || 'Anonymous',
      });
      setAnnotations(annotations.concat([newAnn]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
    } else if (toolRef.current === 'comment') {
      var comment = prompt('Add a note:');
      if (!comment) return;
      var newAnn2 = createAnnotation(pageNum, 'comment', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(), objects: [{ type: 'note', x: x, y: y, text: comment }], updatedBy: reviewerRef.current || 'Anonymous',
      }, undefined, comment);
      newAnn2.x = Math.round(x); newAnn2.y = Math.round(y);
      setAnnotations(annotations.concat([newAnn2]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn2 });
    }
  };

  // Drawing handlers
  var handleMouseDown = function(e: React.MouseEvent) {
    if (toolRef.current !== 'draw') return;
    setIsDrawing(true);
    var rect = containerRef.current!.getBoundingClientRect();
    setCurrentPath('M ' + (e.clientX - rect.left) + ' ' + (e.clientY - rect.top));
  };
  var handleMouseMove = function(e: React.MouseEvent) {
    if (dragging && dragging.type === 'move') {
      var rect = containerRef.current!.getBoundingClientRect();
      var dx = (e.clientX - rect.left) - dragging.startX;
      var dy = (e.clientY - rect.top) - dragging.startY;
      var newAnns = annotations.slice();
      var ann = newAnns.find(function(a) { return a.id === dragging!.annId; });
      if (ann && ann.objects && ann.objects[dragging.objIdx]) {
        var obj = ann.objects[dragging.objIdx];
        obj.x = dragging.origX + dx;
        obj.y = dragging.origY + dy;
        setAnnotations(newAnns);
      }
      return;
    }
    if (dragging && dragging.type === 'resize' && dragging.handle) {
      var rect2 = containerRef.current!.getBoundingClientRect();
      var dx2 = (e.clientX - rect2.left) - dragging.startX;
      var dy2 = (e.clientY - rect2.top) - dragging.startY;
      var newAnns2 = annotations.slice();
      var ann2 = newAnns2.find(function(a) { return a.id === dragging!.annId; });
      if (ann2 && ann2.objects && ann2.objects[dragging.objIdx]) {
        var obj2 = ann2.objects[dragging.objIdx];
        if (dragging.handle === 'se') { obj2.w = Math.max(20, (dragging.origW || 100) + dx2); obj2.h = Math.max(20, (dragging.origH || 60) + dy2); }
        if (dragging.handle === 'e') { obj2.w = Math.max(20, (dragging.origW || 100) + dx2); }
        if (dragging.handle === 's') { obj2.h = Math.max(20, (dragging.origH || 60) + dy2); }
        setAnnotations(newAnns2);
      }
      return;
    }
    if (!isDrawing || toolRef.current !== 'draw') return;
    var rect3 = containerRef.current!.getBoundingClientRect();
    setCurrentPath(function(prev) { return prev + ' L ' + (e.clientX - rect3.left) + ' ' + (e.clientY - rect3.top); });
  };
  var handleMouseUp = function(e: React.MouseEvent) {
    if (dragging) {
      var newAnns3 = annotations.slice();
      var ann3 = newAnns3.find(function(a) { return a.id === dragging!.annId; });
      if (ann3) {
        var version = createVersion(ann3.objects || [], reviewerRef.current, ann3.type, ann3.id);
        ann3.versions = (ann3.versions || []).concat([version]);
        ann3.currentVersion = (ann3.versions.length - 1);
        ann3.timestamp = version.timestamp;
      }
      setAnnotations(newAnns3);
      setDragging(null);
      return;
    }
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath) {
      var newAnn = createAnnotation(pageNum, 'drawing', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(), objects: [{ type: 'draw', path: currentPath }], updatedBy: reviewerRef.current || 'Anonymous',
      });
      setAnnotations(annotations.concat([newAnn]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
    }
    setCurrentPath('');
  };

  // Start dragging a shape or resize handle
  var startDrag = function(e: React.MouseEvent, annId: string, objIdx: number, dragType: string, handle?: string) {
    if (toolRef.current !== 'select') return;
    e.stopPropagation();
    var rect = containerRef.current!.getBoundingClientRect();
    var ann = annotations.find(function(a) { return a.id === annId; });
    if (!ann || !ann.objects || !ann.objects[objIdx]) return;
    var obj = ann.objects[objIdx];
    setDragging({
      annId: annId, objIdx: objIdx, type: dragType,
      startX: e.clientX - rect.left, startY: e.clientY - rect.top,
      origX: obj.x || 0, origY: obj.y || 0,
      origW: obj.w, origH: obj.h, handle: handle,
    });
  };

  // Delete annotation on double-click in select mode
  var handleDoubleClick = function(e: React.MouseEvent, annId: string) {
    if (toolRef.current !== 'select') return;
    e.stopPropagation();
    var newAnns = annotations.filter(function(a) { return a.id !== annId; });
    setAnnotations(newAnns);
    dispatch({ type: 'DELETE_ANNOTATION', pdf: currentPDF, id: annId });
  };

  // Render annotation objects into SVG
  var renderAnnotationObjects = function(ann: Annotation) {
    var objs = (ann.versions && ann.versions.length > 0 && ann.currentVersion >= 0)
      ? ann.versions[ann.currentVersion].objects
      : ann.objects;
    if (!objs) return null;

    return objs.map(function(obj, idx) {
      var objColor = ann.color || color;
      var fillColor = objColor.replace(/[\d.]+\)$/, '0.4)');

      // Resize handles for rectangles
      if (obj.type === 'rectangle') {
        return React.createElement('g', { key: ann.id + '-' + idx },
          React.createElement('rect', {
            x: obj.x, y: obj.y, width: obj.w || 100, height: obj.h || 60,
            fill: 'none', stroke: objColor.replace(/[\d.]+\)$/, '1)'), strokeWidth: 2,
            style: { cursor: toolRef.current === 'select' ? 'move' : 'default' },
            onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'move'); },
            onDoubleClick: function(e: React.MouseEvent) { handleDoubleClick(e, ann.id); },
          }),
          // Resize handles
          React.createElement('rect', { x: (obj.x + (obj.w || 100) - 8), y: (obj.y + (obj.h || 60) - 8), width: 8, height: 8, fill: 'white', stroke: objColor, strokeWidth: 1, style: { cursor: 'se-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 'se'); } }),
          React.createElement('rect', { x: (obj.x + (obj.w || 100) - 8), y: obj.y + ((obj.h || 60) / 2) - 4, width: 8, height: 8, fill: 'white', stroke: objColor, strokeWidth: 1, style: { cursor: 'e-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 'e'); } }),
          React.createElement('rect', { x: obj.x + ((obj.w || 100) / 2) - 4, y: (obj.y + (obj.h || 60) - 8), width: 8, height: 8, fill: 'white', stroke: objColor, strokeWidth: 1, style: { cursor: 's-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 's'); } })
        );
      }

      // Highlights
      if (obj.type === 'highlight') {
        return React.createElement('rect', {
          key: ann.id + '-' + idx,
          x: obj.x, y: obj.y, width: obj.w, height: obj.h,
          fill: fillColor,
          style: { mixBlendMode: 'multiply', pointerEvents: 'none' },
        });
      }

      // Drawings
      if (obj.type === 'draw') {
        return React.createElement('path', {
          key: ann.id + '-' + idx,
          d: obj.path,
          fill: 'none', stroke: objColor.replace(/[\d.]+\)$/, '1)'), strokeWidth: 3,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          style: { pointerEvents: 'none' },
        });
      }

      return null;
    });
  };

  return React.createElement('div', {
    ref: containerRef,
    className: 'page-wrapper',
    style: {
      position: 'relative', width: width + 'px', height: height + 'px',
      margin: '0 auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      background: 'white', flexShrink: 0,
      userSelect: tool === 'select' || tool === 'highlight' ? 'text' : 'none',
    },
    onClick: handlePageClick,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    'data-page': pageNum,
  },
    // LAYER 1: PDF Canvas
    React.createElement('canvas', { ref: canvasRef, style: { display: 'block', pointerEvents: 'none' } }),

    // LAYER 2: Text selection layer
    React.createElement('div', {
      ref: textLayerRef,
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden', zIndex: 2,
        pointerEvents: tool === 'select' || tool === 'highlight' ? 'auto' : 'none',
        lineHeight: 1.0,
      },
      onMouseUp: handleTextSelection,
    }),

    // LAYER 3: SVG annotation layer
    React.createElement('svg', {
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: tool === 'select' || tool === 'rectangle' || tool === 'comment' ? 'auto' : 'none' },
    },
      annotations.map(function(ann) { return renderAnnotationObjects(ann); }),
      isDrawing ? React.createElement('path', { d: currentPath, fill: 'none', stroke: color.replace(/[\d.]+\)$/, '1)'), strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none' }) : null
    ),

    // LAYER 3.5: HTML Notes — FIXED: use annotation color
    React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 },
    },
      annotations.filter(function(a) { return a.type === 'comment'; }).map(function(note) {
        var noteColor = note.color || color;
        var bgColor = noteColor.replace(/[\d.]+\)$/, '0.15)');
        var borderColor = noteColor.replace(/[\d.]+\)$/, '1)');
        return React.createElement('div', {
          key: note.id,
          style: {
            position: 'absolute',
            top: (note.y || 0) + 'px', left: (note.x || 0) + 'px',
            background: bgColor, border: '2px solid ' + borderColor,
            padding: '6px 8px', borderRadius: '6px', fontSize: '12px',
            pointerEvents: tool === 'select' ? 'auto' : 'none',
            maxWidth: '180px', boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
            zIndex: 5, cursor: tool === 'select' ? 'move' : 'default',
          },
          onMouseDown: function(e: React.MouseEvent) {
            if (tool !== 'select') return;
            var ann = annotations.find(function(a) { return a.id === note.id; });
            if (!ann) return;
            var objIdx = 0;
            startDrag(e, note.id, objIdx, 'move');
          },
          onDoubleClick: function(e: React.MouseEvent) { handleDoubleClick(e, note.id); },
        }, note.comment);
      })
    ),

    // Page label
    React.createElement('div', {
      style: { position: 'absolute', bottom: '8px', right: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 10 },
    }, 'Page ' + pageNum)
  );
}
