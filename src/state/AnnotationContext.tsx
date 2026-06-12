import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Annotation, Tool, AppState } from '../core/types';

type Action =
  | { type: 'SET_PDF'; payload: string }
  | { type: 'SET_PATH'; payload: string }
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'SET_COLOR'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ANNOTATIONS'; pdf: string; payload: Annotation[] }
  | { type: 'SET_SYNC_STATUS'; payload: AppState['syncStatus'] }
  | { type: 'SET_LAST_SYNC'; payload: string | null }
  | { type: 'MARK_DIRTY'; payload: string }
  | { type: 'MARK_DELETED'; payload: string }
  | { type: 'CLEAR_DIRTY' }
  | { type: 'SET_SHA'; pdf: string; payload: string | null };

const initialState: AppState = {
  currentPDF: '',
  currentPath: '',
  annotations: {},
  tool: 'select',
  color: 'rgba(255,213,79,0.45)',
  isLoadingPDF: false,
  syncStatus: 'idle',
  lastSyncTime: localStorage.getItem('delmed-last-sync'),
  dirtyAnnotations: {},
  deletedAnnotations: {},
  fileShas: {},
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PDF':
      return { ...state, currentPDF: action.payload };
    case 'SET_PATH':
      return { ...state, currentPath: action.payload };
    case 'SET_TOOL':
      return { ...state, tool: action.payload };
    case 'SET_COLOR':
      return { ...state, color: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoadingPDF: action.payload };
    case 'SET_ANNOTATIONS':
      return {
        ...state,
        annotations: { ...state.annotations, [action.pdf]: action.payload },
      };
    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload };
    case 'SET_LAST_SYNC':
      return { ...state, lastSyncTime: action.payload };
    case 'MARK_DIRTY':
      return {
        ...state,
        dirtyAnnotations: { ...state.dirtyAnnotations, [action.payload]: true },
      };
    case 'MARK_DELETED':
      return {
        ...state,
        deletedAnnotations: { ...state.deletedAnnotations, [action.payload]: true },
      };
    case 'CLEAR_DIRTY':
      return { ...state, dirtyAnnotations: {}, deletedAnnotations: {} };
    case 'SET_SHA':
      return {
        ...state,
        fileShas: { ...state.fileShas, [action.pdf]: action.payload },
      };
    default:
      return state;
  }
}

interface ContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const Ctx = createContext<ContextValue | null>(null);

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useAnnotationStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAnnotationStore must be used within AnnotationProvider');
  return ctx;
}
