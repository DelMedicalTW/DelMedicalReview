import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Annotation, Tool } from '../core/types';

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
}

type Action =
  | { type: 'SET_PDF'; name: string; path: string }
  | { type: 'SET_PATH'; payload: string }
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'SET_COLOR'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ANNOTATIONS'; pdf: string; payload: Annotation[] }
  | { type: 'TOGGLE_BROWSER' }
  | { type: 'TOGGLE_SIDEBAR' };

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
    case 'SET_ANNOTATIONS':
      return { ...state, annotations: { ...state.annotations, [action.pdf]: action.payload } };
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
