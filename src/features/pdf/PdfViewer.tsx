import React, { useRef, useEffect } from 'react';
import { usePdf } from '../../hooks/usePdf';
import { useAnnotationStore } from '../../state/AnnotationContext';
import { FabricManager } from '../../services/FabricManager';
import { FabricPage } from './FabricPage';

interface PdfViewerProps {
  pdfPath: string;
  fabricManager: FabricManager;
}

export function PdfViewer({ pdfPath, fabricManager }: PdfViewerProps) {
  const { state } = useAnnotationStore();
  const { pdfDoc, numPages, loading, loadPDF } = usePdf();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pdfPath) loadPDF(pdfPath);
  }, [pdfPath, loadPDF]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#525659]">
        <span className="loading loading-spinner loading-lg text-white/50" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-[#525659] py-5 flex flex-col items-center gap-4">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <FabricPage
          key={pageNum}
          pageNum={pageNum}
          pdfDoc={pdfDoc}
          fabricManager={fabricManager}
        />
      ))}
    </div>
  );
}
