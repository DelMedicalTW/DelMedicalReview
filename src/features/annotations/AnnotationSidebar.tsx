import React, { useState } from 'react';
import { useAppState } from '../../state/AnnotationContext';
import { AnnotationStatus } from '../../core/types';
import { MessageSquareText, Inbox, X, ChevronDown, User, Highlighter, Pen, Square, StickyNote, MessageCircle, Plus, Reply } from 'lucide-react';

var TYPE_ICONS: Record<string, React.FC<{className?: string}>> = {
  highlight: Highlighter,
  drawing: Pen,
  rectangle: Square,
  comment: StickyNote,
};

var STATUS_CLASSES: Record<string, string> = {
  'in_review': 'badge-warning',
  'approved': 'badge-success',
  'rejected': 'badge-error',
  'resolved': 'badge-info',
};

var STATUS_LABELS: Record<string, string> = {
  'in_review': 'In Review',
  'approved': 'Approved',
  'rejected': 'Rejected',
  'resolved': 'Resolved',
};

export function AnnotationSidebar() {
  var _a = useAppState(), state = _a.state, dispatch = _a.dispatch;
  var [typeFilter, setTypeFilter] = useState('all');
  var [statusFilter, setStatusFilter] = useState('all');
  var [sortBy, setSortBy] = useState('page-asc');
  var [newComment, setNewComment] = useState('');
  var [replyText, setReplyText] = useState<Record<string, string>>({});
  var [showReply, setShowReply] = useState<Record<string, boolean>>({});

  var all = state.annotations[state.currentPDF] || [];
  var filtered = all
    .filter(function(a: any) { return typeFilter==='all' || a.type===typeFilter; })
    .filter(function(a: any) { return statusFilter==='all' || (statusFilter==='draft' && (!a.status||a.status==='draft')) || a.status===statusFilter; })
    .sort(function(a: any, b: any) {
      if(sortBy==='page-asc') return a.page-b.page;
      if(sortBy==='page-desc') return b.page-a.page;
      return new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime();
    });

  var handleDelete = function(id: string) {
    dispatch({ type:'DELETE_ANNOTATION', pdf:state.currentPDF, id:id });
  };

  var handleStatus = function(id: string, st: AnnotationStatus) {
    dispatch({ type:'UPDATE_ANNOTATION', pdf:state.currentPDF, id:id, changes:{ status: st } });
  };

  var handleReply = function(annId: string) {
    var text = replyText[annId] || '';
    if(!text.trim()) return;
    dispatch({ type:'ADD_REPLY', pdf:state.currentPDF, id:annId, message:text.trim(), author:state.reviewer||'Anonymous' });
    setReplyText({ ...replyText, [annId]: '' });
    setShowReply({ ...showReply, [annId]: false });
  };

  var addGeneralComment = function() {
    if(!newComment.trim()) return;
    dispatch({ type:'ADD_ANNOTATION', pdf:state.currentPDF, payload: {
      id: 'ann-'+Date.now(), type:'comment', page:0, status:'in_review' as AnnotationStatus,
      comment:newComment.trim(), reviewer: state.reviewer||'Anonymous',
      timestamp: new Date().toISOString(), color: state.color,
      objects:[], versions:[], currentVersion:0, thread: { replies: [] },
    }});
    setNewComment('');
  };

  return React.createElement('aside', { className: 'w-[400px] min-w-[400px] bg-base-200 border-l border-base-300 flex flex-col overflow-hidden' },
    // Header
    React.createElement('div', { className: 'p-3 border-b border-base-300 flex items-center justify-between flex-shrink-0' },
      React.createElement('h3', { className: 'font-semibold text-sm flex items-center gap-2' },
        React.createElement(MessageSquareText, { className: 'w-4 h-4 text-info' }), ' Feedback'
      ),
      React.createElement('span', { className: 'badge badge-md font-semibold' }, String(filtered.length))
    ),

    // Reviewer + Filters
    React.createElement('div', { className: 'p-2 border-b border-base-300 flex-shrink-0 space-y-1' },
      React.createElement('label', { className: 'input input-bordered input-sm flex items-center gap-2' },
        React.createElement(User, { className: 'w-3 h-3 text-base-content/40' }),
        React.createElement('input', { type:'text', className:'grow', placeholder:'Your name...', value:state.reviewer, onChange:function(e: any){ dispatch({ type:'SET_REVIEWER', payload:e.target.value }); } })
      ),
      React.createElement('div', { className: 'flex gap-1' },
        React.createElement('select', { className:'select select-bordered select-xs flex-1', value:typeFilter, onChange:function(e: any){ setTypeFilter(e.target.value); } },
          React.createElement('option', { value:'all' }, 'All Types'),
          React.createElement('option', { value:'highlight' }, 'Highlights'),
          React.createElement('option', { value:'drawing' }, 'Drawings'),
          React.createElement('option', { value:'rectangle' }, 'Rects'),
          React.createElement('option', { value:'comment' }, 'Notes')
        ),
        React.createElement('select', { className:'select select-bordered select-xs flex-1', value:statusFilter, onChange:function(e: any){ setStatusFilter(e.target.value); } },
          React.createElement('option', { value:'all' }, 'All'),
          React.createElement('option', { value:'draft' }, 'Unreviewed'),
          React.createElement('option', { value:'in_review' }, 'In Review'),
          React.createElement('option', { value:'approved' }, 'Approved'),
          React.createElement('option', { value:'rejected' }, 'Rejected'),
          React.createElement('option', { value:'resolved' }, 'Resolved')
        ),
        React.createElement('select', { className:'select select-bordered select-xs flex-1', value:sortBy, onChange:function(e: any){ setSortBy(e.target.value); } },
          React.createElement('option', { value:'page-asc' }, 'Page \u2191'),
          React.createElement('option', { value:'page-desc' }, 'Page \u2193'),
          React.createElement('option', { value:'newest' }, 'Newest')
        )
      )
    ),

    // General comment box
    React.createElement('div', { className: 'p-2 border-b border-base-300 flex-shrink-0 flex gap-1' },
      React.createElement('input', { type:'text', className:'input input-bordered input-sm flex-1', placeholder:'Add a general comment...', value:newComment, onChange:function(e: any){ setNewComment(e.target.value); }, onKeyDown:function(e: any){ if(e.key==='Enter') addGeneralComment(); } }),
      React.createElement('button', { className:'btn btn-primary btn-sm', onClick:addGeneralComment }, React.createElement(Plus, { className:'w-4 h-4' }))
    ),

    // Feedback list
    React.createElement('div', { className: 'flex-1 overflow-y-auto p-3 flex flex-col gap-2' },
      filtered.length===0
        ? React.createElement('div', { className:'text-center py-8 text-base-content/40 text-sm' },
            React.createElement(Inbox, { className:'w-10 h-10 mx-auto mb-2 opacity-40' }),
            React.createElement('p', null, 'No feedback yet'),
            React.createElement('p', { className:'text-xs mt-1' }, 'Use the toolbar or comment box above')
          )
        : filtered.map(function(ann: any) {
            var IconComponent = TYPE_ICONS[ann.type] || MessageCircle;
            var statusCls = STATUS_CLASSES[ann.status] || '';
            var statusLabel = STATUS_LABELS[ann.status] || '';
            var replies = ann.thread ? ann.thread.replies || [] : [];
            var isReplying = showReply[ann.id] || false;

            return React.createElement('div', { key:ann.id, className:'card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary hover:shadow-md transition-all' },
              React.createElement('div', { className:'card-body p-3' },
                // Header row
                React.createElement('div', { className:'flex items-center gap-2 flex-wrap' },
                  React.createElement(IconComponent, { className:'w-4 h-4 flex-shrink-0' }),
                  ann.page>0
                    ? React.createElement('span', { className:'text-xs text-base-content/50 font-medium' }, 'Pg '+ann.page)
                    : React.createElement('span', { className:'text-xs text-base-content/50 font-medium' }, 'General'),
                  statusLabel
                    ? React.createElement('span', { className:'badge badge-md font-semibold '+statusCls }, statusLabel)
                    : null,
                  ann.reviewer
                    ? React.createElement('span', { className:'text-xs text-base-content/40 flex items-center gap-0.5 ml-auto' }, React.createElement(User, { className:'w-3 h-3' }), ann.reviewer)
                    : null,
                  React.createElement('button', { className:'btn btn-ghost btn-xs p-0 h-5 w-5 text-error', onClick:function(e: any){ e.stopPropagation(); handleDelete(ann.id); }, title:'Delete' }, React.createElement(X, { className:'w-3 h-3' })),
                  React.createElement('div', { className:'dropdown dropdown-end', onClick:function(e: any){ e.stopPropagation(); } },
                    React.createElement('button', { className:'btn btn-ghost btn-xs p-0 h-5 w-5' }, React.createElement(ChevronDown, { className:'w-3 h-3' })),
                    React.createElement('ul', { className:'dropdown-content menu p-1 bg-base-200 rounded-box w-28 z-30 text-xs shadow' },
                      React.createElement('li', null, React.createElement('a', { href:'#', onClick:function(e: any){ e.preventDefault(); handleStatus(ann.id,'in_review'); } }, 'In Review')),
                      React.createElement('li', null, React.createElement('a', { href:'#', onClick:function(e: any){ e.preventDefault(); handleStatus(ann.id,'approved'); } }, 'Approved')),
                      React.createElement('li', null, React.createElement('a', { href:'#', onClick:function(e: any){ e.preventDefault(); handleStatus(ann.id,'rejected'); } }, 'Rejected')),
                      React.createElement('li', null, React.createElement('a', { href:'#', onClick:function(e: any){ e.preventDefault(); handleStatus(ann.id,'resolved'); } }, 'Resolved'))
                    )
                  )
                ),
                // Comment
                ann.comment ? React.createElement('p', { className:'text-sm mt-1' }, ann.comment) : null,
                ann.quotedText ? React.createElement('blockquote', { className:'border-l-2 border-secondary pl-2 my-1 text-base-content/60 italic text-xs' }, ann.quotedText.length>100 ? ann.quotedText.substring(0,100)+'...' : ann.quotedText) : null,
                // Replies
                replies.length > 0
                  ? React.createElement('div', { className:'mt-2 pl-2 border-l-2 border-base-300 space-y-1' },
                      replies.map(function(r: any, ri: number) {
                        return React.createElement('div', { key: ri, className:'text-xs' },
                          React.createElement('span', { className:'font-semibold' }, r.author), ': ',
                          React.createElement('span', null, r.message)
                        );
                      })
                    )
                  : null,
                // Reply input
                isReplying
                  ? React.createElement('div', { className:'flex gap-1 mt-2' },
                      React.createElement('input', { type:'text', className:'input input-bordered input-xs flex-1', placeholder:'Write a reply...', value:replyText[ann.id]||'', onChange:function(e: any){ setReplyText({ ...replyText, [ann.id]: e.target.value }); }, onKeyDown:function(e: any){ if(e.key==='Enter') handleReply(ann.id); } }),
                      React.createElement('button', { className:'btn btn-ghost btn-xs', onClick:function(){ setShowReply({ ...showReply, [ann.id]: false }); } }, 'Cancel')
                    )
                  : React.createElement('button', { className:'btn btn-ghost btn-xs text-xs mt-1', onClick:function(e: any){ e.stopPropagation(); setShowReply({ ...showReply, [ann.id]: true }); } },
                      React.createElement(Reply, { className:'w-3 h-3 mr-1' }), 'Reply'
                    ),
                // Timestamp
                React.createElement('div', { className:'text-xs text-base-content/40 mt-1' }, new Date(ann.timestamp).toLocaleString())
              )
            );
          })
    ),

    React.createElement('div', { className:'p-2 border-t border-base-300 text-xs text-base-content/40 text-center' }, 'Local Storage')
  );
}
