import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { fetchPDF } from '../services/githubApi';
import { PDF_SCALE } from '../core/constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export function usePdf() {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadPDF = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const data = await fetchPDF(path);
      const header = String.fromCharCode(...new Uint8Array(data.slice(0, 5)));
      if (!header.startsWith('%PDF')) throw new Error('Not a valid PDF');
      const doc = await pdfjsLib.getDocument({ data }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      return doc;
    } finally {
      setLoading(false);
    }
  }, []);

  const renderPage = useCallback(
    async (pageNum: number, canvas: HTMLCanvasElement) => {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: PDF_SCALE });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      return { page, vp };
    },
    [pdfDoc]
  );

  return { pdfDoc, numPages, loading, loadPDF, renderPage };
}
