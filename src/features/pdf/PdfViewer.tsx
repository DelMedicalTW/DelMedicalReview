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
// SVG PDF PAGE
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
  var [isRectDrawing, setIsRectDrawing] = useState(false);
  var [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  var [rectCurrent, setRectCurrent] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  var [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  var [editingNoteText, setEditingNoteText] = useState('');
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

  // FIXED: Highlight only on mouseup, not during drag
  var lastHighlightTime = useRef(0);
  var handleTextSelection = function() {
    if (toolRef.current !== 'highlight') return;
    var now = Date.now();
    if (now - lastHighlightTime.current < 300) return; // Debounce
    lastHighlightTime.current = now;
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
    setAnnotations(annotations.concat([ann]));
    dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
    sel.removeAllRanges();
  };

  // FIXED: Rectangle — click and drag to size
  var handleMouseDown = function(e: React.MouseEvent) {
    if (dragging) return;
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (toolRef.current === 'rectangle') {
      setIsRectDrawing(true);
      setRectStart({ x: x, y: y });
      setRectCurrent({ x: x, y: y, w: 0, h: 0 });
      return;
    }
    if (toolRef.current === 'draw') {
      setIsDrawing(true);
      setCurrentPath('M ' + x + ' ' + y);
      return;
    }
    if (toolRef.current === 'comment') {
      var newAnn = createAnnotation(pageNum, 'comment', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(), objects: [], updatedBy: reviewerRef.current || 'Anonymous',
      }, undefined, '');
      newAnn.x = Math.round(x);
      newAnn.y = Math.round(y);
      setAnnotations(annotations.concat([newAnn]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
      // Auto-open for editing
      setEditingNoteId(newAnn.id);
      setEditingNoteText('');
      return;
    }
  };

  var handleMouseMove = function(e: React.MouseEvent) {
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    // Rectangle drawing
    if (isRectDrawing && rectStart) {
      var left = Math.min(rectStart.x, x);
      var top = Math.min(rectStart.y, y);
      var w = Math.abs(x - rectStart.x);
      var h = Math.abs(y - rectStart.y);
      setRectCurrent({ x: left, y: top, w: w, h: h });
      return;
    }
    // Moving / resizing
    if (dragging && dragging.type === 'move') {
      var dx = x - dragging.startX;
      var dy = y - dragging.startY;
      var newAnns = annotations.slice();
      var ann = newAnns.find(function(a) { return a.id === dragging!.annId; });
      if (ann) {
        if (ann.type === 'comment') { ann.x = (dragging.origX + dx); ann.y = (dragging.origY + dy); }
        else if (ann.objects && ann.objects[dragging.objIdx]) {
          ann.objects[dragging.objIdx].x = dragging.origX + dx;
          ann.objects[dragging.objIdx].y = dragging.origY + dy;
        }
        setAnnotations(newAnns);
      }
      return;
    }
    if (dragging && dragging.type === 'resize' && dragging.handle) {
      var dx2 = x - dragging.startX;
      var dy2 = y - dragging.startY;
      var newAnns2 = annotations.slice();
      var ann2 = newAnns2.find(function(a) { return a.id === dragging!.annId; });
      if (ann2 && ann2.objects && ann2.objects[dragging.objIdx]) {
        var obj = ann2.objects[dragging.objIdx];
        if (dragging.handle === 'se') { obj.w = Math.max(20, (dragging.origW || 100) + dx2); obj.h = Math.max(20, (dragging.origH || 60) + dy2); }
        if (dragging.handle === 'e') { obj.w = Math.max(20, (dragging.origW || 100) + dx2); }
        if (dragging.handle === 's') { obj.h = Math.max(20, (dragging.origH || 60) + dy2); }
        setAnnotations(newAnns2);
      }
      return;
    }
    // Drawing
    if (isDrawing && toolRef.current === 'draw') {
      setCurrentPath(function(prev) { return prev + ' L ' + x + ' ' + y; });
    }
  };

  var handleMouseUp = function(e: React.MouseEvent) {
    // Finish rectangle
    if (isRectDrawing && rectCurrent && rectCurrent.w > 5 && rectCurrent.h > 5) {
      var newAnn = createAnnotation(pageNum, 'rectangle', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type: 'rectangle', x: rectCurrent.x, y: rectCurrent.y, w: rectCurrent.w, h: rectCurrent.h }],
        updatedBy: reviewerRef.current || 'Anonymous',
      });
      setAnnotations(annotations.concat([newAnn]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
    }
    setIsRectDrawing(false);
    setRectStart(null);
    setRectCurrent(null);

    // Finish drag
    if (dragging) {
      var newAnns3 = annotations.slice();
      var ann3 = newAnns3.find(function(a) { return a.id === dragging!.annId; });
      if (ann3 && ann3.type !== 'comment') {
        var version = createVersion(ann3.objects || [], reviewerRef.current, ann3.type, ann3.id);
        ann3.versions = (ann3.versions || []).concat([version]);
        ann3.currentVersion = (ann3.versions.length - 1);
        ann3.timestamp = version.timestamp;
      }
      setAnnotations(newAnns3);
      setDragging(null);
      return;
    }

    // Finish drawing
    if (isDrawing && currentPath) {
      var newAnn2 = createAnnotation(pageNum, 'drawing', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type: 'draw', path: currentPath }],
        updatedBy: reviewerRef.current || 'Anonymous',
      });
      setAnnotations(annotations.concat([newAnn2]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn2 });
    }
    setIsDrawing(false);
    setCurrentPath('');
  };

  // Start dragging
  var startDrag = function(e: React.MouseEvent, annId: string, objIdx: number, dragType: string, handle?: string) {
    e.stopPropagation();
    var rect = containerRef.current!.getBoundingClientRect();
    var ann = annotations.find(function(a) { return a.id === annId; });
    if (!ann) return;
    var ox = ann.type === 'comment' ? (ann.x || 0) : (ann.objects && ann.objects[objIdx] ? ann.objects[objIdx].x || 0 : 0);
    var oy = ann.type === 'comment' ? (ann.y || 0) : (ann.objects && ann.objects[objIdx] ? ann.objects[objIdx].y || 0 : 0);
    var ow = ann.objects && ann.objects[objIdx] ? ann.objects[objIdx].w : undefined;
    var oh = ann.objects && ann.objects[objIdx] ? ann.objects[objIdx].h : undefined;
    setDragging({ annId: annId, objIdx: objIdx, type: dragType, startX: e.clientX - rect.left, startY: e.clientY - rect.top, origX: ox, origY: oy, origW: ow, origH: oh, handle: handle });
  };

  // Delete
  var handleDoubleClick = function(e: React.MouseEvent, annId: string) {
    e.stopPropagation();
    setAnnotations(annotations.filter(function(a) { return a.id !== annId; }));
    dispatch({ type: 'DELETE_ANNOTATION', pdf: currentPDF, id: annId });
  };

  // Save note edit
  var saveNoteEdit = function(annId: string) {
    var newAnns = annotations.slice();
    var ann = newAnns.find(function(a) { return a.id === annId; });
    if (ann) { ann.comment = editingNoteText; ann.objects = [{ type: 'note', x: ann.x || 0, y: ann.y || 0, text: editingNoteText }]; }
    setAnnotations(newAnns);
    dispatch({ type: 'UPDATE_ANNOTATION', pdf: currentPDF, id: annId, changes: { comment: editingNoteText } });
    setEditingNoteId(null);
  };

  // SVG objects
  var renderAnnotationObjects = function(ann: Annotation) {
    var objs = (ann.versions && ann.versions.length > 0 && ann.currentVersion >= 0)
      ? ann.versions[ann.currentVersion].objects
      : ann.objects;
    if (!objs) return null;
    var objColor = ann.color || color;
    var fillColor = objColor.replace(/[\d.]+\)$/, '0.4)');
    var strokeColor = objColor.replace(/[\d.]+\)$/, '1)');

    return objs.map(function(obj, idx) {
      if (obj.type === 'rectangle') {
        return React.createElement('g', { key: ann.id + '-' + idx },
          React.createElement('rect', {
            x: obj.x, y: obj.y, width: obj.w || 100, height: obj.h || 60,
            fill: 'none', stroke: strokeColor, strokeWidth: 2,
            style: { cursor: 'move' },
            onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'move'); },
            onDoubleClick: function(e: React.MouseEvent) { handleDoubleClick(e, ann.id); },
          }),
          React.createElement('rect', { x: (obj.x + (obj.w || 100) - 8), y: (obj.y + (obj.h || 60) - 8), width: 8, height: 8, fill: strokeColor, stroke: 'white', strokeWidth: 1, style: { cursor: 'se-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 'se'); } }),
          React.createElement('rect', { x: (obj.x + (obj.w || 100) - 8), y: obj.y + ((obj.h || 60) / 2) - 4, width: 8, height: 8, fill: strokeColor, stroke: 'white', strokeWidth: 1, style: { cursor: 'e-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 'e'); } }),
          React.createElement('rect', { x: obj.x + ((obj.w || 100) / 2) - 4, y: (obj.y + (obj.h || 60) - 8), width: 8, height: 8, fill: strokeColor, stroke: 'white', strokeWidth: 1, style: { cursor: 's-resize' }, onMouseDown: function(e: React.MouseEvent) { startDrag(e, ann.id, idx, 'resize', 's'); } })
        );
      }
      if (obj.type === 'highlight') {
        return React.createElement('rect', { key: ann.id + '-' + idx, x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill: fillColor, style: { mixBlendMode: 'multiply', pointerEvents: 'none' } });
      }
      if (obj.type === 'draw') {
        return React.createElement('path', { key: ann.id + '-' + idx, d: obj.path, fill: 'none', stroke: strokeColor, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', style: { pointerEvents: 'none' } });
      }
      return null;
    });
  };

  // Cursor style based on tool
  var cursorStyle = 'default';
  if (tool === 'select') cursorStyle = 'default';
  if (tool === 'highlight') cursorStyle = 'text';
  if (tool === 'draw') cursorStyle = 'crosshair';
  if (tool === 'rectangle') cursorStyle = 'crosshair';
  if (tool === 'comment') cursorStyle = 'cell';

  return React.createElement('div', {
    ref: containerRef,
    className: 'page-wrapper',
    style: {
      position: 'relative', width: width + 'px', height: height + 'px',
      margin: '0 auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      background: 'white', flexShrink: 0, cursor: cursorStyle,
      userSelect: tool === 'select' || tool === 'highlight' ? 'text' : 'none',
    },
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    'data-page': pageNum,
  },
    // LAYER 1: PDF Canvas
    React.createElement('canvas', { ref: canvasRef, style: { display: 'block', pointerEvents: 'none' } }),

    // LAYER 2: Text selection
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

    // LAYER 3: SVG
    React.createElement('svg', {
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'auto' },
    },
      annotations.map(function(ann) { return renderAnnotationObjects(ann); }),
      // Live rectangle preview
      isRectDrawing && rectCurrent ? React.createElement('rect', { x: rectCurrent.x, y: rectCurrent.y, width: rectCurrent.w, height: rectCurrent.h, fill: 'none', stroke: color.replace(/[\d.]+\)$/, '1)'), strokeWidth: 2, strokeDasharray: '5,5', pointerEvents: 'none' }) : null,
      // Live drawing preview
      isDrawing && currentPath ? React.createElement('path', { d: currentPath, fill: 'none', stroke: color.replace(/[\d.]+\)$/, '1)'), strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none' }) : null
    ),

    // LAYER 4: Sticky Notes
    React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 },
    },
      annotations.filter(function(a) { return a.type === 'comment'; }).map(function(note) {
        var isEditing = editingNoteId === note.id;
        var noteColor = note.color || color;
        var bgColor = '#fef9c3';
        var borderColor = '#ca8a04';

        return React.createElement('div', {
          key: note.id,
          style: {
            position: 'absolute', top: (note.y || 0) + 'px', left: (note.x || 0) + 'px',
            background: bgColor, border: '2px solid ' + borderColor,
            borderRadius: '2px 8px 8px 8px', padding: '4px 8px',
            fontSize: '11px', fontFamily: 'sans-serif', color: '#1a1a1a',
            pointerEvents: 'auto', maxWidth: '200px', minWidth: '60px',
            boxShadow: '1px 2px 4px rgba(0,0,0,0.15)',
            zIndex: 5, cursor: 'move',
          },
          onMouseDown: function(e: React.MouseEvent) {
            if (isEditing) return;
            startDrag(e, note.id, 0, 'move');
          },
          onDoubleClick: function(e: React.MouseEvent) {
            e.stopPropagation();
            setEditingNoteId(note.id);
            setEditingNoteText(note.comment || '');
          },
        },
          isEditing
            ? React.createElement('div', null,
                React.createElement('textarea', {
                  value: editingNoteText,
                  onChange: function(e: any) { setEditingNoteText(e.target.value); },
                  style: { width: '100%', minHeight: '40px', border: 'none', outline: 'none', resize: 'vertical', fontSize: '11px', fontFamily: 'sans-serif', color: '#1a1a1a', background: 'transparent' },
                  autoFocus: true,
                  onBlur: function() { saveNoteEdit(note.id); },
                  onKeyDown: function(e: any) { if (e.key === 'Escape') { setEditingNoteId(null); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNoteEdit(note.id); } },
                })
              )
            : React.createElement('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '16px' } },
                note.comment || React.createElement('span', { style: { color: '#999', fontStyle: 'italic' } }, 'Double-click to edit')
              )
        );
      })
    ),

    // Page label
    React.createElement('div', {
      style: { position: 'absolute', bottom: '8px', right: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 10 },
    }, 'Page ' + pageNum)
  );
}
