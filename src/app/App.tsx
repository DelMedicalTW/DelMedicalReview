import React, { useRef } from 'react';
import { AnnotationProvider, useAnnotationStore } from '../state/AnnotationContext';
import { PdfViewer } from '../features/pdf/PdfViewer';
import { AnnotationSidebar } from '../features/annotations/AnnotationSidebar';
import { FileBrowser } from '../features/browser/FileBrowser';
import { Toolbar } from '../features/toolbar/Toolbar';
import { FabricManager } from '../services/FabricManager';
import { Palette, FolderTree, MessageSquareText, Upload, Download, FileText, Monitor, Moon, Sun, Cake, Zap } from 'lucide-react';

function AppContent() {
  const { state, dispatch } = useAnnotationStore();
  const fabricManager = useRef(new FabricManager()).current;

  const themes = [
    { name: 'auto', icon: Monitor, label: 'Auto' },
    { name: 'dark', icon: Moon, label: 'Dark' },
    { name: 'light', icon: Sun, label: 'Light' },
    { name: 'cupcake', icon: Cake, label: 'Cupcake' },
    { name: 'cyberpunk', icon: Zap, label: 'Cyberpunk' },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Navbar */}
      <nav className="navbar bg-base-200 border-b border-base-300 px-4 py-2 flex-shrink-0 z-20 min-h-0 gap-2">
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="text-primary font-bold text-lg hidden sm:inline">Del Medical</span>
          <span className="text-sm text-base-content/50 truncate hidden md:inline">
            {state.currentPDF || 'PDF Review Portal'}
          </span>
        </div>
        <div className="flex-none flex items-center gap-1">
          <div className="tooltip tooltip-bottom" data-tip="Sync status">
            <span className="badge badge-sm gap-1">
              <Upload className="w-3 h-3" />
              <span>GitHub</span>
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" title="Export">
            <Download className="w-4 h-4" />
          </button>
          <button className="btn btn-ghost btn-sm" title="Sync to GitHub">
            <Upload className="w-4 h-4" />
          </button>
          <div className="dropdown dropdown-end">
            <button className="btn btn-ghost btn-sm btn-square" tabIndex={0}>
              <Palette className="w-4 h-4" />
            </button>
            <ul className="dropdown-content z-30 menu p-2 shadow-lg bg-base-200 rounded-box w-48 mt-2">
              {themes.map((t) => (
                <li key={t.name}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      const theme = t.name === 'auto'
                        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                        : t.name;
                      document.documentElement.setAttribute('data-theme', theme);
                      localStorage.setItem('delmed-theme', t.name);
                    }}
                  >
                    <t.icon className="w-4 h-4" /> {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <button className="btn btn-ghost btn-sm btn-square" title="Toggle file browser">
            <FolderTree className="w-4 h-4" />
          </button>
          <button className="btn btn-ghost btn-sm btn-square" title="Toggle comments">
            <MessageSquareText className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <FileBrowser />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Toolbar fabricManager={fabricManager} />
          <PdfViewer pdfPath="" fabricManager={fabricManager} />
        </main>
        <AnnotationSidebar />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AnnotationProvider>
      <AppContent />
    </AnnotationProvider>
  );
}
