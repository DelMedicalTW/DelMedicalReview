import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Annotation, Tool, AnnotationType, AnnotationStatus, AnnotationVersion } from '../core/types';
import { updateAnnotationStatus, addReply } from '../core/annotationHelpers';

export interface AppState {
  currentPDF: string;
  currentPDFPath: string;
  currentPath: string;
  annotations: Record<string, Annotation[]>;
  tool: Tool;
  color: string;
  isLoadingPDF: boolean;
  showBrowser: boolean;
  showSidebar: boolean;
  reviewer: string;
  showAnnotations: boolean;
}

type Action =
  | { type: 'SET_PDF'; name: string; path: string }
  | { type: 'SET_PATH'; payload: string }
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'SET_COLOR'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_REVIEWER'; payload: string }
  | { type: 'SET_ANNOTATIONS'; pdf: string; payload: Annotation[] }
  | { type: 'ADD_ANNOTATION'; pdf: string; payload: Annotation }
  | { type: 'DELETE_ANNOTATION'; pdf: string; id: string }
  | { type: 'UPDATE_ANNOTATION'; pdf: string; id: string; changes: Partial<Annotation> }
  | { type: 'TOGGLE_BROWSER' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_ANNOTATIONS' }
  | { type: 'UPDATE_STATUS'; pdf: string; id: string; status: AnnotationStatus }
  | { type: 'ADD_REPLY'; pdf: string; id: string; message: string; author: string }
  | { type: 'ADD_VERSION'; pdf: string; id: string; version: AnnotationVersion }
  | { type: 'UNDO_LAST' }
  | { type: 'CLEAR_CURRENT_PAGE' };

function generateId(): string {
  return 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

var initialState: AppState = {
  currentPDF: '',
  currentPDFPath: '',
  currentPath: '',
  annotations: {},
  tool: 'select',
  color: 'rgba(255,213,79,0.45)',
  isLoadingPDF: false,
  showBrowser: true,
  showSidebar: true,
  reviewer: localStorage.getItem('delmed-reviewer') || '',
  showAnnotations: true,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PDF':
      return { ...state, currentPDF: action.name, currentPDFPath: action.path };
    case 'SET_PATH':
      return { ...state, currentPath: action.payload };
    case 'SET_TOOL':
      return { ...state, tool: action.payload };
    case 'SET_COLOR':
      return { ...state, color: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoadingPDF: action.payload };
    case 'SET_REVIEWER':
      localStorage.setItem('delmed-reviewer', action.payload);
      return { ...state, reviewer: action.payload };
    case 'SET_ANNOTATIONS':
      return { ...state, annotations: { ...state.annotations, [action.pdf]: action.payload } };
    case 'TOGGLE_BROWSER':
      return { ...state, showBrowser: !state.showBrowser };
    case 'TOGGLE_SIDEBAR':
      return { ...state, showSidebar: !state.showSidebar };
    case 'TOGGLE_ANNOTATIONS':
      return { ...state, showAnnotations: !state.showAnnotations };
    case 'UNDO_LAST': {
      var pdfU = state.currentPDF;
      var currentU = state.annotations[pdfU] || [];
      if (currentU.length === 0) return state;
      var withoutLast = currentU.slice(0, -1);
      return { ...state, annotations: { ...state.annotations, [pdfU]: withoutLast } };
    }
    case 'CLEAR_CURRENT_PAGE': {
      var pdfC = state.currentPDF;
      return { ...state, annotations: { ...state.annotations, [pdfC]: [] } };
    }
    case 'ADD_ANNOTATION': {
      var currentAdd = state.annotations[action.pdf] || [];
      var ann: Annotation = {
        ...action.payload,
        id: action.payload.id || generateId(),
        reviewer: action.payload.reviewer || state.reviewer || 'Anonymous',
        timestamp: action.payload.timestamp || new Date().toISOString(),
        status: action.payload.status || 'draft',
        versions: action.payload.versions || [],
        currentVersion: action.payload.currentVersion || 0,
        objects: action.payload.objects || [],
        comment: action.payload.comment || '',
        color: action.payload.color || state.color,
        type: action.payload.type || 'comment',
        page: action.payload.page || 1,
      };
      return { ...state, annotations: { ...state.annotations, [action.pdf]: [...currentAdd, ann] } };
    }
    case 'DELETE_ANNOTATION': {
      var currentDel = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: currentDel.filter(function(a: Annotation) { return a.id !== action.id; }),
        },
      };
    }
    case 'UPDATE_ANNOTATION': {
      var currentUpd = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: currentUpd.map(function(a: Annotation) {
            return a.id === action.id ? { ...a, ...action.changes } : a;
          }),
        },
      };
    }
    case 'UPDATE_STATUS': {
      var currentSt = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: currentSt.map(function(a: Annotation) {
            if (a.id === action.id) return updateAnnotationStatus(a, action.status);
            return a;
          }),
        },
      };
    }
    case 'ADD_REPLY': {
      var currentRp = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: currentRp.map(function(a: Annotation) {
            if (a.id === action.id) return addReply(a, action.message, action.author);
            return a;
          }),
        },
      };
    }
    case 'ADD_VERSION': {
      var currentVr = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: currentVr.map(function(a: Annotation) {
            if (a.id === action.id) {
              return {
                ...a,
                objects: action.version.objects,
                versions: a.versions.concat([action.version]),
                currentVersion: a.versions.length,
                timestamp: action.version.timestamp,
              };
            }
            return a;
          }),
        },
      };
    }
    default:
      return state;
  }
}

var Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider(props: { children: ReactNode }) {
  var _a = useReducer(reducer, initialState);
  var state = _a[0];
  var dispatch = _a[1];
  return React.createElement(
    Ctx.Provider,
    { value: { state: state, dispatch: dispatch } },
    props.children
  );
}

export function useAppState() {
  var ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
