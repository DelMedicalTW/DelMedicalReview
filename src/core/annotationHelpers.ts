import { Annotation, AnnotationStatus, AnnotationVersion, AnnotationThreadReply, AnnotationAnchor } from './types';
import { fabric } from 'fabric';

export function nextStatus(status: AnnotationStatus): AnnotationStatus {
  if (status === 'draft') return 'in_review';
  if (status === 'in_review') return 'approved';
  if (status === 'approved') return 'resolved';
  if (status === 'rejected') return 'draft';
  return status;
}

export function createVersion(
  fc: fabric.Canvas,
  reviewer: string,
  ann?: Annotation
): AnnotationVersion {
  var objects = fc.getObjects();
  var serialized: any[] = [];
  for (var i = 0; i < objects.length; i++) {
    var d = objects[i].toJSON();
    (d as any)._annType = ann ? ann.type : 'drawing';
    (d as any)._annotationId = ann ? ann.id : '';
    serialized.push(d);
  }
  return {
    id: 'ver-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    timestamp: new Date().toISOString(),
    updatedBy: reviewer || 'Anonymous',
    comment: ann ? ann.comment : undefined,
    objects: serialized,
  };
}

export function addReply(
  annotation: Annotation,
  message: string,
  author: string
): Annotation {
  var replies = annotation.thread ? annotation.thread.replies.slice() : [];
  replies.push({
    id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    author: author,
    message: message,
    timestamp: new Date().toISOString(),
  });
  return {
    ...annotation,
    thread: { replies: replies },
    status: 'in_review',
  };
}

export function updateAnnotationStatus(
  annotation: Annotation,
  status: AnnotationStatus
): Annotation {
  return { ...annotation, status: status };
}

export function getLatestVersion(ann: Annotation): AnnotationVersion {
  if (ann.versions && ann.versions.length > 0 && ann.currentVersion >= 0) {
    return ann.versions[ann.currentVersion] || ann.versions[ann.versions.length - 1];
  }
  return { id: '', timestamp: ann.timestamp, objects: ann.objects, updatedBy: ann.reviewer };
}

export function buildAnchor(
  pageNum: number,
  rects: DOMRectList,
  tlRect: DOMRect,
  text: string
): AnnotationAnchor {
  var result: { x: number; y: number; w: number; h: number }[] = [];
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    result.push({
      x: (r.left - tlRect.left) / tlRect.width,
      y: (r.top - tlRect.top) / tlRect.height,
      w: r.width / tlRect.width,
      h: r.height / tlRect.height,
    });
  }
  return { page: pageNum, rects: result, textSnippet: text };
}

export function drawAnchor(
  ann: Annotation,
  fc: fabric.Canvas,
  tlRect: DOMRect
): void {
  if (!ann.anchor || !ann.anchor.rects) return;
  var rects = ann.anchor.rects;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    var rect = new fabric.Rect({
      left: r.x * fc.getWidth(),
      top: r.y * fc.getHeight(),
      width: r.w * fc.getWidth(),
      height: r.h * fc.getHeight(),
      fill: ann.color,
      opacity: 0.4,
      selectable: false,
      evented: false,
    });
    fc.add(rect);
  }
  fc.renderAll();
}

export function createAnnotation(
  pageNum: number,
  annType: string,
  reviewer: string,
  color: string,
  version: AnnotationVersion,
  anchor?: AnnotationAnchor,
  commentText?: string,
  quotedText?: string
): Annotation {
  return {
    id: 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    type: annType as any,
    page: pageNum,
    status: 'draft',
    reviewer: reviewer || 'Anonymous',
    timestamp: version.timestamp,
    color: color,
    comment: commentText || '',
    quotedText: quotedText,
    objects: version.objects,
    versions: [version],
    currentVersion: 0,
    anchor: anchor,
  };
}
