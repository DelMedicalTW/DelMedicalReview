import { useRef, useEffect, useCallback } from 'react';
import { FabricManager } from '../services/FabricManager';

export function useFabricCanvas(page: number) {
  const managerRef = useRef<FabricManager | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.disposePage(page);
      }
    };
  }, [page]);

  const initCanvas = useCallback(
    (el: HTMLCanvasElement, manager: FabricManager) => {
      managerRef.current = manager;
      canvasRef.current = el;
      return manager.create(page, el);
    },
    [page]
  );

  return {
    canvasRef,
    initCanvas,
    getCanvas: () => managerRef.current?.get(page),
  };
}
