var App = (function() {
    var currentPDFName = '';
    var isLoadingPDF = false;

    function $(id) { return document.getElementById(id); }

    async function loadPDF(contentsPath, name) {
        if (isLoadingPDF) return;
        isLoadingPDF = true;
        currentPDFName = name;
        Browser.highlightFile(name);

        var pdfNameEl = $('current-pdf-name');
        if (pdfNameEl) pdfNameEl.textContent = name;

        Annotations.loadLocal();
        Sidebar.render(Annotations.getAnnotations());

        var syncBadge = $('sync-badge'), syncLabel = $('sync-label');
        if (syncBadge) syncBadge.className = 'badge badge-sm badge-info gap-1';
        if (syncLabel) syncLabel.textContent = 'Loading...';
        var count = await Annotations.loadFromGitHub(name);
        Sidebar.render(Annotations.getAnnotations());
        if (syncBadge) syncBadge.className = 'badge badge-sm badge-ghost gap-1';
        if (syncLabel) syncLabel.textContent = 'GitHub';

        await PDFViewer.loadPDF(contentsPath, name);
        isLoadingPDF = false;
    }

    function getCurrentPDFName() { return currentPDFName; }

    // Panel toggles
    $('toggle-browser').onclick = function() { var p = $('browser-panel'); if (p) { p.classList.toggle('!w-0'); p.classList.toggle('!min-w-0'); } };
    $('toggle-annotations').onclick = function() { var p = $('annotation-sidebar'); if (p) { p.classList.toggle('!w-0'); p.classList.toggle('!min-w-0'); } };

    // Theme with OS detection
    function applyTheme(theme) {
        if (theme === 'auto') {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    var savedTheme = localStorage.getItem('delmed-theme') || 'auto';
    applyTheme(savedTheme);

    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        if (localStorage.getItem('delmed-theme') === 'auto') applyTheme('auto');
    });

    document.querySelectorAll('[data-theme-switch]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            var theme = el.dataset.themeSwitch;
            localStorage.setItem('delmed-theme', theme);
            applyTheme(theme);
            var dd = el.closest('.dropdown');
            if (dd) { var btn = dd.querySelector('button'); if (btn) btn.blur(); }
        });
    });

    // Reviewer
    var reviewerInput = $('reviewer-name');
    if (reviewerInput) {
        reviewerInput.value = localStorage.getItem('delmed-reviewer') || '';
        reviewerInput.addEventListener('change', function() {
            localStorage.setItem('delmed-reviewer', reviewerInput.value.trim());
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Escape') Annotations.setTool('select');
        if (e.key === 'h') Annotations.setTool('highlight');
        if (e.key === 'd') Annotations.setTool('draw');
        if (e.key === 'r') Annotations.setTool('rectangle');
        if (e.key === 'n') Annotations.setTool('comment');
        if (e.key === 'j') { e.preventDefault(); Annotations.navigateAnnotations(1); }
        if (e.key === 'k') { e.preventDefault(); Annotations.navigateAnnotations(-1); }
    });

    // Init
    Browser.loadDir('').then(function() {
        UI.showToast('Connected to DelMedicalRelease', 'success');
    }).catch(function(err) {
        UI.showToast(err.message, 'error');
    });

    return {
        loadPDF: loadPDF,
        getCurrentPDFName: getCurrentPDFName
    };
})();

var UI = (function() {
    function showToast(msg, type) {
        var t = document.getElementById('toast');
        var a = document.getElementById('toast-alert');
        var m = document.getElementById('toast-message');
        var ok = document.getElementById('toast-icon-ok');
        var err = document.getElementById('toast-icon-err');
        if (!t || !a || !m) return;
        m.textContent = msg;
        a.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
        if (ok) ok.classList.toggle('hidden', type === 'error');
        if (err) err.classList.toggle('hidden', type !== 'error');
        t.classList.remove('hidden');
        clearTimeout(t._timer);
        t._timer = setTimeout(function() { t.classList.add('hidden'); }, 3500);
    }
    return { showToast: showToast };
})();
