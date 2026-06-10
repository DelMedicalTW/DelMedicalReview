// ============================================================
// PDF LOADING & RENDERING
// ============================================================
const PDFViewer = (function() {
    let pdfDoc = null;
    const $ = (id) => document.getElementById(id);
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
        pdfScrollContainer.innerHTML = '<div class="text-center py-10 text-base-content/50">Loading PDF...</div>';

        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const pdfData = await API.fetchPDF(contentsPath);
            console.log('PDF size:', pdfData.byteLength, 'bytes');

            const firstBytes = new Uint8Array(pdfData.slice(0, 5));
            const header = String.fromCharCode(...firstBytes);
            if (!header.startsWith('%PDF')) throw new Error('Not a valid PDF. Header: "' + header + '"');

            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            pdfDoc = await loadingTask.promise;
            console.log('PDF loaded. Pages:', pdfDoc.numPages);

            pdfScrollContainer.innerHTML = '';
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                await renderPage(i);
            }

            // Load annotations
            try {
                const issues = await API.fetchIssuesForPDF(name);
                const anns = [];
                issues.forEach(issue => {
                    if (!issue.body?.includes('<!-- delmed-pdf-annotation -->')) return;
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
            pdfScrollContainer.innerHTML = `
                <div class="flex-1 flex flex-col items-center justify-center text-base-content/40 text-center p-10">
                    <div class="text-6xl mb-4">⚠️</div>
                    <h3 class="text-xl font-semibold text-error">Failed to load PDF</h3>
                    <p class="mt-2 text-sm">${err.message}</p>
                </div>`;
            UI.showToast('Failed: ' + err.message, 'error');
        }
    }

    async function renderPage(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: CONFIG.PDF_SCALE });

        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container relative shadow-lg bg-white flex-shrink-0';
        pageContainer.style.width = viewport.width + 'px';
        page
