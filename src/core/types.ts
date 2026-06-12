export type Tool = 'select' | 'highlight' | 'draw' | 'rectangle' | 'comment';

export type AnnotationType = 'highlight' | 'drawing' | 'rectangle' | 'comment';

export type AnnotationStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'resolved';

export interface AnnotationVersion {
  id: string;
  timestamp: string;
  objects: any[];
  comment?: string;
  updatedBy: string;
}

export interface AnnotationThreadReply {
  id: string;
  author: string;
  message: string;
  timestamp: string;
}

export interface AnnotationAnchor {
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
  textSnippet?: string;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number;
  status: AnnotationStatus;
  reviewer: string;
  timestamp: string;
  color: string;
  quotedText?: string;
  comment: string;
  objects: any[];
  thread?: { replies: AnnotationThreadReply[] };
  versions: AnnotationVersion[];
  currentVersion: number;
  anchor?: AnnotationAnchor;
  x?: number;
  y?: number;
}
