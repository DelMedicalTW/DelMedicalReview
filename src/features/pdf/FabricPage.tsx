import React, { useRef, useEffect, useCallback } from 'react';
import { FabricManager } from '../../services/FabricManager';
import { PDF_SCALE } from '../../core/constants';

interface FabricPageProps {
  pageNum: number;
  pdfDoc: any;
  fabricManager: FabricManager;
}

export function FabricPage({ pageNum, pdfDoc, fabricManager }: FabricPageProps) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    async function render() {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: PDF_SCALE });
      if (cancelled) return;
      setDimensions({ width: vp.width, height: vp.height });

      const pdfCanvas = pdfCanvasRef.current;
      const fabricCanvas = fabricCanvasRef.current;
      if (!pdfCanvas || !fabricCanvas) return;

      pdfCanvas.width = vp.width;
      pdfCanvas.height = vp.height;
      await page.render({ canvasContext: pdfCanvas.getContext('2d')!, viewport: vp }).promise;

      fabricCanvas.width = vp.width;
      fabricCanvas.height = vp.height;
      fabricManager.create(pageNum, fabricCanvas);
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum, fabricManager]);

  if (!dimensions.width) return null;

  return (
    <div
      ref={wrapperRef}
      className="page-wrapper relative bg-white flex-shrink-0 shadow-lg"
      style={{ width: dimensions.width, height: dimensions.height }}
      data-page={pageNum}
    >
      <canvas ref={pdfCanvasRef} className="block" />
      <canvas
        ref={fabricCanvasRef}
        className="ann-canvas absolute top-0 left-0 z-10"
      />
      <div className="page-label absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none z-20">
        Page {pageNum}
      </div>
    </div>
  );
}
