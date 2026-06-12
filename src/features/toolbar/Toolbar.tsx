import React from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { MousePointer2, Highlighter, Pen, Square, StickyNote, Undo2, Trash2, Eye, EyeOff } from 'lucide-react';

var TOOLS = [
  { id: 'select' as const, icon: MousePointer2, label: 'Select' },
  { id: 'highlight' as const, icon: Highlighter, label: 'Highlight' },
  { id: 'draw' as const, icon: Pen, label: 'Draw' },
  { id: 'rectangle' as const, icon: Square, label: 'Rect' },
  { id: 'comment' as const, icon: StickyNote, label: 'Note' },
];
var COLORS = ['rgba(255,213,79,0.45)','rgba(88,166,255,0.45)','rgba(63,185,80,0.45)','rgba(248,81,73,0.45)'];
var BG = ['#ffd54f','#58a6ff','#3fb950','#f85149'];

export function Toolbar() {
  var _a = useAppState();
  var state = _a.state;
  var dispatch = _a.dispatch;

  return React.createElement('div', {
    className: 'bg-base-200 border-b border-base-300 px-3 py-2 flex items-center gap-1 flex-shrink-0 flex-wrap',
  },
    // Tool buttons
    TOOLS.map(function(t) {
      var isActive = state.tool === t.id;
      return React.createElement('button', {
        key: t.id,
        className: 'btn btn-sm ' + (isActive ? 'btn-primary' : 'btn-ghost'),
        onClick: function() { dispatch({ type: 'SET_TOOL', payload: t.id }); },
        title: t.label + ' Tool',
      },
        React.createElement(t.icon, { className: 'w-4 h-4' }),
        React.createElement('span', { className: 'hidden sm:inline ml-1' }, t.label)
      );
    }),

    // Divider
    React.createElement('div', { className: 'divider divider-horizontal mx-1' }),

    // Color label
    React.createElement('span', { className: 'text-xs text-base-content/50 flex-shrink-0' }, 'Color:'),

    // Color buttons
    COLORS.map(function(c, i) {
      var isSelected = state.color === c;
      return React.createElement('span', {
        key: i,
        className: 'w-6 h-6 rounded-full border-2 cursor-pointer flex-shrink-0 transition-all hover:scale-125 ' + (isSelected ? '!border-white shadow-[0_0_0_2px_var(--fallback-p,oklch(var(--p)))]' : 'border-transparent'),
        style: { background: BG[i] },
        onClick: function() { dispatch({ type: 'SET_COLOR', payload: c }); },
        title: ['Yellow', 'Blue', 'Green', 'Red'][i],
      });
    }),

    // Spacer
    React.createElement('div', { className: 'flex-1' }),

    // Toggle annotations visibility — keeps text selection active
    React.createElement('button', {
      className: 'btn btn-ghost btn-sm',
      title: state.showAnnotations ? 'Hide Annotations' : 'Show Annotations',
      onClick: function() { dispatch({ type: 'TOGGLE_ANNOTATIONS' }); },
    },
      state.showAnnotations
        ? React.createElement(Eye, { className: 'w-4 h-4' })
        : React.createElement(EyeOff, { className: 'w-4 h-4' })
    ),

    // Undo
    React.createElement('button', {
      className: 'btn btn-ghost btn-sm',
      title: 'Undo last annotation',
      onClick: function() { dispatch({ type: 'UNDO_LAST' }); },
    },
      React.createElement(Undo2, { className: 'w-4 h-4' })
    ),

    // Clear page
    React.createElement('button', {
      className: 'btn btn-ghost btn-sm text-error',
      title: 'Clear all annotations on current page',
      onClick: function() {
        if (window.confirm('Remove all annotations on the current page?')) {
          dispatch({ type: 'CLEAR_CURRENT_PAGE' });
        }
      },
    },
      React.createElement(Trash2, { className: 'w-4 h-4' })
    )
  );
}
