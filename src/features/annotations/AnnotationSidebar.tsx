import React, { useState } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { MessageSquareText, Inbox, X, ChevronDown, User } from 'lucide-react';

export function AnnotationSidebar() {
  const { state } = useAppState();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('page-asc');
  const all = state.annotations[state.currentPDF] || [];
  const filtered = all.filter(a=>(typeFilter==='all'||a.type===typeFilter)&&(statusFilter==='all'||a.status===statusFilter))
    .sort((a,b)=>{if(sortBy==='page-asc')return a.page-b.page;if(sortBy==='page-desc')return b.page-a.page;return new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime();});
  const labels: Record<string,string>={highlight:'HL',drawing:'DR',rectangle:'RC',comment:'NT'};
  const statusCls: Record<string,string>={open:'badge-error','in-review':'badge-warning',resolved:'badge-success'};
  return (
    <aside className="w-[400px] min-w-[400px] bg-base-200 border-l border-base-300 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-base-300 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-sm flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-info" /> Annotations</h3>
        <span className="badge badge-sm">{filtered.length}</span>
      </div>
      <div className="p-2 border-b border-base-300 flex-shrink-0 space-y-1">
        <input type="text" className="input input-bordered input-sm w-full" placeholder="Your name..." />
        <div className="flex gap-1">
          <select className="select select-bordered select-xs flex-1" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="all">All</option><option value="highlight">Highlights</option><option value="drawing">Drawings</option><option value="rectangle">Rects</option><option value="comment">Notes</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">All</option><option value="open">Open</option><option value="in-review">In Review</option><option value="resolved">Resolved</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
            <option value="page-asc">Page ↑</option><option value="page-desc">Page ↓</option><option value="newest">Newest</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {filtered.length===0?(
          <div className="text-center py-8 text-base-content/40 text-sm"><Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" /><p>No annotations yet</p></div>
        ):filtered.map(ann=>(
          <div key={ann.id} className="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary">
            <div className="card-body p-2">
              <div className="flex items-center gap-1 text-xs flex-wrap">
                <span className="badge badge-xs">{labels[ann.type]||'??'}</span>
                <span className={`badge badge-xs ${statusCls[ann.status]||'badge-ghost'}`}>{ann.status}</span>
                <span>Pg {ann.page}</span>
                {ann.reviewer&&<span className="text-base-content/40 flex items-center gap-0.5"><User className="w-3 h-3" />{ann.reviewer}</span>}
                <button className="btn btn-ghost btn-xs p-0 h-5 w-5 ml-auto"><X className="w-3 h-3" /></button>
                <div className="dropdown dropdown-end" onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-xs p-0 h-5 w-5"><ChevronDown className="w-3 h-3" /></button>
                  <ul className="dropdown-content menu p-1 bg-base-200 rounded-box w-28 z-30 text-xs">
                    <li><a href="#">In Review</a></li><li><a href="#">Resolved</a></li><li><a href="#">Reopen</a></li>
                  </ul>
                </div>
              </div>
              {ann.comment&&<p className="text-sm mt-1">{ann.comment}</p>}
              <div className="text-xs text-base-content/40">{new Date(ann.timestamp).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-base-300 text-xs text-base-content/40 text-center">Local Storage</div>
    </aside>
  );
}
