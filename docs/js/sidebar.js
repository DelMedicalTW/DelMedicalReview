// ============================================================
// ANNOTATION SIDEBAR
// ============================================================
var Sidebar = (function() {
    // Don't redeclare if already loaded
    if (typeof Sidebar !== 'undefined' && Sidebar.render) {
        return Sidebar;
    }

    const $ = function(id) { return document.getElementById(id); };
    const annotationList = $('annotation-list');
    const annotationCount = $('annotation-count');

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function render(annotations) {
        if (!annotationList || !annotationCount) {
            console.warn('Sidebar: DOM elements not found');
            return;
        }
        if (!annotations || !annotations.length) {
            annotationList.innerHTML =
                '<div class="text-center py-8 text-base-content/40 text-sm">' +
                '<i data-lucide="message-circle" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>' +
                '<p>No annotations yet.</p>' +
                '<p class="text-xs mt-1">Use the toolbar to add highlights, drawings, or notes.</p>' +
                '</div>';
            annotationCount.textContent = '0';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }
        annotations.sort(function(a, b) { return a.page - b.page; });
        annotationCount.textContent = annotations.length;

        const typeLabels = {
            highlight: { label: 'Highlight', cls: 'badge-warning', icon: 'highlighter' },
            quote: { label: 'Quote', cls: 'badge-secondary', icon: 'quote' },
            drawing: { label: 'Drawing', cls: 'badge-info', icon: 'pen' },
            comment: { label: 'Note', cls: 'badge-success', icon: 'sticky-note' },
            rectangle: { label: 'Rectangle', cls: 'badge-info', icon: 'square' },
        };

        annotationList.innerHTML = annotations.map(function(ann) {
            const tl = typeLabels[ann.type] || { label: ann.type, cls: 'badge-ghost', icon: 'pin' };
            let body = '';
            if (ann.quotedText) {
                body += '<blockquote class="border-l-2 border-secondary pl-2 my-1 text-base-content/60 italic text-xs">' +
                    escapeHtml(ann.quotedText) + '</blockquote>';
            }
            if (ann.comment) {
                body += '<p class="text-sm">' + escapeHtml(ann.comment) + '</p>';
            }
            if (ann.type === 'drawing' && !ann.comment) {
                body += '<p class="text-base-content/40 text-xs">Drawing annotation</p>';
            }

            const issueLink = ann.issueNumber
                ? '<a href="' + ann.issueUrl + '" target="_blank" class="text-info text-xs ml-auto hover:underline flex items-center gap-1"><i data-lucide="external-link" class="w-3 h-3"></i> #' + ann.issueNumber + '</a>'
                : '<span class="text-warning text-xs ml-auto flex items-center gap-1"><i data-lucide="cloud-off" class="w-3 h-3"></i> Unsaved</span>';
            const resolved = ann.issueState === 'closed'
                ? '<span class="badge badge-success badge-xs ml-1"><i data-lucide="check" class="w-3 h-3 inline"></i> Resolved</span>' : '';

            return '<div class="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary transition-colors" onclick="if(typeof Annotations!==\'undefined\')Annotations.scrollToPage(' + ann.page + ')">' +
                '<div class="card-body p-3">' +
                '<div class="flex items-center gap-2 flex-wrap text-xs text-base-content/50">' +
                '<span class="badge badge-xs ' + tl.cls + '"><i data-lucide="' + tl.icon + '" class="w-3 h-3 inline"></i> ' + tl.label + '</span>' +
                '<span>Page ' + ann.page + '</span>' +
                issueLink +
                resolved +
                '</div>' +
                '<div class="mt-1">' + body + '</div>' +
                '<div class="text-xs text-base-content/40 mt-1">' + new Date(ann.timestamp).toLocaleString() + '</div>' +
                '</div>' +
                '</div>';
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function clear() {
        if (!annotationList || !annotationCount) return;
        annotationList.innerHTML =
            '<div class="text-center py-8 text-base-content/40 text-sm">' +
            '<i data-lucide="message-circle" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>' +
            '<p>No annotations yet.</p>' +
            '</div>';
        annotationCount.textContent = '0';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    return {
        render: render,
        clear: clear,
    };
})();
