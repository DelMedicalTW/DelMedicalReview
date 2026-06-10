// ============================================================
// PDF LOADING & RENDERING
// ============================================================
var PDFViewer = (function() {
    var pdfDoc = null;
    var pdfScrollContainer, noPdfMessage, annotationToolbar;

    function getEl(id) { return document.getElementById(id); }

    function init() {
        pdfScrollContainer = getEl('pdf-scroll-container');
        noPdfMessage = getEl('no-pdf-message');
        annotationToolbar = getEl('annotation-toolbar');
    }

    async function loadPDF(contentsPath, name) {
        if (!pdfScrollContainer) init();
        if (!pdfScrollContainer) return;

        Annotations.dispose();
        pdfDoc = null;
        pdfScrollContainer.innerHTML = '';
        Sidebar.clear();

        if (noPdfMessage) noPdfMessage.style.display = 'none';
        if (annotationToolbar) annotationToolbar.style.display = 'flex';
        pdfScrollContainer.innerHTML = '<div class="text-center py-10 text-base-content/50 text-sm">Loading PDF...</div>';

        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            var pdfData = await API.fetchPDF(contentsPath);
            console.log('PDF size:', pdfData.byteLength, 'bytes');

            var firstBytes = new Uint8Array(pdfData.slice(0, 5));
            var header = '';
            for (var i = 0; i < firstBytes.length; i++) {
                header += String.fromCharCode(firstBytes[i]);
            }
            if (header.substring(0, 4) !== '%PDF') throw new Error('Not a valid PDF. Header: "' + header + '"');

            var loadingTask = pdfjsLib.getDocument({ data: pdfData });
            pdfDoc = await loadingTask.promise;
            console.log('PDF loaded. Pages:', pdfDoc.numPages);

            pdfScrollContainer.innerHTML = '';
            for (var i = 1; i <= pdfDoc.numPages; i++) {
                await renderPage(i);
            }

            // Load annotations
            try {
                var issues = await API.fetchIssuesForPDF(name);
                var anns = [];
                issues.forEach(function(issue) {
                    if (!issue.body || issue.body.indexOf('<!-- delmed-pdf-annotation -->') === -1) return;
                    var match = issue.body.match(/```json\n([\s\S]*?)\n```/);
                    if (!match) return;
                    try {
                        var data = JSON.parse(match[1]);
                        data.issueNumber = issue.number;
                        data.issueState = issue.state;
                        data.issueUrl = issue.html_url;
                        anns.push(data);
                    } catch (e) {}
                });
                Annotations.setAnnotations(anns);
                for (var j = 1; j <= pdfDoc.numPages; j++) {
                    Annotations.restoreAnnotationsForPage(j);
                }
                Sidebar.render(anns);
                if (anns.length) UI.showToast('Loaded ' + anns.length + ' annotations', 'success');
            } catch (err) {
                console.warn('Could not load annotations:', err.message);
            }

            UI.showToast('Loaded ' + pdfDoc.numPages + ' pages', 'success');
        } catch (err) {
            console.error('PDF load error:', err);
            pdfScrollContainer.innerHTML =
                '<div class="flex-1 flex flex-col items-center justify-center text-base-content/40 text-center p-10">' +
                '<i data-lucide="alert-triangle" class="w-16 h-16 mb-4 text-error opacity-50"></i>' +
                '<h3 class="text-xl font-semibold text-error">Failed to load PDF</h3>' +
                '<p class="mt-2 text-sm">' + err.message + '</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            UI.showToast('Failed: ' + err.message, 'error');
        }
    }

    async function renderPage(pageNum) {
        var page = await pdfDoc.getPage(pageNum);
        var viewport = page.getViewport({ scale: CONFIG.PDF_SCALE });

        var pageContainer = document.createElement('div');
        pageContainer.className = 'page-container relative shadow-lg bg-white flex-shrink-0';
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.style.height = viewport.height + 'px';
        pageContainer.dataset.page = pageNum;

        var pdfCanvas = document.createElement('canvas');
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        pdfCanvas.className = 'block';
        var ctx = pdfCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        pageContainer.appendChild(pdfCanvas);

        var annCanvas = document.createElement('canvas');
        annCanvas.width = viewport.width;
        annCanvas.height = viewport.height;
        annCanvas.className = 'annotation-layer absolute top-0 left-0';
        annCanvas.style.width = viewport.width + 'px';
        annCanvas.style.height = viewport.height + 'px';
        pageContainer.appendChild(annCanvas);

        Annotations.createFabricCanvas(pageNum, annCanvas);
        Annotations.registerPageContainer(pageNum, pageContainer);

        var label = document.createElement('div');
        label.className = 'absolute bottom-2 right-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs pointer-events-none';
        label.textContent = 'Page ' + pageNum;
        pageContainer.appendChild(label);

        pdfScrollContainer.appendChild(pageContainer);
    }

    return {
        loadPDF: loadPDF,
        getPDFDoc: function() { return pdfDoc; },
    };
})();
