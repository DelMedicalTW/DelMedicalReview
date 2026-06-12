import React from 'react';
import { useAnnotationStore } from '../../state/AnnotationContext';
import { FabricManager } from '../../services/FabricManager';
import { MousePointer2, Highlighter, Pen, Square, StickyNote, Undo2, Trash2 } from 'lucide-react';

interface ToolbarProps {
  fabricManager: FabricManager;
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'draw', icon: Pen, label: 'Draw' },
  { id: 'rectangle', icon: Square, label: 'Rect' },
  { id: 'comment', icon: StickyNote, label: 'Note' },
] as const;

const COLORS = [
  'rgba(255,213,79,0.45)',
  'rgba(88,166,255,0.45)',
  'rgba(63,185,80,0.45)',
  'rgba(248,81,73,0.45)',
];

export function Toolbar({ fabricManager }: ToolbarProps) {
  const { state, dispatch } = useAnnotationStore();

  const setTool = (tool: string) => {
    dispatch({ type: 'SET_TOOL', payload: tool as any });
    fabricManager.setTool(tool, state.color);
  };

  const setColor = (color: string) => {
    dispatch({ type: 'SET_COLOR', payload: color });
    fabricManager.setTool(state.tool, color);
  };

  return (
    <div className="bg-base-200 border-b border-base-300 px-3 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
      <div className="join flex-shrink-0">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`join-item btn btn-sm ${state.tool === id ? '!bg-primary !text-primary-content font-semibold' : 'btn-ghost'}`}
            onClick={() => setTool(id)}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">{label}</span>
          </button>
        ))}
      </div>
      <div className="divider divider-horizontal mx-1" />
      <span className="text-xs text-base-content/50">Color:</span>
      <div className="flex gap-1">
        {COLORS.map((color, i) => {
          const bgColors = ['#ffd54f', '#58a6ff', '#3fb950', '#f85149'];
          return (
            <span
              key={i}
              className={`color-btn w-6 h-6 rounded-full border-2 cursor-pointer flex-shrink-0 transition-all hover:scale-125 ${
                state.color === color ? '!border-white shadow-[0_0_0_2px_var(--fallback-p,oklch(var(--p)))]' : 'border-transparent'
              }`}
              style={{ background: bgColors[i] }}
              onClick={() => setColor(color)}
              title={['Yellow', 'Blue', 'Green', 'Red'][i]}
            />
          );
        })}
      </div>
      <div className="flex-1" />
      <button className="btn btn-ghost btn-sm" title="Undo">
        <Undo2 className="w-4 h-4" />
      </button>
      <button className="btn btn-ghost btn-sm text-error" title="Clear Page">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
