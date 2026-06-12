export type Tool = 'select' | 'highlight' | 'draw' | 'rectangle' | 'comment';

export type AnnotationType = 'highlight' | 'drawing' | 'rectangle' | 'comment';

export type AnnotationStatus = 'open' | 'in-review' | 'resolved';

export interface AnnotationObject {
  id: string;
  type: 'fabric' | 'rect' | 'path';
  page: number;
  data: any;
  _annotationId?: string;
  _annType?: string;
}

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
  objects: AnnotationObject[];
  x?: number;
  y?: number;
  _pending?: boolean;
  _pdfName?: string;
}

export interface FolderInfo {
  label: string;
  cls: string;
  icon: string;
  desc: string;
}

export interface SyncPayload {
  version: number;
  pdfName: string;
  updatedBy: string;
  updated: string;
  annotations: Annotation[];
}

export interface AppState {
  currentPDF: string;
  currentPath: string;
  annotations: Record<string, Annotation[]>;
  tool: Tool;
  color: string;
  isLoadingPDF: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'success';
  lastSyncTime: string | null;
  dirtyAnnotations: Record<string, boolean>;
  deletedAnnotations: Record<string, boolean>;
  fileShas: Record<string, string | null>;
}
