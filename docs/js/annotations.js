var Annotations = (function() {
    var currentTool = 'select';
    var currentColor = 'rgba(255,213,79,0.45)';
    var annotations = {};
    var fabricCanvases = {};
    var pageContainers = {};
    var isDrawingRect = false;
    var rectStart = null;
    var tempRect = null;
    var currentAnnotationIndex = -1;

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

    function generateId() {
        return 'ann-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }

    async function syncToGitHub() {
        var pdfName = App.getCurrentPDFName();
        if (!pdfName) return { synced: 0, updated: 0 };
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
        ann.id = generateId();
        ann.reviewer = getReviewer();
        ann.timestamp = new Date().toISOString();
        ann.status = ann.status || 'open';
        ann.replies = ann.replies || [];
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

    function updateAnnotationStatus(index, newStatus) {
        var anns = getAnnotations();
        if (index < 0 || index >= anns.length) return;
        anns[index].status = newStatus;
        if (anns[index].issueNumber) {
            API.updateAnnotationIssue(anns[index].issueNumber, anns[index]).catch(function() {});
        }
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
    }

    function addReply(index, replyText) {
        var anns = getAnnotations();
        if (index < 0 || index >= anns.length) return;
        var reply = {
            id: generateId(),
            reviewer: getReviewer(),
            text: replyText,
            timestamp: new Date().toISOString()
        };
        anns[index].replies = anns[index].replies || [];
        anns[index].replies.push(reply);
        if (anns[index].issueNumber) {
            var commentBody = '**' + reply.reviewer + '** replied:\n' + replyText;
            API.addIssueComment(anns[index].issueNumber, commentBody).catch(function() {});
        }
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
    }

    function deleteAnnotation(index) {
        var anns = getAnnotations();
        var ann = anns[index];
        if (!ann) return;
        if (ann.issueNumber) {
            API.closeAnnotationIssue(ann.issueNumber).catch(function() {});
        }
        if (ann.page && (ann.type === 'drawing' || ann.type === 'rectangle' || ann.type === 'comment')) {
            var fc = fabricCanvases[ann.page];
            if (fc) { fc.clear(); fc.renderAll(); }
        }
        anns.splice(index, 1);
        setAnnotations(anns);
        saveLocal();
        Sidebar.render(getAnnotations());
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('[data-tool]').forEach(function(b) { b.classList.remove('tool-active'); });
        var btn = document.querySelector('[data-tool="' + tool + '"]');
        if (btn) btn.classList.add('tool-active');
        Object.values(fabricCanvases).forEach(function(fc) {
            if (!fc || !fc.lowerCanvasEl) return;
            var el = fc.lowerCanvasEl;
            if (tool === 'select') { el.style.pointerEvents = 'none'; fc.isDrawingMode = false; fc.selection = false; }
            else if (tool === 'draw') { el.style.pointerEvents = 'auto'; fc.isDrawingMode = true; fc.selection = false; fc.freeDrawingBrush.color = currentColor.replace(/[\d.]+\)$/, '1)'); fc.freeDrawingBrush.width = 3; }
            else if (tool === 'highlight') { el.style.pointerEvents = 'none'; fc.isDrawingMode = false; fc.selection = false; }
            else { el.style.pointerEvents = 'auto'; fc.isDrawingMode = false; fc.selection = false; }
            fc.renderAll();
        });
    }

    function setColor(color) {
        currentColor = color;
        document.querySelectorAll('.color-btn').forEach(function(b) { b.classList.remove('selected'); });
        var btn = document.querySelector('[data-color="' + color + '"]');
        if (btn) btn.classList.add('selected');
        if (currentTool === 'draw') {
            Object.values(fabricCanvases).forEach(function(fc) {
                if (fc) fc.freeDrawingBrush.color = color.replace(/[\d.]+\)$/, '1)');
            });
        }
    }

    function createFabricCanvas(pageNum, canvasEl) {
        var fc = new fabric.Canvas(canvasEl, { selection: false, isDrawingMode: false, renderOnAddRemove: true });
        fc.lowerCanvasEl.style.pointerEvents = 'none';
        fc.on('object:modified', function() { saveDrawings(pageNum); });
        fc.on('path:created', function() {
            saveDrawings(pageNum);
            var anns = getAnnotations();
            var drawAnn = null;
            for (var j = 0; j < anns.length; j++) {
                if (anns[j].type === 'drawing' && anns[j].page === pageNum && !anns[j]._prompted) { drawAnn = anns[j]; break; }
            }
            if (drawAnn && fc.getObjects().length > 0) {
                drawAnn._prompted = true;
                setAnnotations(anns); saveLocal();
                showCommentModal('Drawing on page ' + pageNum, function(comment) {
                    var cur = getAnnotations();
                    for (var k = 0; k < cur.length; k++) {
                        if (cur[k].type === 'drawing' && cur[k].page === pageNum && cur[k]._prompted) {
                            cur[k].comment = comment || ''; delete cur[k]._prompted; break;
                        }
                    }
                    setAnnotations(cur); saveLocal(); Sidebar.render(getAnnotations());
                });
            }
        });
        fabricCanvases[pageNum] = fc;
        return fc;
    }

    function registerPage(pageNum, container) { pageContainers[pageNum] = container; }

    function handleHighlight(pageNum) {
        if (currentTool !== 'highlight') return;
        var sel = window.getSelection();
        var text = sel.toString().trim();
        if (!text) return;
        var container = pageContainers[pageNum];
        if (!container || !container.contains(sel.anchorNode)) return;
        var range = sel.getRangeAt(0);
        var rects = range.getClientRects();
        var cr = container.getBoundingClientRect();
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            fc.add(new fabric.Rect({
                left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height,
                fill: currentColor, selectable: false, evented: false, opacity: 0.5
            }));
        }
        fc.renderAll();
        var preview = text.length > 80 ? text.substring(0, 80) + '...' : text;
        showCommentModal('Highlight on page ' + pageNum + ': "' + preview + '"', function(comment) {
            addAnnotation({ type: 'highlight', page: pageNum, comment: comment || text.substring(0, 100), quotedText: text, color: currentColor });
        });
    }

    function handleSticky(e, pageNum) {
        if (currentTool !== 'comment') return;
        var container = pageContainers[pageNum];
        if (!container) return;
        var cr = container.getBoundingClientRect();
        var x = e.clientX - cr.left;
        var y = e.clientY - cr.top;
        showCommentModal('Note on page ' + pageNum, function(comment) {
            if (!comment) return;
            var fc = fabricCanvases[pageNum];
            if (!fc) return;
            var rect = new fabric.Rect({
                left: x - 22, top: y - 22, width: 44, height: 44,
                fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4
            });
            fc.add(rect); fc.renderAll();
            addAnnotation({ type: 'comment', page: pageNum, comment: comment, x: Math.round(x), y: Math.round(y) });
        });
    }

    function handleRectDown(e) {
        if (currentTool !== 'rectangle') return;
        var target = e.target.closest('.page-wrapper');
        if (!target) return;
        var pageNum = parseInt(target.getAttribute('data-page'));
        if (isNaN(pageNum)) return;
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        var ptr = fc.getPointer(e);
        isDrawingRect = true; rectStart = { x: ptr.x, y: ptr.y };
        tempRect = new fabric.Rect({
            left: ptr.x, top: ptr.y, width: 0, height: 0,
            fill: 'transparent', stroke: currentColor.replace(/[\d.]+\)$/, '1)'), strokeWidth: 2, strokeDashArray: [5, 5]
        });
        fc.add(tempRect);
    }

    function handleRectMove(e) {
        if (!isDrawingRect || !tempRect) return;
        var target = e.target.closest('.page-wrapper');
        if (!target) return;
        var pageNum = parseInt(target.getAttribute('data-page'));
        if (isNaN(pageNum)) return;
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        var ptr = fc.getPointer(e);
        tempRect.set({
            left: Math.min(ptr.x, rectStart.x), top: Math.min(ptr.y, rectStart.y),
            width: Math.abs(ptr.x - rectStart.x), height: Math.abs(ptr.y - rectStart.y)
        });
        fc.renderAll();
    }

    function handleRectUp(e) {
        if (!isDrawingRect || currentTool !== 'rectangle') { isDrawingRect = false; return; }
        isDrawingRect = false;
        if (tempRect && tempRect.width > 5 && tempRect.height > 5) {
            tempRect.set({ strokeDashArray: null, fill: currentColor.replace(/[\d.]+\)$/, '0.3)' });
            var target = e.target.closest('.page-wrapper');
            if (target) {
                var pageNum = parseInt(target.getAttribute('data-page'));
                if (!isNaN(pageNum)) {
                    showCommentModal('Rectangle on page ' + pageNum, function(comment) {
                        saveDrawings(pageNum);
                        var anns = getAnnotations();
                        for (var j = 0; j < anns.length; j++) {
                            if (anns[j].type === 'drawing' && anns[j].page === pageNum) { anns[j].comment = comment || ''; break; }
                        }
                        setAnnotations(anns); saveLocal(); Sidebar.render(getAnnotations());
                    });
                }
            }
        } else if (tempRect) { try { tempRect.canvas.remove(tempRect); } catch (er) {} }
        tempRect = null; rectStart = null;
    }

    function saveDrawings(pageNum) {
        var fc = fabricCanvases[pageNum];
        if (!fc) return;
        var objects = fc.getObjects().map(function(o) { return o.toJSON(); });
        var anns = getAnnotations().filter(function(a) {
            return !((a.type === 'drawing' || a.type === 'rectangle') && a.page === pageNum);
        });
        if (objects.length > 0) {
            anns.push({
                type: 'drawing', page: pageNum, objects: objects,
                color: currentColor, reviewer: getReviewer(), timestamp: new Date().toISOString()
            });
        }
        setAnnotations(anns); saveLocal(); Sidebar.render(getAnnotations());
    }

    function undo() {
        var cr = $('pdf-scroll-container').getBoundingClientRect();
        var best = null, bestO = 0;
        Object.entries(pageContainers).forEach(function(e) {
            var r = e[1].getBoundingClientRect();
            var o = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
            if (o > bestO) { bestO = o; best = parseInt(e[0]); }
        });
        if (!best) return;
        var fc = fabricCanvases[best];
        if (!fc) return;
        var objs = fc.getObjects();
        if (!objs.length) return;
        fc.remove(objs[objs.length - 1]); fc.renderAll();
        saveDrawings(best);
    }

    function clearPage() {
        var cr = $('pdf-scroll-container').getBoundingClientRect();
        var best = null, bestO = 0;
        Object.entries(pageContainers).forEach(function(e) {
            var r = e[1].getBoundingClientRect();
            var o = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
            if (o > bestO) { bestO = o; best = parseInt(e[0]); }
        });
        if (!best) return;
        var fc = fabricCanvases[best];
        if (!fc) return;
        fc.clear(); fc.renderAll();
        var anns = getAnnotations().filter(function(a) { return a.page !== best; });
        setAnnotations(anns); saveLocal(); Sidebar.render(getAnnotations());
    }

    function dispose() {
        Object.values(fabricCanvases).forEach(function(fc) { try { fc.dispose(); } catch (e) {} });
        fabricCanvases = {}; pageContainers = {};
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
                    left: ann.x - 22, top: ann.y - 22, width: 44, height: 44,
                    fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4
                });
                fabricCanvases[ann.page].add(rect); fabricCanvases[ann.page].renderAll();
            }
        });
    }

    function navigateAnnotations(direction) {
        var filtered = Sidebar.getFilteredAnnotations();
        if (!filtered.length) return;
        if (currentAnnotationIndex < 0) currentAnnotationIndex = 0;
        currentAnnotationIndex += direction;
        if (currentAnnotationIndex < 0) currentAnnotationIndex = filtered.length - 1;
        if (currentAnnotationIndex >= filtered.length) currentAnnotationIndex = 0;
        var ann = filtered[currentAnnotationIndex];
        if (ann && ann.page) {
            var c = pageContainers[ann.page];
            if (c) {
                c.scrollIntoView({ behavior: 'smooth', block: 'center' });
                c.style.boxShadow = '0 0 0 4px oklch(var(--p))';
                setTimeout(function() { c.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)'; }, 2000);
            }
        }
        Sidebar.highlightAnnotation(currentAnnotationIndex);
    }

    function exportCSV() {
        var anns = getAnnotations();
        var csv = 'Page,Type,Reviewer,Status,Comment,Date\n';
        anns.forEach(function(a) {
            var comment = (a.comment || '').replace(/"/g, '""');
            csv = csv + a.page + ',' + a.type + ',' + (a.reviewer || '') + ',' + (a.status || 'open') + ',"' + comment + '",' + a.timestamp + '\n';
        });
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'annotations-' + (App.getCurrentPDFName() || 'export') + '.csv';
        link.click();
        URL.revokeObjectURL(url);
        UI.showToast('CSV exported', 'success');
    }

    function exportPDFReport() {
        var anns = getAnnotations();
        var doc = new jspdf.jsPDF();
        var pdfName = App.getCurrentPDFName() || 'Unknown';
        doc.setFontSize(16);
        doc.text('Annotation Report', 14, 20);
        doc.setFontSize(10);
        doc.text('Document: ' + pdfName, 14, 30);
        doc.text('Exported: ' + new Date().toLocaleString(), 14, 36);
        doc.text('Total Annotations: ' + anns.length, 14, 42);
        var y = 52;
        for (var i = 0; i < anns.length; i++) {
            var a = anns[i];
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFontSize(11);
            doc.text('#' + (i + 1) + ' Page ' + a.page + ' - ' + a.type + ' [' + (a.status || 'open') + ']', 14, y);
            y += 7;
            doc.setFontSize(9);
            if (a.comment) { doc.text('Comment: ' + a.comment, 20, y); y += 6; }
            if (a.quotedText) {
                var qt = a.quotedText;
                if (qt.length > 100) qt = qt.substring(0, 100);
                doc.text('Quoted: ' + qt, 20, y); y += 6;
            }
            doc.text('By: ' + (a.reviewer || 'Unknown') + ' on ' + new Date(a.timestamp).toLocaleString(), 20, y);
            y += 10;
        }
        doc.save('annotation-report-' + pdfName + '.pdf');
        UI.showToast('PDF report exported', 'success');
    }

    // Wire toolbar
    document.querySelectorAll('[data-tool]').forEach(function(b) { b.onclick = function() { setTool(b.dataset.tool); }; });
    document.querySelectorAll('.color-btn').forEach(function(b) { b.onclick = function() { setColor(b.dataset.color); }; });

    var scrollEl = $('pdf-scroll-container');
    if (scrollEl) {
        scrollEl.addEventListener('mousedown', handleRectDown);
        scrollEl.addEventListener('mousemove', handleRectMove);
        scrollEl.addEventListener('mouseup', handleRectUp);
    }

    var undoBtn = $('undo-btn'); if (undoBtn) undoBtn.onclick = undo;
    var clearBtn = $('clear-page'); if (clearBtn) clearBtn.onclick = clearPage;

    var syncBtn = $('sync-btn');
    if (syncBtn) {
        syncBtn.onclick = async function() {
            var r = await syncToGitHub();
            UI.showToast('Synced: ' + r.synced + ' new, ' + r.updated + ' updated', 'success');
        };
    }

    var exportBtn = $('export-btn');
    if (exportBtn) {
        exportBtn.onclick = function() {
            var modal = document.getElementById('export-modal');
            if (modal) modal.showModal();
        };
    }

    var exportCsvBtn = $('export-csv');
    if (exportCsvBtn) {
        exportCsvBtn.onclick = function() {
            exportCSV();
            var modal = document.getElementById('export-modal');
            if (modal) modal.close();
        };
    }

    var exportPdfBtn = $('export-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.onclick = function() {
            exportPDFReport();
            var modal = document.getElementById('export-modal');
            if (modal) modal.close();
        };
    }

    var exportCancelBtn = $('export-cancel');
    if (exportCancelBtn) {
        exportCancelBtn.onclick = function() {
            var modal = document.getElementById('export-modal');
            if (modal) modal.close();
        };
    }

    // Comment modal
    window.showCommentModal = function(context, callback) {
        var modal = document.getElementById('comment-modal');
        var title = document.getElementById('modal-title');
        var ctx = document.getElementById('modal-context');
        var txt = document.getElementById('modal-comment');
        var saveBtn = document.getElementById('modal-save');
        var cancelBtn = document.getElementById('modal-cancel');
        if (!modal || !ctx || !txt || !saveBtn || !cancelBtn) {
            if (callback) callback('');
            return;
        }
        if (title) title.textContent = 'Add Comment';
        ctx.textContent = context;
        txt.value = '';
        modal.showModal();
        setTimeout(function() { txt.focus(); }, 100);

        function onSave() {
            var c = txt.value.trim();
            modal.close();
            saveBtn.removeEventListener('click', onSave);
            cancelBtn.removeEventListener('click', onCancel);
            if (callback) callback(c || '');
        }
        function onCancel() {
            modal.close();
            saveBtn.removeEventListener('click', onSave);
            cancelBtn.removeEventListener('click', onCancel);
            if (callback) callback('');
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
                for (var i = 0; i < issues.length; i++) {
                    var issue = issues[i];
                    var match = issue.body.match(/```json\n([\s\S]*?)\n```/);
                    if (!match) continue;
                    try {
                        var data = JSON.parse(match[1]);
                        data.issueNumber = issue.number;
                        data.issueUrl = issue.html_url;
                        data.issueState = issue.state;
                        if (!data.status) data.status = issue.state === 'closed' ? 'resolved' : 'open';
                        data.replies = data.replies || [];
                        githubAnns.push(data);
                    } catch (e) {}
                }
                for (var j = 0; j < githubAnns.length; j++) {
                    if (githubAnns[j].issueNumber) {
                        try {
                            var comments = await API.getIssueComments(githubAnns[j].issueNumber);
                            githubAnns[j].replies = [];
                            for (var k = 0; k < comments.length; k++) {
                                githubAnns[j].replies.push({
                                    reviewer: comments[k].user.login,
                                    text: comments[k].body,
                                    timestamp: comments[k].created_at
                                });
                            }
                        } catch (e) {}
                    }
                }
                var localAnns = annotations[pdfName] || [];
                var merged = [];
                var seen = {};
                for (var m = 0; m < githubAnns.length; m++) {
                    merged.push(githubAnns[m]);
                    if (githubAnns[m].issueNumber) seen[githubAnns[m].issueNumber] = true;
                }
                for (var n = 0; n < localAnns.length; n++) {
                    if (!localAnns[n].issueNumber || !seen[localAnns[n].issueNumber]) {
                        var dup = false;
                        for (var p = 0; p < merged.length; p++) {
                            if (merged[p].timestamp === localAnns[n].timestamp && merged[p].page === localAnns[n].page && merged[p].type === localAnns[n].type) {
                                dup = true; break;
                            }
                        }
                        if (!dup) merged.push(localAnns[n]);
                    }
                }
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
        updateAnnotationStatus: updateAnnotationStatus,
        addReply: addReply,
        navigateAnnotations: navigateAnnotations,
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
