import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchPDF } from '../../services/githubApi';
import { PDF_SCALE } from '../../core/constants';
import * as pdfjsLib from 'pdfjs-dist';
import { Annotation, AnnotationAnchor } from '../../core/types';
import { buildAnchor, createAnnotation, createVersion } from '../../core/annotationHelpers';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PageInfo { pageNum: number; width: number; height: number; }

export function PdfViewer() {
  var _a = useAppState(), state = _a.state, dispatch = _a.dispatch;
  var _b = useState<PageInfo[]>([]), pages = _b[0], setPages = _b[1];
  var _c = useState(false), loading = _c[0], setLoading = _c[1];
  var pdfDocRef = useRef<any>(null);
  var pageReadyRef = useRef<Set<number>>(new Set());
  var renderedAnnsRef = useRef<Set<string>>(new Set());
  var loadingRef = useRef(false);
  var localAnnotationsRef = useRef<Record<number, Annotation[]>>({});

  useEffect(function() {
    return function() {
      pageReadyRef.current.clear();
      renderedAnnsRef.current.clear();
      localAnnotationsRef.current = {};
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

  // Handle annotation added from a page — syncs to global state
  var handleAnnotationAdded = function(pageNum: number, ann: Annotation) {
    dispatch({ type: 'ADD_ANNOTATION', pdf: state.currentPDF, payload: ann });
  };

  // Handle local annotations change for a page
  var handleLocalChange = function(pageNum: number, anns: Annotation[]) {
    localAnnotationsRef.current[pageNum] = anns;
  };

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
        key: p.pageNum,
        pageNum: p.pageNum,
        width: p.width,
        height: p.height,
        pdfDoc: pdfDocRef.current,
        tool: state.tool,
        color: state.color,
        reviewer: state.reviewer,
        currentPDF: state.currentPDF,
        dispatch: dispatch,
        pageReadyRef: pageReadyRef,
        renderedAnnsRef: renderedAnnsRef,
        globalAnnotations: state.annotations[state.currentPDF] || [],
      });
    })
  );
}

