var PDFViewer = (function() {
    var pdfDoc = null;

    function $(id) { return document.getElementById(id); }

    async function loadPDF(contentsPath, name) {
        Annotations.dispose();
        pdfDoc = null;

        var toolbar = $('annotation-toolbar');
        if (toolbar) { toolbar.style.display = 'flex'; }
        var noPdf = $('no-pdf-message');
        if (noPdf) { noPdf.style.display = 'none'; }
        var scroll = $('pdf-scroll-container');
        if (!scroll) { return; }
        scroll.innerHTML = '<div class="text-center py-10 text-white/50"><span class="loading loading-spinner loading-lg"></span><p class="mt-3">Loading PDF...</p></div>';

        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            var data = await API.fetchPDF(contentsPath);
            var header = '';
            var bytes = new Uint8Array(data.slice(0, 5));
            for (var i = 0; i < bytes.length; i++) { header += String.fromCharCode(bytes[i]); }
            if (header.substring(0, 4) !== '%PDF') { throw new Error('Not a valid PDF'); }

            pdfDoc = await pdfjsLib.getDocument({ data: data }).promise;
            scroll.innerHTML = '';

            for (var p = 1; p <= pdfDoc.numPages; p++) {
                var page = await pdfDoc.getPage(p);
                var vp = page.getViewport({ scale: 1.5 });

                var wrapper = document.createElement('div');
                wrapper.className = 'page-wrapper';
                wrapper.style.width = vp.width + 'px';
                wrapper.style.height = vp.height + 'px';
                wrapper.setAttribute('data-page', String(p));

                var pdfCanvas = document.createElement('canvas');
                pdfCanvas.width = vp.width;
                pdfCanvas.height = vp.height;
                await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: vp }).promise;
                wrapper.appendChild(pdfCanvas);

                // Text layer
                var textContent = await page.getTextContent();
                var textLayer = document.createElement('div');
                textLayer.className = 'textLayer';
                textLayer.style.width = vp.width + 'px';
                textLayer.style.height = vp.height + 'px';
                textLayer.setAttribute('data-page', String(p));
                textContent.items.forEach(function(item) {
                    if (!item.str) { return; }
                    var tx = pdfjsLib.Util.transform(vp.transform, item.transform);
                    var fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
                    var style = textContent.styles[item.fontName] || {};
                    var span = document.createElement('span');
                    span.textContent = item.str;
                    span.style.left = tx[4] + 'px';
                    span.style.top = (tx[5] - fontHeight) + 'px';
                    span.style.fontSize = fontHeight + 'px';
                    span.style.fontFamily = style.fontFamily || 'sans-serif';
                    textLayer.appendChild(span);
                });
                wrapper.appendChild(textLayer);

                // Annotation canvas
                var annCanvas = document.createElement('canvas');
                annCanvas.className = 'ann-canvas';
                annCanvas.width = vp.width;
                annCanvas.height = vp.height;
                annCanvas.setAttribute('data-page', String(p));
                wrapper.appendChild(annCanvas);

                Annotations.createFabricCanvas(p, annCanvas);
                Annotations.registerPage(p, wrapper);

                // CRITICAL FIX: Use wrapper events that read data-page from the target
                wrapper.addEventListener('mouseup', function(e) {
                    var pw = e.currentTarget.closest('.page-wrapper');
                    if (pw) {
                        var pageNum = parseInt(pw.getAttribute('data-page'));
                        if (!isNaN(pageNum)) {
                            Annotations.handleHighlight(pageNum);
                        }
                    }
                });
                wrapper.addEventListener('dblclick', function(e) {
                    var pw = e.currentTarget.closest('.page-wrapper');
                    if (pw) {
                        var pageNum = parseInt(pw.getAttribute('data-page'));
                        if (!isNaN(pageNum)) {
                            Annotations.handleSticky(e, pageNum);
                        }
                    }
                });

                // Page label
                var label = document.createElement('div');
                label.className = 'page-label';
                label.textContent = 'Page ' + p;
                wrapper.appendChild(label);

                scroll.appendChild(wrapper);
            }

            Annotations.restoreAnnotations();
            Annotations.setTool('select');
            Sidebar.render(Annotations.getAnnotations());

            var count = Annotations.getAnnotations().length;
            UI.showToast('Loaded ' + pdfDoc.numPages + ' pages, ' + count + ' annotations', 'success');
        } catch (err) {
            console.error(err);
            scroll.innerHTML = '<div class="text-center py-10 text-white"><i data-lucide="alert-triangle" class="w-16 h-16 mx-auto mb-3 text-error opacity-60"></i><p class="text-error text-lg">' + err.message + '</p></div>';
            lucide.createIcons();
            UI.showToast('Error: ' + err.message, 'error');
        }
    }

    return {
        loadPDF: loadPDF,
        getPDFDoc: function() { return pdfDoc; }
    };
})();
