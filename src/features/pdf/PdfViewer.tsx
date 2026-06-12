import React, { useState } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { MessageSquareText, Inbox, X, ChevronDown, User, ExternalLink } from 'lucide-react';
import { Annotation } from '../../core/types';

const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  highlight: { label: 'HL', cls: 'badge-warning' },
  drawing: { label: 'DR', cls: 'badge-info' },
  rectangle: { label: 'RC', cls: 'badge-accent' },
  comment: { label: 'NT', cls: 'badge-success' },
};

const STATUS_CLASSES: Record<string, string> = {
  open: 'badge-error',
  'in-review': 'badge-warning',
  resolved: 'badge-success',
};

export function AnnotationSidebar() {
  const { state, dispatch } = useAppState();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('page-asc');

  const all = state.annotations[state.currentPDF] || [];

  const filtered = all
    .filter(a => (typeFilter === 'all' || a.type === typeFilter))
    .filter(a => (statusFilter === 'all' || a.status === statusFilter))
    .sort((a, b) => {
      if (sortBy === 'page-asc') return a.page - b.page;
      if (sortBy === 'page-desc') return b.page - a.page;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_ANNOTATION', pdf: state.currentPDF, id });
  };

  const handleStatus = (id: string, status: string) => {
    dispatch({ type: 'UPDATE_ANNOTATION', pdf: state.currentPDF, id, changes: { status: status as any } });
  };

  return (
    <aside className="w-[400px] min-w-[400px] bg-base-200 border-l border-base-300 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-base-300 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-info" /> Annotations
        </h3>
        <span className="badge badge-sm">{filtered.length}</span>
      </div>

      {/* Reviewer + Filters */}
      <div className="p-2 border-b border-base-300 flex-shrink-0 space-y-1">
        <label className="input input-bordered input-sm flex items-center gap-2">
          <User className="w-3 h-3 text-base-content/40" />
          <input
            type="text"
            className="grow"
            placeholder="Your name..."
            value={state.reviewer}
            onChange={e => dispatch({ type: 'SET_REVIEWER', payload: e.target.value })}
          />
        </label>
        <div className="flex gap-1">
          <select className="select select-bordered select-xs flex-1" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="highlight">Highlights</option>
            <option value="drawing">Drawings</option>
            <option value="rectangle">Rects</option>
            <option value="comment">Notes</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in-review">In Review</option>
            <option value="resolved">Resolved</option>
          </select>
          <select className="select select-bordered select-xs flex-1" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="page-asc">Page ↑</option>
            <option value="page-desc">Page ↓</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Annotation List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-base-content/40 text-sm">
            <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No annotations yet</p>
            <p className="text-xs mt-1">Use the toolbar to add highlights, drawings, or notes</p>
          </div>
        ) : (
          filtered.map(ann => {
            const badge = TYPE_BADGES[ann.type] || { label: '??', cls: 'badge-ghost' };
            const statusCls = STATUS_CLASSES[ann.status] || 'badge-ghost';

            return (
              <div
                key={ann.id}
                className="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary hover:shadow-md transition-all"
              >
                <div className="card-body p-2">
                  {/* Header row */}
                  <div className="flex items-center gap-1 text-xs flex-wrap">
                    <span className={`badge badge-xs ${badge.cls}`}>{badge.label}</span>
                    <span className={`badge badge-xs ${statusCls}`}>{ann.status}</span>
                    <span className="text-base-content/50">Pg {ann.page}</span>
                    {ann.reviewer && (
                      <span className="text-base-content/40 flex items-center gap-0.5">
                        <User className="w-3 h-3" /> {ann.reviewer}
                      </span>
                    )}
                    <button
                      className="btn btn-ghost btn-xs p-0 h-5 w-5 ml-auto text-error"
                      onClick={(e) => { e.stopPropagation(); handleDelete(ann.id); }}
                      title="Delete"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {/* Status dropdown */}
                    <div className="dropdown dropdown-end" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-xs p-0 h-5 w-5">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <ul className="dropdown-content menu p-1 bg-base-200 rounded-box w-28 z-30 text-xs shadow">
                        <li><a href="#" onClick={e => { e.preventDefault(); handleStatus(ann.id, 'in-review'); }}>In Review</a></li>
                        <li><a href="#" onClick={e => { e.preventDefault(); handleStatus(ann.id, 'resolved'); }}>Resolved</a></li>
                        <li><a href="#" onClick={e => { e.preventDefault(); handleStatus(ann.id, 'open'); }}>Reopen</a></li>
                      </ul>
                    </div>
                  </div>
                  {/* Comment */}
                  {ann.comment && <p className="text-sm mt-1">{ann.comment}</p>}
                  {ann.type === 'drawing' && !ann.comment && (
                    <p className="text-xs text-base-content/40 mt-1">Drawing annotation</p>
                  )}
                  {ann.quotedText && (
                    <blockquote className="border-l-2 border-secondary pl-2 my-1 text-base-content/60 italic text-xs">
                      {ann.quotedText.length > 100 ? ann.quotedText.substring(0, 100) + '...' : ann.quotedText}
                    </blockquote>
                  )}
                  {/* Timestamp */}
                  <div className="text-xs text-base-content/40 mt-1">
                    {new Date(ann.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-base-300 text-xs text-base-content/40 text-center flex items-center justify-center gap-4">
        <span className="flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Local Storage</span>
      </div>
    </aside>
  );
}
