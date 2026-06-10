// ============================================================
// MAIN APP ENTRY POINT
// ============================================================
const App = (function() {
    let currentPDFName = '';
    let isLoadingPDF = false;

    const $ = (id) => document.getElementById(id);

    async function loadPDF(contentsPath, name) {
        if (isLoadingPDF) return;
        isLoadingPDF = true;
        currentPDFName = name;
        Browser.highlightActiveFile(name);
        await PDFViewer.loadPDF(contentsPath, name);
        isLoadingPDF = false;
    }

    // Panel toggles
    $('toggle-browser').addEventListener('click', () => {
        $('browser-panel').classList.toggle('!w-0');
        $('browser-panel').classList.toggle('!min-w-0');
    });
    $('toggle-annotations').addEventListener('click', () => {
        $('annotation-sidebar').classList.toggle('!w-0');
        $('annotation-sidebar').classList.toggle('!min-w-0');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') Annotations.setToolMode('select');
        if (e.key === 'h' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) Annotations.setToolMode('highlight');
        if (e.key === 'd' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) Annotations.setToolMode('draw');
    });

    // Initialize
    async function init() {
        try {
            await Browser.loadDirectory('');
            UI.showToast('Connected to DelMedicalRelease repository', 'success');
        } catch (err) {
            UI.showToast('Failed to load repository: ' + err.message, 'error');
        }
    }

    return {
        loadPDF,
        getCurrentPDFName: () => currentPDFName,
        init,
    };
})();

// ============================================================
// UI UTILITIES
// ============================================================
const UI = (function() {
    const toast = document.getElementById('toast');
    const toastAlert = document.getElementById('toast-alert');
    const toastMessage = document.getElementById('toast-message');
    let timeout;

    function showToast(msg, type) {
        type = type || 'success';
        toastMessage.textContent = msg;
        toastAlert.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
        toast.classList.remove('hidden');
        clearTimeout(timeout);
        timeout = setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    return { showToast };
})();

// Start the app
App.init();
