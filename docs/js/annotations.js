var Annotations = (function() {
    var currentTool = 'select';
    var currentColor = 'rgba(255,213,79,0.45)';
    var annotations = {};
    var fabricCanvases = {};
    var pageContainers = {};
    var isDrawingRect = false;
    var rectStart = null;
    var tempRect = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function getReviewer() {
        var ri = $('reviewer-name');
        return (ri && ri.value.trim()) || 'Anonymous';
    }

    function getAnnotations() {
        return annotations[App.getCurrentPDFName()] || [];
    }

    function setAnnotations(anns) {
        annotations[App.getCurrentPDFName()] = anns;
    }

    function saveLocal() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); } catch (e) {}
    }

    function loadLocal() {
        try { annotations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { annotations = {}; }
    }

    async function syncToGitHub() {
        var pdfName = App.getCurrentPDFName();
        if (!pdfName) { return { synced: 0, updated: 0 }; }
        var anns = getAnnotations();
        var synced = 0;
        var updated = 0;
        for (var i = 0; i < anns.length; i++) {
            var ann = anns[i];
            try {
                if (ann.issueNumber) {
                    await API.updateAnnotationIssue(ann.issueNumber, ann);
                    updated++;
                } else {
                    var issue = await API.createAnnotationIssue(pdfName, ann);
                    ann.issueNumber = issue.number;
                    ann.issueUrl = issue.html_url;
                    synced++;
                }
            } catch (err) {
                console.warn('Sync failed:', err.message);
            }
        }
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
        return { synced: synced, updated: updated };
    }

    function addAnnotation(ann) {
        var anns = getAnnotations();
        ann.reviewer = getReviewer();
        ann.timestamp = new Date().toISOString();
        anns.push(ann);
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
        var pdfName = App.getCurrentPDFName();
        API.createAnnotationIssue(pdfName, ann).then(function(issue) {
            ann.issueNumber = issue.number;
            ann.issueUrl = issue.html_url;
            setAnnotations(anns);
            saveLocal();
            Sidebar.render(getAnnotations());
        }).catch(function() {});
    }

    function saveDrawings(pageNum) {
        var fc = fabricCanvases[pageNum];
        if (!fc) { return; }
        var objects = fc.getObjects().map(function(o) { return o.toJSON(); });
        var anns = getAnnotations().filter(function(a) {
            return !((a.type === 'drawing' || a.type === 'rectangle') && a.page === pageNum);
        });
        if (objects.length > 0) {
            anns.push({
                type: 'drawing',
                page: pageNum,
                objects: objects,
                color: currentColor,
                reviewer: getReviewer(),
                timestamp: new Date().toISOString()
            });
        }
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
    }

    function deleteAnnotation(index) {
    }

    function setTool(tool) {
    }

    function setColor(color) {
    }

    function createFabricCanvas(pageNum, canvasEl) {
    }

    function registerPage(pageNum, container) {
        pageContainers[pageNum] = container;
    }

    function handleHighlight(pageNum) {
    }

    function handleSticky(e, pageNum) {
    }

function handleRectDown(e) {
    if (currentTool !== 'rectangle') { return; }
    var target = e.target.closest('.page-wrapper');
    if (!target) { return; }
    var pageNum = parseInt(target.getAttribute('data-page'));
    if (isNaN(pageNum)) { return; }
    var fc = fabricCanvases[pageNum];
    if (!fc) { return; }
    var ptr = fc.getPointer(e);
    isDrawingRect = true;
    rectStart = { x: ptr.x, y: ptr.y };
    tempRect = new fabric.Rect({
        left: ptr.x,
        top: ptr.y,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: currentColor.replace(/[\d.]+\)$/, '1)'),
        strokeWidth: 2,
        strokeDashArray: [5, 5]
    });
    fc.add(tempRect);
}

function handleRectMove(e) {
    if (!isDrawingRect || !tempRect) { return; }
    var target = e.target.closest('.page-wrapper');
    if (!target) { return; }
    var pageNum = parseInt(target.getAttribute('data-page'));
    if (isNaN(pageNum)) { return; }
    var fc = fabricCanvases[pageNum];
    if (!fc) { return; }
    var ptr = fc.getPointer(e);
    tempRect.set({
        left: Math.min(ptr.x, rectStart.x),
        top: Math.min(ptr.y, rectStart.y),
        width: Math.abs(ptr.x - rectStart.x),
        height: Math.abs(ptr.y - rectStart.y)
    });
    fc.renderAll();
}

