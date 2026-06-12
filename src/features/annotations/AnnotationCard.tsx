import React from 'react';
import { Annotation } from '../../core/types';
import { useAnnotations } from '../../hooks/useAnnotations';
import { X, ChevronDown, User } from 'lucide-react';

interface AnnotationCardProps {
  annotation: Annotation;
}

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

export function AnnotationCard({ annotation }: AnnotationCardProps) {
  const { deleteAnnotation, updateAnnotation, currentPDF } = useAnnotations();
  const badge = TYPE_BADGES[annotation.type] || { label: '??', cls: 'badge-ghost' };
  const statusCls = STATUS_CLASSES[annotation.status] || 'badge-ghost';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteAnnotation(currentPDF, annotation.id);
  };

  const handleStatus = (e: React.MouseEvent, status: string) => {
    e.stopPropagation();
    updateAnnotation(currentPDF, annotation.id, { status: status as any });
  };

  return (
    <div className="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary hover:shadow-md transition-all">
      <div className="card-body p-2">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <span className={`badge badge-xs ${badge.cls}`}>{badge.label}</span>
          <span className={`badge badge-xs ${statusCls}`}>{annotation.status}</span>
          <span>Pg {annotation.page}</span>
          {annotation.reviewer && (
            <span className="text-base-content/40 flex items-center gap-0.5">
              <User className="w-3 h-3" /> {annotation.reviewer}
            </span>
          )}
          <button className="btn btn-ghost btn-xs p-0 h-5 w-5 ml-auto" onClick={handleDelete} title="Delete">
            <X className="w-3 h-3" />
          </button>
          <div className="dropdown dropdown-end" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost btn-xs p-0 h-5 w-5">
              <ChevronDown className="w-3 h-3" />
            </button>
            <ul className="dropdown-content menu p-1 bg-base-200 rounded-box w-28 z-30 text-xs">
              <li><a href="#" onClick={(e) => handleStatus(e, 'in-review')}>In Review</a></li>
              <li><a href="#" onClick={(e) => handleStatus(e, 'resolved')}>Resolved</a></li>
              <li><a href="#" onClick={(e) => handleStatus(e, 'open')}>Reopen</a></li>
            </ul>
          </div>
        </div>
        {annotation.comment && <p className="text-sm mt-1">{annotation.comment}</p>}
        <div className="text-xs text-base-content/40">
          {new Date(annotation.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
