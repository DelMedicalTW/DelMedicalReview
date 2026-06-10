// ============================================================
// ANNOTATION SIDEBAR
// ============================================================
const Sidebar = (function() {
    const $ = (id) => document.getElementById(id);
    const annotationList = $('annotation-list');
    const annotationCount = $('annotation-count');

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function render(annotations) {
        if (!annotations.length) {
            annotationList.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm">No annotations yet.</div>';
            annotationCount.textContent = '0';
            return;
        }
        annotations.sort((a, b) => a.page - b.page);
        annotationCount.textContent = annotations.length;

        const typeLabels = {
            highlight: { label: 'Highlight', cls: 'badge-warning' },
            quote: { label: 'Quote', cls: 'badge-secondary' },
            drawing: { label: 'Drawing', cls: 'badge-info' },
            comment: { label: 'Note', cls: 'badge-success' },
            rectangle: { label: 'Rectangle', cls: 'badge-info' },
        };

        annotationList.innerHTML = annotations.map(ann => {
            const tl = typeLabels[ann.type] || { label: ann.type, cls: 'badge-ghost' };
            let body = '';
            if (ann.quotedText) body += `<blockquote class="border-l-3 border-secondary pl-2 my-1 text-base-content/60 italic text-xs">${escapeHtml(ann.quotedText)}</blockquote>`;
            if (ann.comment) body += `<p class="text-sm">${escapeHtml(ann.comment)}</p>`;
            if (ann.type === 'drawing' && !ann.comment) body += '<p class="text-base-content/40 text-xs">Drawing annotation</p>';

            const issueLink = ann.issueNumber
                ? `<a href="${ann.issueUrl}" target="_blank" class="text-info text-xs ml-auto hover:underline">#${ann.issueNumber} ↗</a>`
                : '<span class="text-warning text-xs ml-auto">Unsaved</span>';
            const resolved = ann.issueState === 'closed'
                ? '<span class="badge badge-success badge-xs">✓ Resolved</span>' : '';

            return `<div class="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary transition-colors" onclick="Annotations.scrollToPage(${ann.page})">
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 flex-wrap text-xs text-base-content/50">
                        <span class="badge badge-xs ${tl.cls}">${tl.label}</span>
                        <span>Page ${ann.page}</span>
                        ${issueLink}
                        ${resolved}
                    </div>
                    <div class="mt-1">${body}</div>
                    <div class="text-xs text-base-content/40 mt-1">${new Date(ann.timestamp).toLocaleString()}</div>
                </div>
            </div>`;
        }).join('');
    }

    function clear() {
        annotationList.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm">No annotations yet.</div>';
        annotationCount.textContent = '0';
    }

    return { render, clear };
})();
