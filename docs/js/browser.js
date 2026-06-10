// ============================================================
// FILE BROWSER
// ============================================================
var Browser = (function() {
    if (typeof Browser !== 'undefined' && Browser.loadDirectory) {
        return Browser;
    }

    let currentPath = '';

    const $ = function(id) { return document.getElementById(id); };
    const fileList = $('file-list');
    const breadcrumb = $('breadcrumb');
    const searchInput = $('search-input');
    const backBtn = $('back-btn');

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function isDraft(filename) {
        return /Rev_\d+[A-Za-z]/i.test(filename);
    }

    function updateBreadcrumb() {
        if (!breadcrumb) return;
        const parts = currentPath ? currentPath.split('/') : [];
        let html = '<li><a href="#" data-path="">DelMedicalRelease</a></li>';
        parts.forEach(function(part, i) {
            const subpath = parts.slice(0, i + 1).join('/');
            html += '<li><a href="#" data-path="' + subpath + '">' + escapeHtml(part) + '</a></li>';
        });
        breadcrumb.innerHTML = '<ul>' + html + '</ul>';
        breadcrumb.querySelectorAll('a[data-path]').forEach(function(a) {
            a.addEventListener('click', function(e) {
                e.preventDefault();
                loadDirectory(a.dataset.path);
            });
        });
    }

    async function loadDirectory(path) {
        if (!fileList) return;
        fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">Loading...</div>';
        currentPath = path;
        updateBreadcrumb();

        try {
            const contents = await API.fetchContents(path);
            if (!Array.isArray(contents)) {
                fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">Not a directory.</div>';
                return;
            }

            const folders = contents.filter(function(c) { return c.type === 'dir'; })
                .sort(function(a, b) { return a.name.localeCompare(b.name); });
            const pdfs = contents.filter(function(c) { return c.type === 'file' && c.name.toLowerCase().endsWith('.pdf'); })
                .sort(function(a, b) { return a.name.localeCompare(b.name); });

            if (!folders.length && !pdfs.length) {
                fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">No folders or PDFs found.</div>';
                return;
            }

            let html = '';
            folders.forEach(function(folder) {
                html += '<div class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 border-l-3 border-transparent select-none" data-path="' + folder.path + '">' +
                    '<i data-lucide="folder" class="w-4 h-4 flex-shrink-0 text-warning"></i>' +
                    '<span class="truncate">' + escapeHtml(folder.name) + '</span>' +
                '</div>';
            });
            pdfs.forEach(function(pdf) {
                const draft = isDraft(pdf.name);
                const badge = draft
                    ? '<span class="badge badge-warning badge-xs ml-auto flex-shrink-0">DRAFT</span>'
                    : '<span class="badge badge-success badge-xs ml-auto flex-shrink-0">RELEASE</span>';
                const active = (typeof App !== 'undefined' && App.getCurrentPDFName() === pdf.name) ? ' bg-primary/10 border-l-primary' : '';
                html += '<div class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 border-l-3 border-transparent' + active + ' select-none" data-path="' + pdf.path + '" data-name="' + escapeHtml(pdf.name) + '">' +
                    '<i data-lucide="file-text" class="w-4 h-4 flex-shrink-0 text-error"></i>' +
                    '<span class="truncate">' + escapeHtml(pdf.name) + '</span>' +
                    badge +
                '</div>';
            });
            fileList.innerHTML = html;

            if (typeof lucide !== 'undefined') lucide.createIcons();

            fileList.querySelectorAll('[data-path]:not([data-name])').forEach(function(el) {
                el.addEventListener('click', function() { loadDirectory(el.dataset.path); });
            });
            fileList.querySelectorAll('[data-name]').forEach(function(el) {
                el.addEventListener('click', function() {
                    if (typeof App !== 'undefined') {
                        App.loadPDF(el.dataset.path, el.dataset.name);
                    }
                });
            });

            if (backBtn) backBtn.disabled = !path;
        } catch (err) {
            fileList.innerHTML = '<div class="text-center py-8 text-error text-sm">Error: ' + escapeHtml(err.message) + '</div>';
        }
    }

    if (backBtn) {
        backBtn.addEventListener('click', function() {
            if (!currentPath) return;
            const parent = currentPath.split('/').slice(0, -1).join('/');
            loadDirectory(parent || '');
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('#file-list [data-name]').forEach(function(el) {
                const name = (el.querySelector('.truncate') ? el.querySelector('.truncate').textContent : '').toLowerCase();
                el.style.display = name.indexOf(query) !== -1 ? '' : 'none';
            });
            document.querySelectorAll('#file-list [data-path]:not([data-name])').forEach(function(el) {
                const name = (el.querySelector('.truncate') ? el.querySelector('.truncate').textContent : '').toLowerCase();
                el.style.display = name.indexOf(query) !== -1 ? '' : 'none';
            });
        });
    }

    function highlightActiveFile(pdfName) {
        document.querySelectorAll('#file-list [data-name]').forEach(function(el) { el.classList.remove('bg-primary/10', 'border-l-primary'); });
        const active = document.querySelector('#file-list [data-name="' + pdfName + '"]');
        if (active) active.classList.add('bg-primary/10', 'border-l-primary');
    }

    return {
        loadDirectory: loadDirectory,
        highlightActiveFile: highlightActiveFile,
        getCurrentPath: function() { return currentPath; },
    };
})();
