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

  useEffect(function() { return function() { pageReadyRef.current.clear(); }; }, [state.currentPDFPath]);

  useEffect(function() {
    if (!state.currentPDFPath) return;
    if (loadingRef.current) return;
    loadingRef.current = true; var cancelled = false;
    setLoading(true); setPages([]);
    dispatch({ type: 'SET_LOADING', payload: true });
    fetchPDF(state.currentPDFPath).then(async function(data) {
      if (cancelled) { loadingRef.current = false; return; }
      var doc = await pdfjsLib.getDocument({ data: data }).promise;
      pdfDocRef.current = doc;
      var pl: PageInfo[] = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var pg = await doc.getPage(i); var vp = pg.getViewport({ scale: PDF_SCALE });
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
  globalAnnotations: Annotation[];
}) {
  var pageNum = props.pageNum, width = props.width, height = props.height;
  var pdfDoc = props.pdfDoc, tool = props.tool, color = props.color;
  var reviewer = props.reviewer, currentPDF = props.currentPDF, dispatch = props.dispatch;
  var globalAnnotations = props.globalAnnotations;

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
  var [dragging, setDragging] = useState<any>(null);
  var [resizing, setResizing] = useState<any>(null);
  var vpRef = useRef<any>(null);
  var toolRef = useRef(tool); toolRef.current = tool;
  var colorRef = useRef(color); colorRef.current = color;
  var reviewerRef = useRef(reviewer); reviewerRef.current = reviewer;

  // Merge global annotations into local state
  useEffect(function() {
    var merged: Annotation[] = []; var seen: Record<string, boolean> = {};
    for (var i = 0; i < globalAnnotations.length; i++) {
      if (globalAnnotations[i].page === pageNum || globalAnnotations[i].page === 0) {
        merged.push(globalAnnotations[i]); seen[globalAnnotations[i].id] = true;
      }
    }
    setAnnotations(merged);
  }, [globalAnnotations, pageNum]);

  // Render PDF canvas + text layer
  useEffect(function() {
    if (!pdfDoc || rendered) return; var cancelled = false;
    async function render() {
      try {
        var page = await pdfDoc.getPage(pageNum); var vp = page.getViewport({ scale: PDF_SCALE }); vpRef.current = vp;
        if (cancelled) return;
        var cvs = canvasRef.current;
        if (cvs) { cvs.width = vp.width; cvs.height = vp.height; var ctx = cvs.getContext('2d'); if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise; }
        var textContent = await page.getTextContent(); var tl = textLayerRef.current;
        if (tl) {
          tl.innerHTML = ''; tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px';
          for (var t = 0; t < textContent.items.length; t++) {
            var it = textContent.items[t] as any; if (!it.str) continue;
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform); var fh = Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
            var span = document.createElement('span'); span.textContent = it.str;
            span.style.cssText = 'left:'+tx[4]+'px;top:'+(tx[5]-fh)+'px;font-size:'+fh+'px;position:absolute;color:transparent;white-space:pre;cursor:text;font-family:sans-serif;';
            tl.appendChild(span);
          }
        }
        if (!cancelled) setRendered(true);
      } catch(e) { console.error('Render error', pageNum, e); }
    }
    render(); return function() { cancelled = true; };
  }, [pdfDoc, pageNum, rendered]);

  // Get container-relative position
  var getPos = function(e: React.MouseEvent) { var r = containerRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // FIXED: Highlight with debounce
  var lastHighlightTime = useRef(0);
  var handleTextSelection = function() {
    if (toolRef.current !== 'highlight' && toolRef.current !== 'select') return;
    var now = Date.now(); if (now - lastHighlightTime.current < 400) return;
    lastHighlightTime.current = now;
    var sel = window.getSelection(); var text = sel ? sel.toString().trim() : '';
    if (!text || !sel) return;
    var tl = textLayerRef.current; if (!tl || !tl.contains(sel.anchorNode)) return;
    var range = sel.getRangeAt(0); var rects = range.getClientRects(); var tlRect = tl.getBoundingClientRect();
    var sx = vpRef.current.width / tl.offsetWidth; var sy = vpRef.current.height / tl.offsetHeight;
    var objects: any[] = [];
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; objects.push({ type: 'highlight', x: (r.left-tlRect.left)*sx, y: (r.top-tlRect.top)*sy, w: r.width*sx, h: r.height*sy }); }
    var ann = createAnnotation(pageNum, 'highlight', reviewerRef.current, colorRef.current, {
      id: 'ver-'+Date.now(), timestamp: new Date().toISOString(), objects: objects, updatedBy: reviewerRef.current||'Anonymous',
    }, buildAnchor(pageNum, rects, tlRect, text), text.substring(0,100), text);
    setAnnotations(annotations.concat([ann])); dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann }); sel.removeAllRanges();
  };

  // Mouse handlers
  var handleMouseDown = function(e: React.MouseEvent) {
    var pos = getPos(e);
    if (toolRef.current === 'rectangle') { setIsRectDrawing(true); setRectStart(pos); setRectCurrent({ x: pos.x, y: pos.y, w: 0, h: 0 }); return; }
    if (toolRef.current === 'draw') { setIsDrawing(true); setCurrentPath('M '+pos.x+' '+pos.y); return; }
    if (toolRef.current === 'comment') {
      var ann = createAnnotation(pageNum, 'comment', reviewerRef.current, colorRef.current, {
        id: 'ver-'+Date.now(), timestamp: new Date().toISOString(), objects: [], updatedBy: reviewerRef.current||'Anonymous',
      }, undefined, '');
      ann.x = Math.round(pos.x); ann.y = Math.round(pos.y);
      setAnnotations(annotations.concat([ann]));
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
      setEditingNoteId(ann.id); setEditingNoteText('');
      return;
    }
  };

  var handleMouseMove = function(e: React.MouseEvent) {
    var pos = getPos(e);
    // Rectangle drawing preview
    if (isRectDrawing && rectStart) {
      var left = Math.min(rectStart.x, pos.x); var top = Math.min(rectStart.y, pos.y);
      setRectCurrent({ x: left, y: top, w: Math.abs(pos.x-rectStart.x), h: Math.abs(pos.y-rectStart.y) }); return;
    }
    // FIXED: Dynamic resize — update annotation object directly
    if (resizing) {
      var dx = pos.x - resizing.startX; var dy = pos.y - resizing.startY;
      var newAnns = annotations.slice();
      var annR = newAnns.find(function(a: Annotation) { return a.id === resizing.annId; });
      if (annR && annR.objects && annR.objects[resizing.objIdx]) {
        var obj = annR.objects[resizing.objIdx];
        if (resizing.handle === 'se') { obj.w = Math.max(20, resizing.origW + dx); obj.h = Math.max(20, resizing.origH + dy); }
        else if (resizing.handle === 'e') { obj.w = Math.max(20, resizing.origW + dx); }
        else if (resizing.handle === 's') { obj.h = Math.max(20, resizing.origH + dy); }
        setAnnotations(newAnns);
      } return;
    }
    // Dragging
    if (dragging) {
      var dx2 = pos.x - dragging.startX; var dy2 = pos.y - dragging.startY;
      var newAnns2 = annotations.slice();
      var annD = newAnns2.find(function(a: Annotation) { return a.id === dragging.annId; });
      if (annD) {
        if (annD.type === 'comment') { annD.x = dragging.origX + dx2; annD.y = dragging.origY + dy2; }
        else if (annD.objects && annD.objects[dragging.objIdx]) {
          annD.objects[dragging.objIdx].x = dragging.origX + dx2;
          annD.objects[dragging.objIdx].y = dragging.origY + dy2;
        }
        setAnnotations(newAnns2);
      } return;
    }
    // Drawing
    if (isDrawing) { setCurrentPath(function(prev: string) { return prev+' L '+pos.x+' '+pos.y; }); }
  };

  var handleMouseUp = function(e: React.MouseEvent) {
    if (isRectDrawing && rectCurrent && rectCurrent.w > 5 && rectCurrent.h > 5) {
      var ann = createAnnotation(pageNum, 'rectangle', reviewerRef.current, colorRef.current, {
        id: 'ver-'+Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type:'rectangle', x:rectCurrent.x, y:rectCurrent.y, w:rectCurrent.w, h:rectCurrent.h }],
        updatedBy: reviewerRef.current||'Anonymous',
      });
      setAnnotations(annotations.concat([ann])); dispatch({ type:'ADD_ANNOTATION', pdf:currentPDF, payload:ann });
    }
    setIsRectDrawing(false); setRectStart(null); setRectCurrent(null);
    if (resizing) {
      var newAnns3 = annotations.slice();
      var annR2 = newAnns3.find(function(a: Annotation) { return a.id === resizing.annId; });
      if (annR2) {
        var version = createVersion(annR2.objects || [], reviewerRef.current, annR2.type, annR2.id);
        annR2.versions = (annR2.versions || []).concat([version]);
        annR2.currentVersion = (annR2.versions.length - 1); annR2.timestamp = version.timestamp;
      }
      setAnnotations(newAnns3); setResizing(null); return;
    }
    if (dragging) { setDragging(null); return; }
    if (isDrawing && currentPath) {
      var ann2 = createAnnotation(pageNum, 'drawing', reviewerRef.current, colorRef.current, {
        id:'ver-'+Date.now(), timestamp:new Date().toISOString(),
        objects:[{ type:'draw', path:currentPath }], updatedBy:reviewerRef.current||'Anonymous',
      });
      setAnnotations(annotations.concat([ann2])); dispatch({ type:'ADD_ANNOTATION', pdf:currentPDF, payload:ann2 });
    }
    setIsDrawing(false); setCurrentPath('');
  };

  // Drag/resize handlers
  var startDrag = function(e: React.MouseEvent, annId: string, objIdx: number) {
    e.stopPropagation(); var pos = getPos(e);
    var ann = annotations.find(function(a: Annotation) { return a.id===annId; }); if(!ann) return;
    var ox = ann.type==='comment' ? (ann.x||0) : (ann.objects&&ann.objects[objIdx] ? ann.objects[objIdx].x||0 : 0);
    var oy = ann.type==='comment' ? (ann.y||0) : (ann.objects&&ann.objects[objIdx] ? ann.objects[objIdx].y||0 : 0);
    setDragging({ annId, objIdx, startX:pos.x, startY:pos.y, origX:ox, origY:oy });
  };

  var startResize = function(e: React.MouseEvent, annId: string, objIdx: number, handle: string) {
    e.stopPropagation(); var pos = getPos(e);
    var ann = annotations.find(function(a: Annotation) { return a.id===annId; });
    if(!ann||!ann.objects||!ann.objects[objIdx]) return;
    var obj = ann.objects[objIdx];
    setResizing({ annId, objIdx, handle, startX:pos.x, startY:pos.y, origW:obj.w||100, origH:obj.h||60 });
  };

  var handleDoubleClick = function(e: React.MouseEvent, annId: string) {
    e.stopPropagation();
    setAnnotations(annotations.filter(function(a: Annotation) { return a.id!==annId; }));
    dispatch({ type:'DELETE_ANNOTATION', pdf:currentPDF, id:annId });
  };

  var saveNoteEdit = function(annId: string) {
    var newAnns = annotations.slice();
    var ann = newAnns.find(function(a: Annotation) { return a.id===annId; });
    if(ann) { ann.comment=editingNoteText; ann.objects=[{ type:'note', x:ann.x||0, y:ann.y||0, text:editingNoteText }]; }
    setAnnotations(newAnns);
    dispatch({ type:'UPDATE_ANNOTATION', pdf:currentPDF, id:annId, changes:{ comment:editingNoteText } });
    setEditingNoteId(null);
  };

  // FIXED: Cursor per tool
  var cursorStyle = 'default';
  if (tool === 'select') cursorStyle = 'default';
  if (tool === 'highlight') cursorStyle = 'text';
  if (tool === 'draw') cursorStyle = 'crosshair';
  if (tool === 'rectangle') cursorStyle = 'crosshair';
  if (tool === 'comment') cursorStyle = 'cell';

  return React.createElement('div', {
    ref: containerRef, className: 'page-wrapper',
    style: {
      position:'relative', width:width+'px', height:height+'px', margin:'0 auto',
      boxShadow:'0 4px 16px rgba(0,0,0,0.6)', background:'white', flexShrink:0,
      cursor: cursorStyle,
      userSelect: tool==='select' || tool==='highlight' ? 'text' : 'none',
    },
    onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseUp: handleMouseUp,
    'data-page': pageNum,
  },
    // LAYER 1: PDF Canvas
    React.createElement('canvas', { ref: canvasRef, style: { display:'block', pointerEvents:'none' } }),

    // LAYER 2: Text selection — FIXED: works in both select and highlight modes
    React.createElement('div', {
      ref: textLayerRef,
      style: {
        position:'absolute', top:0, left:0, right:0, bottom:0,
        overflow:'hidden', zIndex:2,
        pointerEvents: tool==='select' || tool==='highlight' ? 'auto' : 'none',
        lineHeight: 1.0,
      },
      onMouseUp: handleTextSelection,
    }),

    // LAYER 3: SVG Annotations
    React.createElement('svg', {
      style: { position:'absolute', top:0, left:0, width:'100%', height:'100%', zIndex:3, pointerEvents:'auto' },
    },
      annotations.filter(function(a: Annotation) { return a.page === pageNum || a.page === 0; }).map(function(ann: Annotation) {
        var objs = (ann.versions&&ann.versions.length>0&&ann.currentVersion>=0) ? ann.versions[ann.currentVersion].objects : ann.objects;
        if(!objs || !objs.length) return null;
        var objColor = ann.color||color;
        var fillColor = objColor.replace(/[\d.]+\)$/,'0.4)');
        var strokeColor = objColor.replace(/[\d.]+\)$/,'1)');

        return React.createElement('g', { key: ann.id },
          objs.map(function(obj: any, idx: number) {
            if (obj.type === 'rectangle') {
              return React.createElement('g', { key: idx },
                React.createElement('rect', {
                  x: obj.x, y: obj.y, width: obj.w||100, height: obj.h||60,
                  fill: 'none', stroke: strokeColor, strokeWidth: 2,
                  style: { cursor: 'move' },
                  onMouseDown: function(e: any) { startDrag(e, ann.id, idx); },
                  onDoubleClick: function(e: any) { handleDoubleClick(e, ann.id); },
                }),
                React.createElement('rect', { x:(obj.x+(obj.w||100)-8), y:(obj.y+(obj.h||60)-8), width:8, height:8, fill:strokeColor, stroke:'white', strokeWidth:1, style:{cursor:'se-resize'}, onMouseDown:function(e: any){ startResize(e,ann.id,idx,'se'); } }),
                React.createElement('rect', { x:(obj.x+(obj.w||100)-8), y:obj.y+((obj.h||60)/2)-4, width:8, height:8, fill:strokeColor, stroke:'white', strokeWidth:1, style:{cursor:'e-resize'}, onMouseDown:function(e: any){ startResize(e,ann.id,idx,'e'); } }),
                React.createElement('rect', { x:obj.x+((obj.w||100)/2)-4, y:(obj.y+(obj.h||60)-8), width:8, height:8, fill:strokeColor, stroke:'white', strokeWidth:1, style:{cursor:'s-resize'}, onMouseDown:function(e: any){ startResize(e,ann.id,idx,'s'); } })
              );
            }
            if (obj.type === 'highlight') {
              return React.createElement('rect', {
                key: idx, x: obj.x, y: obj.y, width: obj.w, height: obj.h,
                fill: fillColor, style: { mixBlendMode: 'multiply', pointerEvents: 'none' },
              });
            }
            if (obj.type === 'draw') {
              return React.createElement('path', {
                key: idx, d: obj.path,
                fill: 'none', stroke: strokeColor, strokeWidth: 3,
                strokeLinecap: 'round', strokeLinejoin: 'round',
                style: { pointerEvents: 'none' },
              });
            }
            return null;
          })
        );
      }),
      // Live rectangle preview
      isRectDrawing && rectCurrent ? React.createElement('rect', {
        x: rectCurrent.x, y: rectCurrent.y, width: rectCurrent.w, height: rectCurrent.h,
        fill: 'none', stroke: color.replace(/[\d.]+\)$/,'1)'), strokeWidth: 2,
        strokeDasharray: '5,5', pointerEvents: 'none',
      }) : null,
      // Live drawing preview
      isDrawing && currentPath ? React.createElement('path', {
        d: currentPath, fill: 'none', stroke: color.replace(/[\d.]+\)$/,'1)'),
        strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', pointerEvents: 'none',
      }) : null
    ),

       // LAYER 4: Sticky Notes — FIXED: colored background from selected color
    React.createElement('div', {
      style: { position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:4 },
    },
      annotations.filter(function(a: Annotation) { return a.type==='comment' && (a.page===pageNum || a.page===0); }).map(function(note: Annotation) {
        var isEditing = editingNoteId === note.id;
        var noteColor = note.color || color;
        // Create a lighter, semi-transparent version of the color for the background
        var bgColor = noteColor.replace(/[\d.]+\)$/, '0.25)');
        var borderColor = noteColor.replace(/[\d.]+\)$/, '0.8)');

        return React.createElement('div', {
          key: note.id,
          style: {
            position: 'absolute', top: (note.y||0)+'px', left: (note.x||0)+'px',
            background: bgColor,
            border: '2px solid '+borderColor,
            borderRadius: '2px 8px 8px 8px', padding: '4px 8px',
            fontSize: '11px', fontFamily: 'sans-serif', color: '#1a1a1a',
            pointerEvents: 'auto', maxWidth: '200px', minWidth: '60px',
            boxShadow: '1px 2px 4px rgba(0,0,0,0.15)', zIndex: 5, cursor: 'move',
          },
          onMouseDown: function(e: any) { if(!isEditing) startDrag(e, note.id, 0); },
          onDoubleClick: function(e: any) { e.stopPropagation(); setEditingNoteId(note.id); setEditingNoteText(note.comment||''); },
        },
          isEditing
            ? React.createElement('textarea', {
                value: editingNoteText,
                onChange: function(e: any) { setEditingNoteText(e.target.value); },
                style: { width:'100%', minHeight:'40px', border:'none', outline:'none', resize:'vertical', fontSize:'11px', fontFamily:'sans-serif', color:'#1a1a1a', background:'transparent' },
                autoFocus: true,
                onBlur: function() { saveNoteEdit(note.id); },
                onKeyDown: function(e: any) { if(e.key==='Escape') setEditingNoteId(null); if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); saveNoteEdit(note.id); } },
              })
            : React.createElement('div', { style: { whiteSpace:'pre-wrap', wordBreak:'break-word', minHeight:'16px' } },
                note.comment || React.createElement('span', { style: { color:'#666', fontStyle:'italic' } }, 'Double-click to edit')
              )
        );
      })
    ),
                             
    // Page label
    React.createElement('div', {
      style: { position:'absolute', bottom:'8px', right:'12px', background:'rgba(0,0,0,0.6)', color:'white', padding:'2px 8px', borderRadius:'4px', fontSize:'0.7rem', pointerEvents:'none', zIndex:10 },
    }, 'Page '+pageNum)
  );
}
