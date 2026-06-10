var Sidebar = (function() {
    function $(id) { return document.getElementById(id); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function render(anns) {
        var list = $('annotation-list');
        var count = $('annotation-count');
        if (!list || !count) { return; }
        if (!anns || !anns.length) {
            list.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-40"></i><p>No annotations yet</p></div>';
            count.textContent = '0';
            lucide.createIcons();
            return;
        }
        anns.sort(function(a, b) { return a.page - b.page; });
        count.textContent = anns.length;
        var typeConfig = {
            highlight: { label: 'Highlight', cls: 'badge-warning', icon: 'highlighter' },
            drawing: { label: 'Drawing', cls: 'badge-info', icon: 'pen' },
            rectangle: { label: 'Rectangle', cls: 'badge-accent', icon: 'square-dashed' },
            comment: { label: 'Note', cls: 'badge-success', icon: 'sticky-note' }
        };
        list.innerHTML = anns.map(function(a, i) {
            var tc = typeConfig[a.type] || { label: a.type, cls: 'badge-ghost', icon: 'circle' };
            var body = '';
            if (a.comment) { body = body + '<p class="text-sm mt-1">' + esc(a.comment) + '</p>'; }
            if (a.type === 'drawing' && !a.comment) { body = body + '<p class="text-xs text-base-content/40 mt-1">Freehand drawing</p>'; }
            if (a.type === 'rectangle' && !a.comment) { body = body + '<p class="text-xs text-base-content/40 mt-1">Area selection</p>'; }
            var gitHubLink = a.issueNumber
                ? '<a href="' + a.issueUrl + '" target="_blank" class="text-xs text-info hover:underline flex items-center gap-1 ml-auto" onclick="event.stopPropagation()"><i data-lucide="external-link" class="w-3 h-3"></i> #' + a.issueNumber + '</a>'
                : '<span class="text-xs text-warning flex items-center gap-1 ml-auto"><i data-lucide="cloud-off" class="w-3 h-3"></i></span>';
            return '<div class="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary hover:shadow-md transition-all" onclick="Annotations.scrollToPage(' + a.page + ')">' +
                '<div class="card-body p-3">' +
                '<div class="flex items-center gap-2 flex-wrap">' +
                '<span class="badge badge-xs ' + tc.cls + ' gap-1"><i data-lucide="' + tc.icon + '" class="w-3 h-3"></i> ' + tc.label + '</span>' +
                '<span class="text-xs text-base-content/50">Page ' + a.page + '</span>' +
                (a.reviewer ? '<span class="text-xs text-base-content/40"><i data-lucide="user" class="w-3 h-3 inline"></i> ' + esc(a.reviewer) + '</span>' : '') +
                gitHubLink +
                '<button class="btn btn-ghost btn-xs text-error p-0 min-h-0 h-6 w-6" onclick="event.stopPropagation();Annotations.deleteAnnotation(' + i + ')" title="Delete"><i data-lucide="x" class="w-3 h-3"></i></button>' +
                '</div>' + body +
                '<div class="text-xs text-base-content/40">' + new Date(a.timestamp).toLocaleString() + '</div>' +
                '</div></div>';
        }).join('');
        lucide.createIcons();
    }

    function clear() {
        var list = $('annotation-list');
        var count = $('annotation-count');
        if (list) { list.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-40"></i><p>No annotations yet</p></div>'; }
        if (count) { count.textContent = '0'; }
        lucide.createIcons();
    }

    return { render: render, clear: clear };
})();
