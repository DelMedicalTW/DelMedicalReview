export type Tool = 'select' | 'highlight' | 'draw' | 'rectangle' | 'comment';
export type AnnotationType = 'highlight' | 'drawing' | 'rectangle' | 'comment';
export type AnnotationStatus = 'open' | 'in-review' | 'resolved';

export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number;
  status: AnnotationStatus;
  comment?: string;
  reviewer: string;
  timestamp: string;
  color?: string;
  quotedText?: string;
  objects: any[];
  x?: number;
  y?: number;
}
