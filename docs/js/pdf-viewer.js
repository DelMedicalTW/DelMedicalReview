// ============================================================
// PDF LOADING & RENDERING
// ============================================================
var PDFViewer = (function() {
    if (typeof PDFViewer !== 'undefined' && PDFViewer.loadPDF) {
        return PDFViewer;
    }
    let pdfDoc = null;
    const $ = function(id) { return document.getElementById(id); };
    const pdfScrollContainer = $('pdf-scroll-container');
    const noPdfMessage = $('no-pdf-message');
    const annotationToolbar = $('annotation-toolbar');

    async function loadPDF(contentsPath, name) {
        // Cleanup previous
        Annotations.dispose();
        pdfDoc = null;
        pdfScrollContainer.innerHTML = '';
        Sidebar.clear();

        // Show loading
        noPdfMessage.style.display = 'none';
        annotationToolbar.style.display = 'flex';
        pdfScrollContainer.innerHTML = '<div class="text-center py-10 text-base-content/50 text-sm">Loading PDF...</div>';

        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const pdfData = await API.fetchPDF(contentsPath);
            console.log('PDF size:', pdfData.byteLength, 'bytes');

            const firstBytes = new Uint8Array(pdfData.slice(0, 5));
            const header = String.fromCharCode.apply(null, firstBytes);
            if (!header.startsWith('%PDF')) throw new Error('Not a valid PDF. Header: "' + header + '"');

            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            pdfDoc = await loadingTask.promise;
            console.log('PDF loaded. Pages:', pdfDoc.numPages);

            pdfScrollContainer.innerHTML = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                await renderPage(i);
            }

            // Load annotations from GitHub Issues
            try {
                const issues = await API.fetchIssuesForPDF(name);
                const anns = [];
                issues.forEach(function(issue) {
                    if (!issue.body || issue.body.indexOf('<!-- delmed-pdf-annotation -->') === -1) return;
                    const match = issue.body.match(/```json\n([\s\S]*?)\n```/);
                    if (!match) return;
                    try {
                        const data = JSON.parse(match[1]);
                        data.issueNumber = issue.number;
                        data.issueState = issue.state;
                        data.issueUrl = issue.html_url;
                        anns.push(data);
                    } catch (e) {}
                });
                Annotations.setAnnotations(anns);
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    Annotations.restoreAnnotationsForPage(i);
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
                '<p class="mt-2 text-sm">' + err.message + '</p>' +
                '</div>';
            lucide.createIcons();
            UI.showToast('Failed: ' + err.message, 'error');
        }
    }

    async function renderPage(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: CONFIG.PDF_SCALE });

        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container relative shadow-lg bg-white flex-shrink-0';
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.style.height = viewport.height + 'px';
        pageContainer.dataset.page = pageNum;

        // PDF canvas
        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        pdfCanvas.className = 'block';
        const ctx = pdfCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        pageContainer.appendChild(pdfCanvas);

        // Annotation layer
        const annCanvas = document.createElement('canvas');
        annCanvas.width = viewport.width;
        annCanvas.height = viewport.height;
        annCanvas.className = 'annotation-layer absolute top-0 left-0';
        annCanvas.style.width = viewport.width + 'px';
        annCanvas.style.height = viewport.height + 'px';
        pageContainer.appendChild(annCanvas);

        // Fabric canvas
        Annotations.createFabricCanvas(pageNum, annCanvas);
        Annotations.registerPageContainer(pageNum, pageContainer);

        // Page label
        const label = document.createElement('div');
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
