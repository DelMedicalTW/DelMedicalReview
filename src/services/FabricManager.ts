import { fabric } from 'fabric';

export class FabricManager {
  private canvases: Map<number, fabric.Canvas> = new Map();
  private handlers: Map<number, () => void> = new Map();

  create(page: number, el: HTMLCanvasElement): fabric.Canvas {
    this.disposePage(page);
    const canvas = new fabric.Canvas(el, {
      selection: false,
      isDrawingMode: false,
      renderOnAddRemove: true,
    });
    // TypeScript doesn't know about lowerCanvasEl, but it exists at runtime
    (canvas as any).lowerCanvasEl.style.pointerEvents = 'none';
    this.canvases.set(page, canvas);
    return canvas;
  }

  get(page: number): fabric.Canvas | undefined {
    return this.canvases.get(page);
  }

  setHandler(page: number, handler: () => void): void {
    this.handlers.set(page, handler);
  }

  disposePage(page: number): void {
    const canvas = this.canvases.get(page);
    const handler = this.handlers.get(page);
    if (canvas) {
      if (handler) canvas.off('path:created', handler);
      canvas.off();
      canvas.dispose();
      this.canvases.delete(page);
    }
    this.handlers.delete(page);
  }

  disposeAll(): void {
    this.canvases.forEach((canvas, page) => {
      const handler = this.handlers.get(page);
      if (handler) canvas.off('path:created', handler);
      canvas.off();
      canvas.dispose();
    });
    this.canvases.clear();
    this.handlers.clear();
  }

  clearPage(page: number): void {
    const canvas = this.canvases.get(page);
    if (canvas) {
      canvas.clear();
      canvas.renderAll();
    }
  }

  getAllObjects(page: number): fabric.Object[] {
    const canvas = this.canvases.get(page);
    return canvas ? canvas.getObjects() : [];
  }

  setTool(tool: string, color: string): void {
    this.canvases.forEach((fc) => {
      const canvasAny = fc as any;
      if (!canvasAny.lowerCanvasEl) return;
      const el = canvasAny.lowerCanvasEl as HTMLElement;
      if (tool === 'select' || tool === 'highlight') {
        el.style.pointerEvents = 'none';
        fc.isDrawingMode = false;
        fc.selection = false;
      } else if (tool === 'draw') {
        el.style.pointerEvents = 'auto';
        fc.isDrawingMode = true;
        fc.selection = false;
        (fc as any).freeDrawingBrush.color = color.replace(/[\d.]+\)$/, '1)');
        (fc as any).freeDrawingBrush.width = 3;
      } else {
        el.style.pointerEvents = 'auto';
        fc.isDrawingMode = false;
        fc.selection = false;
      }
      fc.renderAll();
    });
  }
}
