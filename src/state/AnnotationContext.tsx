import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Annotation, Tool, AnnotationType, AnnotationStatus } from '../core/types';

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
  | { type: 'TOGGLE_SIDEBAR' };

function generateId(): string {
  return 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

const initialState: AppState = {
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
    case 'ADD_ANNOTATION': {
      const current = state.annotations[action.pdf] || [];
      const ann = {
        ...action.payload,
        id: action.payload.id || generateId(),
        reviewer: action.payload.reviewer || state.reviewer || 'Anonymous',
        timestamp: action.payload.timestamp || new Date().toISOString(),
        status: action.payload.status || 'open',
      };
      return { ...state, annotations: { ...state.annotations, [action.pdf]: [...current, ann] } };
    }
    case 'DELETE_ANNOTATION': {
      const current = state.annotations[action.pdf] || [];
      return { ...state, annotations: { ...state.annotations, [action.pdf]: current.filter(a => a.id !== action.id) } };
    }
    case 'UPDATE_ANNOTATION': {
      const current = state.annotations[action.pdf] || [];
      return {
        ...state,
        annotations: {
          ...state.annotations,
          [action.pdf]: current.map(a => a.id === action.id ? { ...a, ...action.changes } : a),
        },
      };
    }
    case 'TOGGLE_BROWSER':
      return { ...state, showBrowser: !state.showBrowser };
    case 'TOGGLE_SIDEBAR':
      return { ...state, showSidebar: !state.showSidebar };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