function handleRectUp(e) {
    if (!isDrawingRect || currentTool !== 'rectangle') {
        isDrawingRect = false;
        return;
    }
    isDrawingRect = false;
    if (tempRect && tempRect.width > 5 && tempRect.height > 5) {
        tempRect.set({
            strokeDashArray: null,
            fill: currentColor.replace(/[\d.]+\)$/, '0.3)')
        });
        var target = e.target.closest('.page-wrapper');
        if (target) {
            var pageNum = parseInt(target.getAttribute('data-page'));
            if (!isNaN(pageNum)) {
                showCommentModal('Rectangle on page ' + pageNum, function(comment) {
                    saveDrawings(pageNum);
                    var anns = getAnnotations();
                    var drawAnn = null;
                    for (var j = 0; j < anns.length; j++) {
                        if (anns[j].type === 'drawing' && anns[j].page === pageNum) {
                            drawAnn = anns[j];
                            break;
                        }
                    }
                    if (drawAnn) {
                        drawAnn.comment = comment || '';
                    }
                    setAnnotations(anns);
                    saveLocal();
                    Sidebar.render(getAnnotations());
                });
            }
        }
    } else if (tempRect) {
        try { tempRect.canvas.remove(tempRect); } catch (er) {}
    }
    tempRect = null;
    rectStart = null;
}

    function undo() {
        var cr = $('pdf-scroll-container').getBoundingClientRect();
        var best = null;
        var bestO = 0;
        Object.entries(pageContainers).forEach(function(e) {
            var r = e[1].getBoundingClientRect();
            var o = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
            if (o > bestO) { bestO = o; best = parseInt(e[0]); }
        });
        if (!best) { return; }
        var fc = fabricCanvases[best];
        if (!fc) { return; }
        var objs = fc.getObjects();
        if (!objs.length) { return; }
        fc.remove(objs[objs.length - 1]);
        fc.renderAll();
        saveDrawings(best);
    }

    function clearPage() {
        var cr = $('pdf-scroll-container').getBoundingClientRect();
        var best = null;
        var bestO = 0;
        Object.entries(pageContainers).forEach(function(e) {
            var r = e[1].getBoundingClientRect();
            var o = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
            if (o > bestO) { bestO = o; best = parseInt(e[0]); }
        });
        if (!best) { return; }
        var fc = fabricCanvases[best];
        if (!fc) { return; }
        fc.clear();
        fc.renderAll();
        var anns = getAnnotations().filter(function(a) { return a.page !== best; });
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
    }

    function dispose() {
        Object.values(fabricCanvases).forEach(function(fc) {
            try { fc.dispose(); } catch (e) {}
        });
        fabricCanvases = {};
        pageContainers = {};
    }

    function restoreAnnotations() {
        var anns = getAnnotations();
        anns.forEach(function(ann) {
            if ((ann.type === 'drawing' || ann.type === 'rectangle') && ann.objects && fabricCanvases[ann.page]) {
                fabric.util.enlivenObjects(ann.objects, function(objects) {
                    objects.forEach(function(o) { fabricCanvases[ann.page].add(o); });
                    fabricCanvases[ann.page].renderAll();
                });
            }
            if (ann.type === 'comment' && ann.x && ann.y && fabricCanvases[ann.page]) {
                var rect = new fabric.Rect({
                    left: ann.x - 22,
                    top: ann.y - 22,
                    width: 44,
                    height: 44,
                    fill: '#fef08a',
                    stroke: '#ca8a04',
                    strokeWidth: 2,
                    rx: 4,
                    ry: 4
                });
                fabricCanvases[ann.page].add(rect);
                fabricCanvases[ann.page].renderAll();
            }
        });
    }

    // Wire toolbar events
    document.querySelectorAll('[data-tool]').forEach(function(b) {
        b.onclick = function() { setTool(b.dataset.tool); };
    });
    document.querySelectorAll('.color-btn').forEach(function(b) {
        b.onclick = function() { setColor(b.dataset.color); };
    });

    // Wire rectangle events
    var scrollEl = $('pdf-scroll-container');
    if (scrollEl) {
        scrollEl.addEventListener('mousedown', handleRectDown);
        scrollEl.addEventListener('mousemove', handleRectMove);
        scrollEl.addEventListener('mouseup', handleRectUp);
    }

    // Wire action buttons
    var undoBtn = $('undo-btn');
    if (undoBtn) { undoBtn.onclick = undo; }
    var clearBtn = $('clear-page');
    if (clearBtn) { clearBtn.onclick = clearPage; }
    var syncBtn = $('sync-btn');
    if (syncBtn) {
        syncBtn.onclick = async function() {
            var result = await syncToGitHub();
            UI.showToast('Synced: ' + result.synced + ' new, ' + result.updated + ' updated', 'success');
        };
    }

    // Comment modal helper
    window.showCommentModal = function(context, callback) {
        var modal = document.getElementById('comment-modal');
        var ctx = document.getElementById('modal-context');
        var txt = document.getElementById('modal-comment');
        var saveBtn = document.getElementById('modal-save');
        var cancelBtn = document.getElementById('modal-cancel');
        if (!modal || !ctx || !txt || !saveBtn || !cancelBtn) {
            if (callback) { callback(''); }
            return;
        }
        ctx.textContent = context;
        txt.value = '';
        modal.showModal();
        setTimeout(function() { txt.focus(); }, 100);

        function onSave() {
            var comment = txt.value.trim();
            modal.close();
            saveBtn.removeEventListener('click', onSave);
            cancelBtn.removeEventListener('click', onCancel);
            if (callback) { callback(comment || ''); }
        }
        function onCancel() {
            modal.close();
            saveBtn.removeEventListener('click', onSave);
            cancelBtn.removeEventListener('click', onCancel);
            if (callback) { callback(''); }
        }
        saveBtn.addEventListener('click', onSave);
        cancelBtn.addEventListener('click', onCancel);
    };

    return {
        setTool: setTool,
        setColor: setColor,
        createFabricCanvas: createFabricCanvas,
        registerPage: registerPage,
        handleHighlight: handleHighlight,
        handleSticky: handleSticky,
        getAnnotations: getAnnotations,
        setAnnotations: setAnnotations,
        saveLocal: saveLocal,
        loadLocal: loadLocal,
        loadFromGitHub: async function(pdfName) {
            try {
                var issues = await API.fetchIssuesForPDF(pdfName);
                var githubAnns = [];
                issues.forEach(function(issue) {
                    var match = issue.body.match(/```json\n([\s\S]*?)\n```/);
                    if (!match) { return; }
                    try {
                        var data = JSON.parse(match[1]);
                        data.issueNumber = issue.number;
                        data.issueUrl = issue.html_url;
                        data.issueState = issue.state;
                        githubAnns.push(data);
                    } catch (e) {}
                });
                var localAnns = annotations[pdfName] || [];
                var merged = [];
                var seen = {};
                githubAnns.forEach(function(a) {
                    merged.push(a);
                    if (a.issueNumber) { seen[a.issueNumber] = true; }
                });
                localAnns.forEach(function(a) {
                    if (!a.issueNumber || !seen[a.issueNumber]) {
                        var dup = false;
                        for (var j = 0; j < merged.length; j++) {
                            if (merged[j].timestamp === a.timestamp && merged[j].page === a.page && merged[j].type === a.type) {
                                dup = true;
                                break;
                            }
                        }
                        if (!dup) { merged.push(a); }
                    }
                });
                annotations[pdfName] = merged;
                saveLocal();
                return githubAnns.length;
            } catch (err) {
                console.warn('Load from GitHub failed:', err.message);
                return 0;
            }
        },
        dispose: dispose,
        restoreAnnotations: restoreAnnotations,
        addAnnotation: addAnnotation,
        deleteAnnotation: deleteAnnotation,
        getCurrentTool: function() { return currentTool; },
        scrollToPage: function(pageNum) {
            var c = pageContainers[pageNum];
            if (c) {
                c.scrollIntoView({ behavior: 'smooth', block: 'center' });
                c.style.boxShadow = '0 0 0 4px oklch(var(--p))';
                setTimeout(function() { c.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)'; }, 1500);
            }
        }
    };
})();
