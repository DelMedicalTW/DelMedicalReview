// ============================================================
// FILE BROWSER
// ============================================================
const Browser = (function() {
    let currentPath = '';

    const $ = (id) => document.getElementById(id);
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
        const parts = currentPath ? currentPath.split('/') : [];
        let html = '<li><a href="#" data-path="">DelMedicalRelease</a></li>';
        parts.forEach((part, i) => {
            const subpath = parts.slice(0, i + 1).join('/');
            html += `<li><a href="#" data-path="${subpath}">${escapeHtml(part)}</a></li>`;
        });
        breadcrumb.innerHTML = '<ul>' + html + '</ul>';
        breadcrumb.querySelectorAll('a[data-path]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                loadDirectory(a.dataset.path);
            });
        });
    }

    async function loadDirectory(path) {
        fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">Loading...</div>';
        currentPath = path;
        updateBreadcrumb();

        try {
            const contents = await API.fetchContents(path);
            if (!Array.isArray(contents)) {
                fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">Not a directory.</div>';
                return;
            }

            const folders = contents.filter(c => c.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
            const pdfs = contents.filter(c => c.type === 'file' && c.name.toLowerCase().endsWith('.pdf'))
                .sort((a, b) => a.name.localeCompare(b.name));

            if (!folders.length && !pdfs.length) {
                fileList.innerHTML = '<div class="text-center py-8 text-base-content/50 text-sm">No folders or PDFs found.</div>';
                return;
            }

            let html = '';
            folders.forEach(folder => {
                html += `<div class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 border-l-3 border-transparent select-none" data-path="${folder.path}">
                    <span class="text-lg flex-shrink-0">📁</span>
                    <span class="truncate">${escapeHtml(folder.name)}</span>
                </div>`;
            });
            pdfs.forEach(pdf => {
                const draft = isDraft(pdf.name);
                const badge = draft
                    ? '<span class="badge badge-warning badge-xs ml-auto flex-shrink-0">DRAFT</span>'
                    : '<span class="badge badge-success badge-xs ml-auto flex-shrink-0">RELEASE</span>';
                const active = App.getCurrentPDFName() === pdf.name ? ' bg-primary/10 border-l-primary' : '';
                html += `<div class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-base-300 border-l-3 border-transparent${active} select-none" data-path="${pdf.path}" data-name="${escapeHtml(pdf.name)}">
                    <span class="text-lg flex-shrink-0">📄</span>
                    <span class="truncate">${escapeHtml(pdf.name)}</span>
                    ${badge}
                </div>`;
            });
            fileList.innerHTML = html;

            fileList.querySelectorAll('[data-path]').forEach(el => {
                if (el.querySelector('.badge')) {
                    el.addEventListener('click', () => App.loadPDF(el.dataset.path, el.dataset.name));
                } else {
                    el.addEventListener('click', () => loadDirectory(el.dataset.path));
                }
            });

            backBtn.disabled = !path;
        } catch (err) {
            fileList.innerHTML = `<div class="text-center py-8 text-error text-sm">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    backBtn.addEventListener('click', () => {
        if (!currentPath) return;
        const parent = currentPath.split('/').slice(0, -1).join('/');
        loadDirectory(parent || '');
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        fileList.querySelectorAll('[data-name]').forEach(el => {
            const name = (el.querySelector('.truncate')?.textContent || '').toLowerCase();
            el.style.display = name.includes(query) ? '' : 'none';
        });
        fileList.querySelectorAll('[data-path]:not([data-name])').forEach(el => {
            const name = (el.querySelector('.truncate')?.textContent || '').toLowerCase();
            el.style.display = name.includes(query) ? '' : 'none';
        });
    });

    function highlightActiveFile(pdfName) {
        fileList.querySelectorAll('[data-name]').forEach(el => el.classList.remove('bg-primary/10', 'border-l-primary'));
        const active = fileList.querySelector(`[data-name="${pdfName}"]`);
        if (active) active.classList.add('bg-primary/10', 'border-l-primary');
    }

    return {
        loadDirectory,
        highlightActiveFile,
        getCurrentPath: () => currentPath,
    };
})();
