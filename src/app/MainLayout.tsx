import React from 'react';
import { useAppState } from '../state/AnnotationContext';
import { FileBrowser } from '../features/browser/FileBrowser';
import { PdfViewer } from '../features/pdf/PdfViewer';
import { Toolbar } from '../features/toolbar/Toolbar';
import { AnnotationSidebar } from '../features/annotations/AnnotationSidebar';
import { FileText, Palette, FolderTree, MessageSquareText } from 'lucide-react';

export function MainLayout() {
  var _a = useAppState(), state = _a.state, dispatch = _a.dispatch;

  return React.createElement('div', { className: 'h-screen flex flex-col overflow-hidden' },
    React.createElement('nav', { className: 'navbar bg-base-200 border-b border-base-300 px-4 py-2 flex-shrink-0 z-20 min-h-0 gap-2' },
      React.createElement('div', { className: 'flex-1 flex items-center gap-3 min-w-0' },
        React.createElement(FileText, { className: 'w-5 h-5 text-primary flex-shrink-0' }),
        React.createElement('span', { className: 'text-primary font-bold text-lg hidden sm:inline' }, 'PDF Review Portal'),
        React.createElement('span', { className: 'text-sm text-base-content/50 truncate hidden md:inline' }, state.currentPDF || 'PDF Review Portal')
      ),
      React.createElement('div', { className: 'flex-none flex items-center gap-1' },
        React.createElement('div', { className: 'dropdown dropdown-end' },
          React.createElement('button', { className: 'btn btn-ghost btn-sm btn-square', tabIndex: 0 }, React.createElement(Palette, { className: 'w-4 h-4' })),
          React.createElement('ul', { className: 'dropdown-content z-30 menu p-2 shadow-lg bg-base-200 rounded-box w-40 mt-2' },
            ['dark','light','cupcake','cyberpunk','forest'].map(function(t: string) {
              return React.createElement('li', { key: t },
                React.createElement('a', { href: '#', onClick: function(e: any) { e.preventDefault(); document.documentElement.setAttribute('data-theme', t); localStorage.setItem('delmed-theme', t); } }, t)
              );
            })
          )
        ),
        React.createElement('button', { className: 'btn btn-ghost btn-sm btn-square', onClick: function() { dispatch({ type:'TOGGLE_BROWSER' }); } }, React.createElement(FolderTree, { className: 'w-4 h-4' })),
        React.createElement('button', { className: 'btn btn-ghost btn-sm btn-square', onClick: function() { dispatch({ type:'TOGGLE_SIDEBAR' }); } }, React.createElement(MessageSquareText, { className: 'w-4 h-4' }))
      )
    ),
    React.createElement('div', { className: 'flex flex-1 overflow-hidden' },
      state.showBrowser ? React.createElement(FileBrowser, null) : null,
      React.createElement('main', { className: 'flex-1 flex flex-col overflow-hidden' },
        state.currentPDF ? React.createElement(Toolbar, null) : null,
        React.createElement(PdfViewer, null)
      ),
      state.showSidebar ? React.createElement(AnnotationSidebar, null) : null
    )
  );
}
