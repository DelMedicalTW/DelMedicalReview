// ============================================================
// ANNOTATION TOOLS (Fabric.js)
// ============================================================
var Annotations = (function() {
    var currentTool = 'select';
    var currentColor = 'rgba(255,213,79,0.4)';
    var annotations = [];
    var fabricCanvases = {};
    var pageContainers = {};
    var isDrawingRect = false;
    var rectStart = null;
    var tempRect = null;

    var quotePopup, pdfScrollContainer;

    function getEl(id) { return document.getElementById(id); }

    function setToolMode(tool) {
        currentTool = tool;
        document.querySelectorAll('[data-tool]').forEach(function(b) { b.classList.remove('active'); });
        var activeBtn = document.querySelector('[data-tool="' + tool + '"]');
        if (activeBtn) activeBtn.classList.add('active');

        Object.keys(fabricCanvases).forEach(function(key) {
            var fc = fabricCanvases[key];
            if (!fc) return;
            fc.isDrawingMode = (tool === 'draw');
            fc.selection = (tool === 'select' || tool === 'highlight' || tool === 'comment');
            if (tool === 'draw') {
                fc.freeDrawingBrush.color = currentColor.replace(/[\d.]+\)$/, '1)');
                fc.freeDrawingBrush.width = 2;
            }
        });
    }

    function setColor(color) {
        currentColor = color;
        document.querySelectorAll('.color-btn').forEach(function(b) { b.classList.remove('selected'); });
        var selected = document.querySelector('[data-color="' + color + '"]');
        if (selected) selected.classList.add('selected');
        if (currentTool === 'draw') {
            Object.keys(fabricCanvases).forEach(function(key) {
                var fc = fabricCanvases[key];
                if (fc) fc.freeDrawingBrush.color = currentColor.replace(/[\d.]+\)$/, '1)');
            });
        }
    }

    function createFabricCanvas(pageNum, annCanvas) {
        var fc = new fabric.Canvas(annCanvas, {
            selection: true,
            isDrawingMode: false,
            renderOnAddRemove: true,
        });
        fc.selection = true;
        fc.on('object:modified', function() { saveAnnotationState(pageNum); });
        fc.on('path:created', function() { saveAnnotationState(pageNum); });
        fabricCanvases[pageNum] = fc;
        setToolMode(currentTool);
        return fc;
    }

    function registerPageContainer(pageNum, container) {
        pageContainers[pageNum] = container;
        container.addEventListener('mouseup', function(e) { handleTextSelection(e, pageNum); });
        container.addEventListener('dblclick', function(e) { handlePageDoubleClick(e, pageNum); });
    }

    function handleTextSelection(e, pageNum) {
        if (currentTool !== 'highlight') return;
        var selection = window.getSelection();
        var text = selection.toString().trim();
        if (!text) return;
        var container = pageContainers[pageNum];
        if (!container || !container.contains(selection.anchorNode)) return;

        var range = selection.getRangeAt(0);
        var rect = range.getBoundingClientRect();

        quotePopup.style.display = 'flex';
        quotePopup.style.left = Math.max(10, rect.left + rect.width / 2 - 70) + 'px';
        quotePopup.style.top = Math.max(10, rect.bottom + 10) + 'px';
        quotePopup.dataset.pageNum = pageNum;
        quotePopup.dataset.quotedText = text;

        addHighlightFromSelection(selection, pageNum);
        setTimeout(function() { quotePopup.style.display = 'none'; }, 4000);
    }

    quotePopup = getEl('quote-popup');
    if (quotePopup) {
        quotePopup.addEventListener('click', async function() {
            var pageNum = parseInt(quotePopup.dataset.pageNum);
            var quotedText = quotePopup.dataset.quotedText;
            var comment = prompt('Add a comment to this quote:', '');
            if (comment === null) return;

            var annotation = {
                type: 'quote', page: pageNum, quotedText: quotedText,
                comment: comment || '', color: currentColor, timestamp: new Date().toISOString(),
            };
            annotations.push(annotation);

            try {
                await API.createAnnotationIssue(App.getCurrentPDFName(), pageNum, annotation);
                UI.showToast('Quote saved as GitHub Issue', 'success');
            } catch (err) {
                UI.showToast('Failed to save quote: ' + err.message, 'error');
            }
            Sidebar.render(annotations);
            quotePopup.style.display = 'none';
        });
    }

    function addHighlightFromSelection(selection, pageNum) {
        var range = selection.getRangeAt(0);
        var container = pageContainers[pageNum];
        if (!container) return;
        var containerRect = container.getBoundingClientRect();
        var rects = range.getClientRects();
        var fc = fabricCanvases[pageNum];
        if (!fc) return;

        for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            fc.add(new fabric.Rect({
                left: r.left - containerRect.left,
                top: r.top - containerRect.top,
                width: r.width,
                height: r.height,
                fill: currentColor,
                selectable: true,
                evented: true,
                opacity: 0.5,
            }));
        }
        fc.renderAll();
        saveAnnotationState(pageNum);
    }

    function handlePageDoubleClick(e, pageNum) {
        if (currentTool !== 'comment') return;
        var container = pageContainers[pageNum];
        if (!container) return;
        var rect = container.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var comment = prompt('Add a sticky note comment:', '');
        if (!comment) return;

        var fc = fabricCanvases[pageNum];
        if (!fc) return;

        var circle = new fabric.Circle({
            left: x - 10, top: y - 10, radius: 10,
            fill: '#3fb950', opacity: 0.7, selectable: true,
        });
        var textObj = new fabric.Text('📝', {
            left: x - 10, top: y - 12, fontSize: 16, selectable: false,
        });
        fc.add(new fabric.Group([circle, textObj], { left: x - 10, top: y - 10, selectable: true }));
        fc.renderAll();

        var annotation = {
            type: 'comment', page: pageNum, comment: comment,
            x: Math.round(x), y: Math.round(y), timestamp: new Date().toISOString(),
        };
        annotations.push(annotation);
        saveAnnotationState(pageNum);

        API.createAnnotationIssue(App.getCurrentPDFName(), pageNum, annotation)
            .then(function() { UI.showToast('Note saved', 'success'); })
            .catch(function(err) { UI.showToast('Note saved locally (GitHub: ' + err.message + ')', 'error'); });
        Sidebar.render(annotations);
    }

    // Rectangle drawing on pdfScrollContainer
    pdfScrollContainer = getEl('pdf-scroll-container');
    if (pdfScrollContainer) {
        pdfScrollContainer.addEventListener('mousedown', function(e) {
            if (currentTool !== 'rectangle') return;
            var target = e.target.closest('.page-container');
            if (!target) return;
            var pageNum = parseInt(target.dataset.page);
            var fc = fabricCanvases[pageNum];
            if (!fc) return;

            var pointer = fc.getPointer(e);
            isDrawingRect = true;
            rectStart = { x: pointer.x, y: pointer.y };
            tempRect = new fabric.Rect({
                left: pointer.x, top: pointer.y, width: 0, height: 0,
                fill: 'transparent', stroke: currentColor.replace(/[\d.]+\)$/, '1)'),
                strokeWidth: 2, selectable: false, evented: false,
            });
            fc.add(tempRect);
        });

        pdfScrollContainer.addEventListener('mousemove', function(e) {
            if (!isDrawingRect || !tempRect) return;
            var target = e.target.closest('.page-container');
            if (!target) return;
            var fc = fabricCanvases[parseInt(target.dataset.page)];
            if (!fc) return;

            var pointer = fc.getPointer(e);
            var w = pointer.x - rectStart.x;
            var h = pointer.y - rectStart.y;
            tempRect.set({
                left: w > 0 ? rectStart.x : pointer.x,
                top: h > 0 ? rectStart.y : pointer.y,
                width: Math.abs(w), height: Math.abs(h),
            });
            fc.renderAll();
        });

        pdfScrollContainer.addEventListener('mouseup', function(e) {
            if (!isDrawingRect) return;
            isDrawingRect = false;
            if (tempRect && tempRect.width > 5 && tempRect.height > 5) {
                tempRect.set({ selectable: true, evented: true });
                var target = e.target.closest('.page-container');
                if (target) saveAnnotationState(parseInt(target.dataset.page));
            } else if (tempRect) {
                try { tempRect.canvas.remove(tempRect); } catch (er) {}
            }
            tempRect = null;
            rectStart = null;
        });
    }

    function saveAnnotationState(pageNum) {
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        var objects = fc.getObjects().map(function(o) { return o.toJSON(); });
        var existingIdx = -1;
        for (var i = 0; i < annotations.length; i++) {
            if (annotations[i].type === 'drawing' && annotations[i].page === pageNum) {
                existingIdx = i; break;
            }
        }
        if (existingIdx >= 0) {
            annotations[existingIdx].objects = objects;
            annotations[existingIdx].timestamp = new Date().toISOString();
        } else if (objects.length > 0) {
            annotations.push({
                type: 'drawing', page: pageNum, objects: objects,
                color: currentColor, timestamp: new Date().toISOString(),
            });
        }
        Sidebar.render(annotations);
    }

    function restoreAnnotationsForPage(pageNum) {
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        fc.clear();
        annotations.filter(function(a) { return a.page === pageNum; }).forEach(function(ann) {
            if (ann.type === 'drawing' && ann.objects && ann.objects.length) {
                fabric.util.enlivenObjects(ann.objects, function(objects) {
                    objects.forEach(function(o) { fc.add(o); });
                    fc.renderAll();
                });
            }
        });
    }

    function clearPageAnnotations(pageNum) {
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        fc.clear();
        fc.renderAll();
        annotations = annotations.filter(function(a) { return a.page !== pageNum; });
        Sidebar.render(annotations);
    }

    function findMostVisiblePage() {
        if (!pdfScrollContainer) return null;
        var containerRect = pdfScrollContainer.getBoundingClientRect();
        var bestPage = null, bestOverlap = 0;
        Object.keys(pageContainers).forEach(function(pageNum) {
            var el = pageContainers[pageNum];
            var rect = el.getBoundingClientRect();
            var overlap = Math.max(0, Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top));
            if (overlap > bestOverlap) { bestOverlap = overlap; bestPage = parseInt(pageNum); }
        });
        return bestPage;
    }

    function dispose() {
        Object.keys(fabricCanvases).forEach(function(key) {
            try { fabricCanvases[key].dispose(); } catch (e) {}
        });
        fabricCanvases = {};
        pageContainers = {};
        annotations = [];
        isDrawingRect = false;
        rectStart = null;
        tempRect = null;
    }

    // Toolbar button event listeners
    function initToolbar() {
        document.querySelectorAll('[data-tool]').forEach(function(btn) {
            btn.addEventListener('click', function() { setToolMode(btn.dataset.tool); });
        });
        document.querySelectorAll('.color-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { setColor(btn.dataset.color); });
        });

        var clearBtn = getEl('clear-page-annotations');
        if (clearBtn) clearBtn.addEventListener('click', function() {
            var page = findMostVisiblePage();
            if (page) { clearPageAnnotations(page); UI.showToast('Cleared annotations on page ' + page, 'success'); }
        });

        var saveBtn = getEl('save-annotations-btn');
        if (saveBtn) saveBtn.addEventListener('click', async function() {
            var saved = 0, errors = 0;
            for (var i = 0; i < annotations.length; i++) {
                var ann = annotations[i];
                if (ann.issueNumber) continue;
                try {
                    var issue = await API.createAnnotationIssue(App.getCurrentPDFName(), ann.page, ann);
                    ann.issueNumber = issue.number;
                    ann.issueUrl = issue.html_url;
                    saved++;
                } catch (err) { errors++; }
            }
            if (saved > 0 && errors === 0) UI.showToast('Saved ' + saved + ' annotations', 'success');
            else if (saved > 0) UI.showToast('Saved ' + saved + ', ' + errors + ' failed', 'error');
            else if (errors > 0) UI.showToast('Failed to save ' + errors + ' annotations', 'error');
            else UI.showToast('All annotations already saved.', 'success');
            Sidebar.render(annotations);
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('#quote-popup') && currentTool !== 'highlight') {
                if (quotePopup) quotePopup.style.display = 'none';
            }
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToolbar);
    } else {
        initToolbar();
    }

    return {
        setToolMode: setToolMode,
        setColor: setColor,
        createFabricCanvas: createFabricCanvas,
        registerPageContainer: registerPageContainer,
        restoreAnnotationsForPage: restoreAnnotationsForPage,
        dispose: dispose,
        getAnnotations: function() { return annotations; },
        setAnnotations: function(a) { annotations = a; },
        scrollToPage: function(pageNum) {
            var container = pageContainers[pageNum];
            if (container) {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                container.style.boxShadow = '0 0 0 4px var(--fallback-p, oklch(var(--p)))';
                setTimeout(function() { container.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)'; }, 1500);
            }
        },
    };
})();
