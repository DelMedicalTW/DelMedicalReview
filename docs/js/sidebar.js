var Sidebar = (function() {
    var currentHighlight = -1;
    function $(id) { return document.getElementById(id); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function getFilteredAnnotations() {
        var anns = Annotations.getAnnotations();
        var typeFilter = $('filter-type').value;
        var statusFilter = $('filter-status').value;
        var sortBy = $('filter-sort').value;

        if (typeFilter !== 'all') anns = anns.filter(function(a) { return a.type === typeFilter; });
        if (statusFilter !== 'all') anns = anns.filter(function(a) { return (a.status || 'open') === statusFilter; });

        if (sortBy === 'page-asc') anns.sort(function(a, b) { return a.page - b.page; });
        else if (sortBy === 'page-desc') anns.sort(function(a, b) { return b.page - a.page; });
        else if (sortBy === 'newest') anns.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
        else if (sortBy === 'oldest') anns.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

        return anns;
    }

    function render() {
        var list = $('annotation-list');
        var count = $('annotation-count');
        if (!list || !count) return;
        var anns = getFilteredAnnotations();
        if (!anns.length) {
            list.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-40"></i><p>No annotations match filters</p></div>';
            count.textContent = '0';
            lucide.createIcons();
            return;
        }
        count.textContent = anns.length + ' / ' + Annotations.getAnnotations().length;

        var typeConfig = {
            highlight: { label: 'Highlight', cls: 'badge-warning', icon: 'highlighter' },
            drawing: { label: 'Drawing', cls: 'badge-info', icon: 'pen' },
            rectangle: { label: 'Rectangle', cls: 'badge-accent', icon: 'square-dashed' },
            comment: { label: 'Note', cls: 'badge-success', icon: 'sticky-note' }
        };
        var statusConfig = {
            'open': { label: 'Open', cls: 'badge-error' },
            'in-review': { label: 'In Review', cls: 'badge-warning' },
            'resolved': { label: 'Resolved', cls: 'badge-success' },
            'verified': { label: 'Verified', cls: 'badge-info' }
        };

        list.innerHTML = anns.map(function(a, i) {
            var tc = typeConfig[a.type] || { label: a.type, cls: 'badge-ghost', icon: 'circle' };
            var sc = statusConfig[a.status] || { label: a.status || 'open', cls: 'badge-ghost' };
            var body = '';
            if (a.comment) body = body + '<p class="text-sm mt-1">' + esc(a.comment) + '</p>';
            if (a.type === 'drawing' && !a.comment) body = body + '<p class="text-xs text-base-content/40 mt-1">Freehand drawing</p>';
            var replyCount = (a.replies && a.replies.length) ? '<span class="text-xs text-info"><i data-lucide="message-circle" class="w-3 h-3 inline"></i> ' + a.replies.length + '</span>' : '';
            var gitHubLink = a.issueNumber
                ? '<a href="' + a.issueUrl + '" target="_blank" class="text-xs text-info hover:underline flex items-center gap-1 ml-1" onclick="event.stopPropagation()"><i data-lucide="external-link" class="w-3 h-3"></i> #' + a.issueNumber + '</a>'
                : '<span class="text-xs text-warning flex items-center gap-1 ml-1"><i data-lucide="cloud-off" class="w-3 h-3"></i></span>';
            var highlightClass = i === currentHighlight ? ' ring-2 ring-primary' : '';

            return '<div class="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary hover:shadow-md transition-all' + highlightClass + '" data-ann-index="' + i + '">' +
                '<div class="card-body p-3">' +
                '<div class="flex items-center gap-2 flex-wrap">' +
                '<span class="badge badge-xs ' + tc.cls + ' gap-1"><i data-lucide="' + tc.icon + '" class="w-3 h-3"></i> ' + tc.label + '</span>' +
                '<span class="badge badge-xs ' + sc.cls + '">' + sc.label + '</span>' +
                '<span class="text-xs text-base-content/50">Page ' + a.page + '</span>' +
                (a.reviewer ? '<span class="text-xs text-base-content/40"><i data-lucide="user" class="w-3 h-3 inline"></i> ' + esc(a.reviewer) + '</span>' : '') +
                gitHubLink + replyCount +
                '<span class="flex-1"></span>' +
                '<button class="btn btn-ghost btn-xs p-0 min-h-0 h-6 w-6" onclick="event.stopPropagation();showReplyModal(' + i + ')" title="Reply"><i data-lucide="reply" class="w-3 h-3"></i></button>' +
                '<div class="dropdown dropdown-end" onclick="event.stopPropagation()">' +
                '<button class="btn btn-ghost btn-xs p-0 min-h-0 h-6 w-6" tabindex="0"><i data-lucide="chevron-down" class="w-3 h-3"></i></button>' +
                '<ul tabindex="0" class="dropdown-content menu p-1 shadow bg-base-200 rounded-box w-36 z-30">' +
                '<li><a href="#" onclick="event.stopPropagation();Annotations.updateAnnotationStatus(' + i + ',\'in-review\')">In Review</a></li>' +
                '<li><a href="#" onclick="event.stopPropagation();Annotations.updateAnnotationStatus(' + i + ',\'resolved\')">Resolved</a></li>' +
                '<li><a href="#" onclick="event.stopPropagation();Annotations.updateAnnotationStatus(' + i + ',\'verified\')">Verified</a></li>' +
                '<li><a href="#" onclick="event.stopPropagation();Annotations.updateAnnotationStatus(' + i + ',\'open\')">Reopen</a></li>' +
                '<li><a href="#" class="text-info" onclick="event.stopPropagation();copyPermalink(' + i + ')">Copy Link</a></li>' +
                '<li><a href="#" class="text-error" onclick="event.stopPropagation();Annotations.deleteAnnotation(' + i + ')">Delete</a></li>' +
                '</ul></div>' +
                '</div>' + body +
                '<div class="text-xs text-base-content/40">' + new Date(a.timestamp).toLocaleString() + '</div>' +
                '</div></div>';
        }).join('');
        lucide.createIcons();

        // Click handlers
        list.querySelectorAll('[data-ann-index]').forEach(function(card) {
            card.onclick = function() {
                var idx = parseInt(card.getAttribute('data-ann-index'));
                var filtered = getFilteredAnnotations();
                var ann = filtered[idx];
                if (ann) Annotations.scrollToPage(ann.page);
                currentHighlight = idx;
                render();
            };
        });
    }

    function highlightAnnotation(index) {
        currentHighlight = index;
        render();
        var card = $('annotation-list').querySelector('[data-ann-index="' + index + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function copyPermalink(index) {
        var filtered = getFilteredAnnotations();
        var ann = filtered[index];
        if (!ann || !ann.id) return;
        var url = window.location.origin + window.location.pathname + '?annotation=' + ann.id;
        navigator.clipboard.writeText(url).then(function() {
            UI.showToast('Permalink copied!', 'success');
        }).catch(function() {
            UI.showToast('Failed to copy', 'error');
        });
    }

    function clear() {
        var list = $('annotation-list'); var count = $('annotation-count');
        if (list) list.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-40"></i><p>No annotations yet</p></div>';
        if (count) count.textContent = '0';
        lucide.createIcons();
    }

    // Filter listeners
    $('filter-type').onchange = render;
    $('filter-status').onchange = render;
    $('filter-sort').onchange = render;

    return {
        render: render,
        clear: clear,
        getFilteredAnnotations: getFilteredAnnotations,
        highlightAnnotation: highlightAnnotation,
        copyPermalink: copyPermalink
    };
})();

// Expose reply modal globally
window.showReplyModal = function(index) {
    var modal = document.getElementById('reply-modal');
    var thread = document.getElementById('reply-thread');
    var txt = document.getElementById('reply-comment');
    var saveBtn = document.getElementById('reply-save');
    var cancelBtn = document.getElementById('reply-cancel');
    if (!modal || !thread || !txt) return;
    var filtered = Sidebar.getFilteredAnnotations();
    var ann = filtered[index];
    if (!ann) return;
    var html = '<p class="font-semibold">' + ann.comment + '</p>';
    (ann.replies || []).forEach(function(r) {
        html = html + '<div class="ml-2 mt-1 pl-2 border-l-2 border-base-300"><span class="text-xs font-semibold">' + r.reviewer + '</span><p class="text-xs">' + r.text + '</p></div>';
    });
    thread.innerHTML = html; txt.value = '';
    modal.showModal(); setTimeout(function() { txt.focus(); }, 100);
    function onSave() { var c = txt.value.trim(); modal.close(); saveBtn.removeEventListener('click', onSave); cancelBtn.removeEventListener('click', onCancel); if (c) Annotations.addReply(index, c); }
    function onCancel() { modal.close(); saveBtn.removeEventListener('click', onSave); cancelBtn.removeEventListener('click', onCancel); }
    saveBtn.addEventListener('click', onSave); cancelBtn.addEventListener('click', onCancel);
};
