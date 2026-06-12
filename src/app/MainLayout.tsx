import React from 'react';
import { useAppState } from '../state/AnnotationContext';
import { FileBrowser } from '../features/browser/FileBrowser';
import { PdfViewer } from '../features/pdf/PdfViewer';
import { Toolbar } from '../features/toolbar/Toolbar';
import { AnnotationSidebar } from '../features/annotations/AnnotationSidebar';
import { FileText, Palette, FolderTree, MessageSquareText, Upload, Download } from 'lucide-react';

export function MainLayout() {
  const { state, dispatch } = useAppState();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <nav className="navbar bg-base-200 border-b border-base-300 px-4 py-2 flex-shrink-0 z-20 min-h-0 gap-2">
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="text-primary font-bold text-lg hidden sm:inline">PDF Review Portal</span>
          <span className="text-sm text-base-content/50 truncate hidden md:inline">
            {state.currentPDF || 'PDF Review Portal'}
          </span>
        </div>
        <div className="flex-none flex items-center gap-1">
          <button className="btn btn-ghost btn-sm"><Download className="w-4 h-4" /></button>
          <button className="btn btn-ghost btn-sm"><Upload className="w-4 h-4" /></button>
          <div className="dropdown dropdown-end">
            <button className="btn btn-ghost btn-sm btn-square" tabIndex={0}><Palette className="w-4 h-4" /></button>
            <ul className="dropdown-content z-30 menu p-2 shadow-lg bg-base-200 rounded-box w-40 mt-2">
              {['dark','light','cupcake','cyberpunk','forest'].map(t=>(
                <li key={t}><a href="#" onClick={e=>{e.preventDefault();document.documentElement.setAttribute('data-theme',t);localStorage.setItem('delmed-theme',t);}}>{t}</a></li>
              ))}
            </ul>
          </div>
          <button className="btn btn-ghost btn-sm btn-square" onClick={()=>dispatch({type:'TOGGLE_BROWSER'})}><FolderTree className="w-4 h-4" /></button>
          <button className="btn btn-ghost btn-sm btn-square" onClick={()=>dispatch({type:'TOGGLE_SIDEBAR'})}><MessageSquareText className="w-4 h-4" /></button>
        </div>
      </nav>
      <div className="flex flex-1 overflow-hidden">
        {state.showBrowser && <FileBrowser />}
        <main className="flex-1 flex flex-col overflow-hidden">
          {state.currentPDF && <Toolbar />}
          <PdfViewer />
        </main>
        {state.showSidebar && <AnnotationSidebar />}
      </div>
    </div>
  );
}
