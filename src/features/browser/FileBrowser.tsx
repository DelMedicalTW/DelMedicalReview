import React, { useState, useEffect } from 'react';
import { useAnnotationStore } from '../../state/AnnotationContext';
import { fetchContents } from '../../services/githubApi';
import { FolderOpen, ArrowLeft, Search, Folder, FileText } from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

export function FileBrowser() {
  const { state, dispatch } = useAnnotationStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadDir(state.currentPath || '');
  }, [state.currentPath]);

  async function loadDir(path: string) {
    setLoading(true);
    try {
      const contents = await fetchContents(path);
      if (Array.isArray(contents)) {
        const dirs = contents.filter((c: any) => c.type === 'dir');
        const pdfs = contents.filter(
          (c: any) => c.type === 'file' && c.name.toLowerCase().endsWith('.pdf')
        );
        setFiles([
          ...dirs.sort((a: any, b: any) => a.name.localeCompare(b.name)),
          ...pdfs.sort((a: any, b: any) => a.name.localeCompare(b.name)),
        ]);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleFileClick = (item: FileItem) => {
    if (item.type === 'dir') {
      dispatch({ type: 'SET_PATH', payload: item.path });
    } else {
      dispatch({ type: 'SET_PDF', payload: item.name });
    }
  };

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-80 min-w-[320px] bg-base-200 border-r border-base-300 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-base-300 flex items-center gap-2 flex-shrink-0">
        <FolderOpen className="w-4 h-4 text-warning" />
        <h3 className="font-semibold text-sm flex-1">Documents</h3>
        <button className="btn btn-ghost btn-xs" disabled={!state.currentPath}>
          <ArrowLeft className="w-3 h-3" /> Back
        </button>
      </div>
      <div className="p-3">
        <label className="input input-bordered input-sm flex items-center gap-2">
          <Search className="w-4 h-4 text-base-content/40" />
          <input
            type="text"
            className="grow"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.path}
              className={`file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 select-none ${
                state.currentPDF === item.name ? 'active-file' : ''
              }`}
              onClick={() => handleFileClick(item)}
            >
              {item.type === 'dir' ? (
                <Folder className="w-4 h-4 text-warning flex-shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-error flex-shrink-0" />
              )}
              <span className="truncate">{item.name}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
