// ============================================================
// MAIN APP ENTRY POINT
// ============================================================
const App = (function() {
    let currentPDFName = '';
    let isLoadingPDF = false;

    const $ = function(id) { return document.getElementById(id); };

    async function loadPDF(contentsPath, name) {
        if (isLoadingPDF) return;
        isLoadingPDF = true;
        currentPDFName = name;
        Browser.highlightActiveFile(name);
        await PDFViewer.loadPDF(contentsPath, name);
        isLoadingPDF = false;
    }

    // Panel toggles
    $('toggle-browser').addEventListener('click', function() {
        $('browser-panel').classList.toggle('!w-0');
        $('browser-panel').classList.toggle('!min-w-0');
    });
    $('toggle-annotations').addEventListener('click', function() {
        $('annotation-sidebar').classList.toggle('!w-0');
        $('annotation-sidebar').classList.toggle('!min-w-0');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') Annotations.setToolMode('select');
        if (e.key === 'h' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
            Annotations.setToolMode('highlight');
        }
        if (e.key === 'd' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
            Annotations.setToolMode('draw');
        }
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
        loadPDF: loadPDF,
        getCurrentPDFName: function() { return currentPDFName; },
        init: init,
    };
})();

// ============================================================
// UI UTILITIES
// ============================================================
const UI = (function() {
    const toast = document.getElementById('toast');
    const toastAlert = document.getElementById('toast-alert');
    const toastMessage = document.getElementById('toast-message');
    const successIcon = document.getElementById('toast-icon-success');
    const errorIcon = document.getElementById('toast-icon-error');
    let timeout;

    function showToast(msg, type) {
        type = type || 'success';
        toastMessage.textContent = msg;
        toastAlert.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
        
        successIcon.classList.toggle('hidden', type !== 'success');
        errorIcon.classList.toggle('hidden', type !== 'error');
        
        toast.classList.remove('hidden');
        clearTimeout(timeout);
        timeout = setTimeout(function() { toast.classList.add('hidden'); }, 3000);
    }

    return {
        showToast: showToast,
    };
})();

// Start the app
App.init();
