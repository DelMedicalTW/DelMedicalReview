var Browser = (function() {
    var currentPath = '';

    function $(id) { return document.getElementById(id); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function isDraft(n) { return /Rev_\d+[A-Za-z]/i.test(n); }

    function getFolderInfo(path) {
        var lower = (path || '').toLowerCase();
        if (lower.indexOf('staging') !== -1) return { label: 'STAGING', cls: 'badge-warning', icon: 'package-open', desc: 'Pre-release preparation' };
        if (lower.indexOf('draft') !== -1) return { label: 'DRAFTS', cls: 'badge-error', icon: 'pencil', desc: 'Work in progress' };
        if (lower.indexOf('archive') !== -1) return { label: 'ARCHIVE', cls: 'badge-ghost', icon: 'archive', desc: 'Historical documents' };
        if (lower.indexOf('service') !== -1) return { label: 'SERVICE', cls: 'badge-info', icon: 'wrench', desc: 'Service documentation' };
        if (lower.indexOf('user') !== -1) return { label: 'USER', cls: 'badge-success', icon: 'users', desc: 'User documentation' };
        return null;
    }

    async function loadDir(path) {
        var fl = $('file-list');
        if (!fl) return;
        fl.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm"><span class="loading loading-spinner loading-sm"></span> Loading...</div>';
        currentPath = path;
        try {
            var contents = await API.fetchContents(path);
            if (!Array.isArray(contents)) {
                fl.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">Not a directory.</div>';
                return;
            }
            var folders = contents.filter(function(c) { return c.type === 'dir'; }).sort(function(a, b) { return a.name.localeCompare(b.name); });
            var pdfs = contents.filter(function(c) { return c.type === 'file' && c.name.toLowerCase().endsWith('.pdf'); }).sort(function(a, b) { return a.name.localeCompare(b.name); });
            var h = '';
            var fi = getFolderInfo(path);
            if (fi) {
                h = h + '<div class="px-3 py-2 bg-base-300/50 border-b border-base-300">';
                h = h + '<div class="flex items-center gap-2">';
                h = h + '<span class="badge ' + fi.cls + ' badge-lg gap-1"><i data-lucide="' + fi.icon + '" class="w-4 h-4"></i> ' + fi.label + '</span>';
                h = h + '<span class="text-sm text-base-content/60 font-medium">' + fi.desc + '</span>';
                h = h + '</div></div>';
            }
            folders.forEach(function(f) {
                var ffi = getFolderInfo(f.path);
                var badge = ffi ? '<span class="badge ' + ffi.cls + ' badge-lg ml-auto flex-shrink-0 font-semibold">' + ffi.label + '</span>' : '';
                h = h + '<div class="file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm select-none" data-path="' + esc(f.path) + '">';
                h = h + '<i data-lucide="folder" class="w-4 h-4 flex-shrink-0 text-warning"></i>';
                h = h + '<span class="truncate">' + esc(f.name) + '</span>' + badge + '</div>';
            });
            pdfs.forEach(function(p) {
                var draft = isDraft(p.name);
                var pfi = getFolderInfo(currentPath);
                var badgeHtml = '';
                if (draft) {
                    badgeHtml = '<span class="badge badge-error badge-lg ml-auto flex-shrink-0 font-semibold">DRAFT</span>';
                } else if (pfi) {
                    badgeHtml = '<span class="badge ' + pfi.cls + ' badge-lg ml-auto flex-shrink-0 font-semibold">' + pfi.label + '</span>';
                }
                var active = '';
                if (App && App.getCurrentPDFName && App.getCurrentPDFName() === p.name) {
                    active = ' active-file';
                }
                h = h + '<div class="file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm select-none' + active + '" data-path="' + esc(p.path) + '" data-name="' + esc(p.name) + '">';
                h = h + '<i data-lucide="file-text" class="w-4 h-4 flex-shrink-0 text-error"></i>';
                h = h + '<span class="truncate">' + esc(p.name) + '</span>' + badgeHtml + '</div>';
            });
            fl.innerHTML = h;
            lucide.createIcons();
            fl.querySelectorAll('.file-row[data-path]:not([data-name])').forEach(function(el) {
                el.onclick = function() { loadDir(el.dataset.path); };
            });
            fl.querySelectorAll('.file-row[data-name]').forEach(function(el) {
                el.onclick = function() {
                    if (App && App.loadPDF) App.loadPDF(el.dataset.path, el.dataset.name);
                };
            });
            var backBtn = $('back-btn');
            if (backBtn) backBtn.disabled = !path;
        } catch (err) {
            fl.innerHTML = '<div class="text-center py-8 text-error text-sm"><i data-lucide="alert-triangle" class="w-6 h-6 mx-auto mb-1"></i>' + esc(err.message) + '</div>';
            lucide.createIcons();
        }
    }

    function highlightFile(name) {
        var fl = $('file-list');
        if (!fl) return;
        fl.querySelectorAll('.active-file').forEach(function(el) { el.classList.remove('active-file'); });
        var el = fl.querySelector('[data-name="' + name + '"]');
        if (el) el.classList.add('active-file');
    }

    $('back-btn').onclick = function() {
        if (currentPath) loadDir(currentPath.split('/').slice(0, -1).join('/') || '');
    };
    $('search-input').oninput = function(e) {
        var q = e.target.value.toLowerCase();
        var fl = $('file-list');
        if (!fl) return;
        fl.querySelectorAll('.file-row').forEach(function(el) {
            var span = el.querySelector('.truncate');
            var name = span ? span.textContent : '';
            el.style.display = name.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
    };

    return {
        loadDir: loadDir,
        highlightFile: highlightFile,
        getCurrentPath: function() { return currentPath; }
    };
})();
