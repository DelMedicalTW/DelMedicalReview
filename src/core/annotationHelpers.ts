import { Annotation, AnnotationStatus, AnnotationVersion, AnnotationThreadReply, AnnotationAnchor } from './types';

export function nextStatus(status: AnnotationStatus): AnnotationStatus {
  if (status === 'draft') return 'in_review';
  if (status === 'in_review') return 'approved';
  if (status === 'approved') return 'resolved';
  if (status === 'rejected') return 'draft';
  return status;
}

// FIXED: Takes SVG annotation objects instead of Fabric canvas
export function createVersion(
  objects: any[],
  reviewer: string,
  annType?: string,
  annId?: string
): AnnotationVersion {
  var serialized: any[] = [];
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    var copy: any = {};
    if (obj.type === 'draw') copy = { type: 'draw', path: obj.path };
    else if (obj.type === 'rectangle') copy = { type: 'rectangle', x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    else if (obj.type === 'highlight') copy = { type: 'highlight', x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    else if (obj.type === 'note') copy = { type: 'note', x: obj.x, y: obj.y, text: obj.text };
    else copy = obj;
    copy._annType = annType || 'drawing';
    copy._annotationId = annId || '';
    serialized.push(copy);
  }
  return {
    id: 'ver-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    timestamp: new Date().toISOString(),
    updatedBy: reviewer || 'Anonymous',
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
  // Fallback: return a synthetic version from the annotation's own objects
  return {
    id: 'ver-original',
    timestamp: ann.timestamp,
    objects: ann.objects || [],
    updatedBy: ann.reviewer,
    comment: ann.comment,
  };
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

// FIXED: Returns SVG element props instead of using Fabric
export function drawAnchorElements(
  ann: Annotation,
  containerWidth: number,
  containerHeight: number
): Array<{ x: number; y: number; w: number; h: number; color: string }> {
  if (!ann.anchor || !ann.anchor.rects) return [];
  var result: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
  var rects = ann.anchor.rects;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    result.push({
      x: r.x * containerWidth,
      y: r.y * containerHeight,
      w: r.w * containerWidth,
      h: r.h * containerHeight,
      color: ann.color,
    });
  }
  return result;
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