// ============================================================
// SVG PDF PAGE — 3 layers: Canvas | Text | SVG
// ============================================================
function SvgPdfPage(props: {
  pageNum: number; width: number; height: number;
  pdfDoc: any;
  tool: string; color: string; reviewer: string;
  currentPDF: string; dispatch: React.Dispatch<any>;
  pageReadyRef: React.MutableRefObject<Set<number>>;
  renderedAnnsRef: React.MutableRefObject<Set<string>>;
  globalAnnotations: Annotation[];
}) {
  var pageNum = props.pageNum, width = props.width, height = props.height;
  var pdfDoc = props.pdfDoc, tool = props.tool, color = props.color;
  var reviewer = props.reviewer, currentPDF = props.currentPDF, dispatch = props.dispatch;
  var pageReadyRef = props.pageReadyRef, renderedAnnsRef = props.renderedAnnsRef;
  var globalAnnotations = props.globalAnnotations;

  var containerRef = useRef<HTMLDivElement>(null);
  var canvasRef = useRef<HTMLCanvasElement>(null);
  var textLayerRef = useRef<HTMLDivElement>(null);
  var [annotations, setAnnotations] = useState<Annotation[]>([]);
  var [isDrawing, setIsDrawing] = useState(false);
  var [currentPath, setCurrentPath] = useState('');
  var [rendered, setRendered] = useState(false);
  var vpRef = useRef<any>(null);
  var toolRef = useRef(tool);
  var colorRef = useRef(color);
  var reviewerRef = useRef(reviewer);
  toolRef.current = tool;
  colorRef.current = color;
  reviewerRef.current = reviewer;

  // Merge global annotations into local state
  useEffect(function() {
    var merged: Annotation[] = [];
    var seen: Record<string, boolean> = {};
    for (var i = 0; i < globalAnnotations.length; i++) {
      if (globalAnnotations[i].page === pageNum) {
        merged.push(globalAnnotations[i]);
        seen[globalAnnotations[i].id] = true;
      }
    }
    for (var j = 0; j < annotations.length; j++) {
      if (!seen[annotations[j].id]) merged.push(annotations[j]);
    }
    setAnnotations(merged);
  }, [globalAnnotations, pageNum]);

  // Render PDF canvas + text layer
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
        if (cvs) {
          cvs.width = vp.width; cvs.height = vp.height;
          var ctx = cvs.getContext('2d');
          if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }

        var textContent = await page.getTextContent();
        var tl = textLayerRef.current;
        if (tl) {
          tl.innerHTML = '';
          tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px';
          for (var t = 0; t < textContent.items.length; t++) {
            var it = textContent.items[t] as any;
            if (!it.str) continue;
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var fh = Math.sqrt(tx[2]*tx[2]+tx[3]*tx[3]);
            var span = document.createElement('span');
            span.textContent = it.str;
            span.style.cssText = 'left:'+tx[4]+'px;top:'+(tx[5]-fh)+'px;font-size:'+fh+'px;position:absolute;color:transparent;white-space:pre;cursor:text;';
            tl.appendChild(span);
          }
        }

        if (!cancelled) { setRendered(true); pageReadyRef.current.add(pageNum); }
      } catch(e) { console.error('Render error page', pageNum, e); }
    }
    render();
    return function() { cancelled = true; };
  }, [pdfDoc, pageNum, rendered]);

  // Handle highlight on text selection
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
      objects.push({
        type: 'highlight',
        x: (r.left - tlRect.left) * sx,
        y: (r.top - tlRect.top) * sy,
        w: r.width * sx,
        h: r.height * sy,
      });
    }
    var ann = createAnnotation(pageNum, 'highlight', reviewerRef.current, colorRef.current, {
      id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
      objects: objects, updatedBy: reviewerRef.current || 'Anonymous',
    }, anchor, text.substring(0, 100), text);
    var newAnns = annotations.concat([ann]);
    setAnnotations(newAnns);
    dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: ann });
  };

  // Click handler for shapes and notes
  var handlePageClick = function(e: React.MouseEvent) {
    if (toolRef.current === 'select' || toolRef.current === 'draw' || toolRef.current === 'highlight') return;
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;

    if (toolRef.current === 'rectangle') {
      var newAnn = createAnnotation(pageNum, 'rectangle', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type: 'rectangle', x: x, y: y, w: 100, h: 60 }],
        updatedBy: reviewerRef.current || 'Anonymous',
      });
      var newAnns1 = annotations.concat([newAnn]);
      setAnnotations(newAnns1);
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
    } else if (toolRef.current === 'comment') {
      var comment = prompt('Add a note:');
      if (!comment) return;
      var newAnn2 = createAnnotation(pageNum, 'comment', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type: 'note', x: x, y: y, text: comment }],
        updatedBy: reviewerRef.current || 'Anonymous',
      }, undefined, comment);
      newAnn2.x = Math.round(x);
      newAnn2.y = Math.round(y);
      var newAnns2 = annotations.concat([newAnn2]);
      setAnnotations(newAnns2);
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn2 });
    }
  };

  // Drawing handlers
  var handleMouseDown = function(e: React.MouseEvent) {
    if (toolRef.current !== 'draw') return;
    setIsDrawing(true);
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    setCurrentPath('M ' + x + ' ' + y);
  };

  var handleMouseMove = function(e: React.MouseEvent) {
    if (!isDrawing || toolRef.current !== 'draw') return;
    var rect = containerRef.current!.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    setCurrentPath(function(prev) { return prev + ' L ' + x + ' ' + y; });
  };

  var handleMouseUp = function() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath) {
      var newAnn = createAnnotation(pageNum, 'drawing', reviewerRef.current, colorRef.current, {
        id: 'ver-' + Date.now(), timestamp: new Date().toISOString(),
        objects: [{ type: 'draw', path: currentPath }],
        updatedBy: reviewerRef.current || 'Anonymous',
      });
      var newAnns = annotations.concat([newAnn]);
      setAnnotations(newAnns);
      dispatch({ type: 'ADD_ANNOTATION', pdf: currentPDF, payload: newAnn });
    }
    setCurrentPath('');
  };

  return React.createElement('div', {
    ref: containerRef,
    className: 'page-wrapper',
    style: {
      position: 'relative', width: width + 'px', height: height + 'px',
      margin: '0 auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      background: 'white', flexShrink: 0,
      userSelect: tool === 'select' ? 'text' : 'none',
    },
    onClick: handlePageClick,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    'data-page': pageNum,
  },
    // LAYER 1: PDF Canvas
    React.createElement('canvas', { ref: canvasRef, style: { display: 'block' } }),

    // LAYER 2: Text selection layer
    React.createElement('div', {
      ref: textLayerRef,
      className: 'textLayer',
      style: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden', zIndex: 2,
        pointerEvents: tool === 'select' || tool === 'highlight' ? 'auto' : 'none',
        opacity: 1, lineHeight: 1.0,
      },
      onMouseUp: handleTextSelection,
    }),

    // LAYER 3: SVG annotation layer
    React.createElement('svg', {
      style: {
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: tool === 'select' ? 'none' : 'auto',
        zIndex: 3,
      },
    },
      annotations.map(function(ann) {
        var objs = (ann.versions && ann.versions.length > 0)
          ? ann.versions[ann.currentVersion || ann.versions.length - 1].objects
          : ann.objects;
        if (!objs) return null;

        return objs.map(function(obj, idx) {
          if (obj.type === 'rectangle' || obj.type === 'highlight') {
            var fill = obj.type === 'highlight'
              ? color.replace(/[\d.]+\)$/, '0.4)').replace('rgba', 'rgba')
              : 'none';
            var stroke = obj.type === 'rectangle' ? color : 'none';
            return React.createElement('rect', {
              key: ann.id + '-' + idx,
              x: obj.x, y: obj.y, width: obj.w, height: obj.h,
              fill: fill, stroke: stroke, strokeWidth: obj.type === 'rectangle' ? 3 : 0,
              style: obj.type === 'highlight' ? { mixBlendMode: 'multiply' } : {},
            });
          }
          if (obj.type === 'draw') {
            return React.createElement('path', {
              key: ann.id + '-' + idx,
              d: obj.path,
              fill: 'none', stroke: color, strokeWidth: 3,
              strokeLinecap: 'round', strokeLinejoin: 'round',
            });
          }
          return null;
        });
      }),
      isDrawing ? React.createElement('path', {
        d: currentPath,
        fill: 'none', stroke: color, strokeWidth: 3,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }) : null
    ),

    // LAYER 3.5: HTML Notes
    React.createElement('div', {
      style: {
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 4,
      },
    },
      annotations.filter(function(a) { return a.type === 'comment'; }).map(function(note) {
        return React.createElement('div', {
          key: note.id,
          style: {
            position: 'absolute',
            top: (note.y || 0) + 'px',
            left: (note.x || 0) + 'px',
            background: '#fef08a',
            border: '1px solid #ca8a04',
            padding: '6px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            pointerEvents: 'auto',
            maxWidth: '180px',
            boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
            zIndex: 5,
          },
        }, note.comment);
      })
    ),

    // Page label
    React.createElement('div', {
      style: {
        position: 'absolute', bottom: '8px', right: '12px',
        background: 'rgba(0,0,0,0.6)', color: 'white',
        padding: '2px 8px', borderRadius: '4px',
        fontSize: '0.7rem', pointerEvents: 'none', zIndex: 10,
      },
    }, 'Page ' + pageNum)
  );
}
