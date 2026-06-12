import { useCallback } from 'react';
import { useAnnotationStore } from '../state/AnnotationContext';
import { Annotation, AnnotationType } from '../core/types';
import { saveLocal } from '../services/syncService';

export function useAnnotations() {
  const { state, dispatch } = useAnnotationStore();

  const getAnnotations = useCallback(
    (pdf?: string): Annotation[] => {
      const key = pdf || state.currentPDF;
      return state.annotations[key] || [];
    },
    [state.annotations, state.currentPDF]
  );

  const addAnnotation = useCallback(
    (pdf: string, ann: Annotation) => {
      const current = state.annotations[pdf] || [];
      const updated = { ...state.annotations, [pdf]: [...current, ann] };
      dispatch({ type: 'SET_ANNOTATIONS', pdf, payload: [...current, ann] });
      saveLocal(updated);
    },
    [dispatch, state.annotations]
  );

  const deleteAnnotation = useCallback(
    (pdf: string, annId: string) => {
      const current = state.annotations[pdf] || [];
      const updated = { ...state.annotations, [pdf]: current.filter((a) => a.id !== annId) };
      dispatch({ type: 'SET_ANNOTATIONS', pdf, payload: updated[pdf] });
      saveLocal(updated);
    },
    [dispatch, state.annotations]
  );

  const updateAnnotation = useCallback(
    (pdf: string, annId: string, patch: Partial<Annotation>) => {
      const current = state.annotations[pdf] || [];
      const updated = {
        ...state.annotations,
        [pdf]: current.map((a) => (a.id === annId ? { ...a, ...patch } : a)),
      };
      dispatch({ type: 'SET_ANNOTATIONS', pdf, payload: updated[pdf] });
      saveLocal(updated);
    },
    [dispatch, state.annotations]
  );

  return {
    annotations: state.annotations,
    getAnnotations,
    addAnnotation,
    deleteAnnotation,
    updateAnnotation,
    currentPDF: state.currentPDF,
  };
}
