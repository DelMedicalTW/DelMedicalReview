import React, { useState } from 'react';
import { useAnnotations } from '../../hooks/useAnnotations';
import { AnnotationCard } from './AnnotationCard';
import { FileText, MessageSquareText, Inbox } from 'lucide-react';

export function AnnotationSidebar() {
  const { getAnnotations, currentPDF } = useAnnotations();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('page-asc');

  const all = getAnnotations();
  const filtered = all
    .filter((a) => typeFilter === 'all' || a.type === typeFilter)
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'page-asc') return a.page - b.page;
      if (sortBy === 'page-desc') return b.page - a.page;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  return (
    <aside className="w-[400px] min-w-[400px] bg-base-200 border-l border-base-300 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-base-300 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-info" /> Annotations
        </h3>
        <span className="badge badge-sm">{filtered.length}</span>
      </div>

      <div className="p-2 border-b border-base-300 flex-shrink-0 space-y-1">
        <input
          type="text"
          className="input input-bordered input-sm w-full"
          placeholder="Your name..."
          defaultValue={localStorage.getItem('delmed-reviewer') || ''}
          onChange={(e) => localStorage.setItem('delmed-reviewer', e.target.value)}
        />
        <div className="flex gap-1">
          <select className="select select-bordered select-xs flex-1" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="highlight">Highlights</option>
            <option value="drawing">Drawings</option>
            <option value="rectangle">Rects</option>
            <option value="comment">Notes</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in-review">In Review</option>
            <option value="resolved">Resolved</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="page-asc">Page ↑</option>
            <option value="page-desc">Page ↓</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-base-content/40 text-sm">
            <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No annotations yet</p>
          </div>
        ) : (
          filtered.map((ann) => <AnnotationCard key={ann.id} annotation={ann} />)
        )}
      </div>

      <div className="p-2 border-t border-base-300 text-xs text-base-content/40 text-center flex items-center justify-center gap-4">
        <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Local</span>
      </div>
    </aside>
  );
}
