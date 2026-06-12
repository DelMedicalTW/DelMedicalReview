import React from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { MousePointer2, Highlighter, Pen, Square, StickyNote, Undo2, Trash2 } from 'lucide-react';

const TOOLS = [
  { id: 'select' as const, icon: MousePointer2, label: 'Select' },
  { id: 'highlight' as const, icon: Highlighter, label: 'Highlight' },
  { id: 'draw' as const, icon: Pen, label: 'Draw' },
  { id: 'rectangle' as const, icon: Square, label: 'Rect' },
  { id: 'comment' as const, icon: StickyNote, label: 'Note' },
];
const COLORS = ['rgba(255,213,79,0.45)','rgba(88,166,255,0.45)','rgba(63,185,80,0.45)','rgba(248,81,73,0.45)'];
const BG = ['#ffd54f','#58a6ff','#3fb950','#f85149'];

export function Toolbar() {
  const { state, dispatch } = useAppState();
  return (
    <div className="bg-base-200 border-b border-base-300 px-3 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
      <div className="join flex-shrink-0">
        {TOOLS.map(({id,icon:Icon,label})=>(
          <button key={id} className={`join-item btn btn-sm ${state.tool===id?'!bg-primary !text-primary-content font-semibold':'btn-ghost'}`} onClick={()=>dispatch({type:'SET_TOOL',payload:id})}>
            <Icon className="w-4 h-4" /><span className="hidden sm:inline ml-1">{label}</span>
          </button>
        ))}
      </div>
      <div className="divider divider-horizontal mx-1" />
      <span className="text-xs text-base-content/50">Color:</span>
      <div className="flex gap-1">
        {COLORS.map((c,i)=>(
          <span key={i} className={`w-6 h-6 rounded-full border-2 cursor-pointer flex-shrink-0 transition-all hover:scale-125 ${state.color===c?'!border-white shadow-[0_0_0_2px_var(--fallback-p,oklch(var(--p)))]':'border-transparent'}`}
            style={{background:BG[i]}} onClick={()=>dispatch({type:'SET_COLOR',payload:c})} />
        ))}
      </div>
      <div className="flex-1" />
      <button className="btn btn-ghost btn-sm"><Undo2 className="w-4 h-4" /></button>
      <button className="btn btn-ghost btn-sm text-error"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}
