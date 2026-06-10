// ============================================================
// MAIN APP ENTRY POINT
// ============================================================
var App = (function() {
    var currentPDFName = '';
    var isLoadingPDF = false;

    function getEl(id) { return document.getElementById(id); }

    async function loadPDF(contentsPath, name) {
        if (isLoadingPDF) return;
        isLoadingPDF = true;
        currentPDFName = name;
        Browser.highlightActiveFile(name);
        await PDFViewer.loadPDF(contentsPath, name);
        isLoadingPDF = false;
    }

    function init() {
        var toggleBrowser = getEl('toggle-browser');
        var toggleAnnotations = getEl('toggle-annotations');

        if (toggleBrowser) toggleBrowser.addEventListener('click', function() {
            var panel = getEl('browser-panel');
            if (panel) { panel.classList.toggle('!w-0'); panel.classList.toggle('!min-w-0'); }
        });
        if (toggleAnnotations) toggleAnnotations.addEventListener('click', function() {
            var panel = getEl('annotation-sidebar');
            if (panel) { panel.classList.toggle('!w-0'); panel.classList.toggle('!min-w-0'); }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') Annotations.setToolMode('select');
            if (e.key === 'h' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) Annotations.setToolMode('highlight');
            if (e.key === 'd' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) Annotations.setToolMode('draw');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
            Browser.loadDirectory('').then(function() {
                UI.showToast('Connected to DelMedicalRelease repository', 'success');
            }).catch(function(err) {
                UI.showToast('Failed to load repository: ' + err.message, 'error');
            });
        });
    } else {
        init();
        Browser.loadDirectory('').then(function() {
            UI.showToast('Connected to DelMedicalRelease repository', 'success');
        }).catch(function(err) {
            UI.showToast('Failed to load repository: ' + err.message, 'error');
        });
    }

    return {
        loadPDF: loadPDF,
        getCurrentPDFName: function() { return currentPDFName; },
    };
})();

// ============================================================
// UI UTILITIES
// ============================================================
var UI = (function() {
    var toast, toastAlert, toastMessage, successIcon, errorIcon, timeout;

    function init() {
        toast = document.getElementById('toast');
        toastAlert = document.getElementById('toast-alert');
        toastMessage = document.getElementById('toast-message');
        successIcon = document.getElementById('toast-icon-success');
        errorIcon = document.getElementById('toast-icon-error');
    }

    function showToast(msg, type) {
        if (!toast) init();
        if (!toast) return;
        type = type || 'success';
        toastMessage.textContent = msg;
        toastAlert.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
        if (successIcon) successIcon.classList.toggle('hidden', type !== 'success');
        if (errorIcon) errorIcon.classList.toggle('hidden', type !== 'error');
        toast.classList.remove('hidden');
        clearTimeout(timeout);
        timeout = setTimeout(function() { toast.classList.add('hidden'); }, 3000);
    }

    return { showToast: showToast };
})();
