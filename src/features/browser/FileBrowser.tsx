import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { fetchContents } from '../../services/githubApi';
import { FolderOpen, ArrowLeft, Search, Folder, FileText } from 'lucide-react';

interface FileItem { name: string; path: string; type: 'dir' | 'file'; }

export function FileBrowser() {
  const { state, dispatch } = useAppState();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    dispatch({ type: 'SET_PATH', payload: path });
    try {
      const contents = await fetchContents(path);
      if (Array.isArray(contents)) {
        const items: FileItem[] = contents
          .filter((c: any) => c.type === 'dir' || c.name.toLowerCase().endsWith('.pdf'))
          .map((c: any) => ({ name: c.name, path: c.path, type: c.type }))
          .sort((a: FileItem, b: FileItem) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        setFiles(items);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [dispatch]);

  useEffect(() => { loadDir(state.currentPath); }, [state.currentPath, loadDir]);

  const handleBack = () => {
    if (!state.currentPath) return;
    const parts = state.currentPath.split('/'); parts.pop();
    loadDir(parts.join('/'));
  };

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="w-80 min-w-[320px] bg-base-200 border-r border-base-300 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-base-300 flex items-center gap-2 flex-shrink-0">
        <FolderOpen className="w-4 h-4 text-warning" />
        <h3 className="font-semibold text-sm flex-1">Documents</h3>
        <button className="btn btn-ghost btn-xs" onClick={handleBack} disabled={!state.currentPath}><ArrowLeft className="w-3 h-3" /> Back</button>
      </div>
      <div className="p-3">
        <label className="input input-bordered input-sm flex items-center gap-2">
          <Search className="w-4 h-4 text-base-content/40" />
          <input type="text" className="grow" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="text-center py-8"><span className="loading loading-spinner loading-sm" /></div> : filtered.map(item=>(
          <div key={item.path}
            className={`file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 select-none border-l-3 border-transparent ${state.currentPDF===item.name?'!border-primary bg-primary/10':''}`}
            onClick={()=>item.type==='dir'?loadDir(item.path):dispatch({type:'SET_PDF',name:item.name,path:item.path})}>
            {item.type==='dir'?<Folder className="w-4 h-4 text-warning flex-shrink-0" />:<FileText className="w-4 h-4 text-error flex-shrink-0" />}
            <span className="truncate">{item.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
