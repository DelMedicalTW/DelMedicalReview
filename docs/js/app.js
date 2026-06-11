// ============================================================
// Del Medical PDF Review Portal — Complete Application
// ============================================================

var PROXY = 'https://pdf-review-proxy.mmuqeem.workers.dev';
var STORAGE_KEY = 'delmed-annotations-v4';
var OWNER = 'DelMedicalTW';
var REPO = 'DelMedicalRelease';
var PDF_SCALE = 1.5;

// ============================================================
// GLOBAL STATE
// ============================================================
var currentPath = '';
var currentPDFName = '';
var annotations = {};
var fabricCanvases = {};
var pageContainers = {};
var currentTool = 'select';
var currentColor = 'rgba(255,213,79,0.45)';
var isLoadingPDF = false;
var drawDebounceTimer = null;
var currentDrawingPage = null;

function $(id) { return document.getElementById(id); }
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ============================================================
// TOAST
// ============================================================
function toast(msg, type) {
    var t = $('toast'), a = $('toast-alert'), m = $('toast-message');
    if (!t || !a || !m) return;
    m.textContent = msg;
    a.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(function() { t.classList.add('hidden'); }, 3000);
}

// ============================================================
// API
// ============================================================
var API = {
    _fetch: async function(path, opts) {
        opts = opts || {};
        var headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (opts.body) headers['Content-Type'] = 'application/json';
        var resp = await fetch(PROXY + path, { headers: headers, method: opts.method || 'GET', body: opts.body || undefined });
        if (!resp.ok) { var err = {}; try { err = await resp.json(); } catch(e) {} throw new Error(err.message || 'API ' + resp.status); }
        return resp.json();
    },
    fetchContents: function(path) { return this._fetch('/contents/' + path); },
    fetchPDF: async function(path) {
        var r = await fetch(PROXY + '/raw/master/' + path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
    },
    fetchIssuesForPDF: async function(pdfName) {
        var all = [], page = 1;
        while (page <= 10) {
            var batch = await this._fetch('/issues?state=all&per_page=100&page=' + page + '&sort=updated&direction=desc');
            if (!batch || !batch.length) break;
            for (var i = 0; i < batch.length; i = i + 1) {
                if (batch[i].body && batch[i].body.indexOf('<!-- delmed-pdf-annotation -->') !== -1 && batch[i].body.indexOf(pdfName) !== -1) {
                    all.push(batch[i]);
                }
            }
            if (batch.length < 100) break;
            page = page + 1;
        }
        return all;
    },
    createIssue: async function(pdfName, data) {
        var title = 'Page ' + data.page + ': ' + data.type;
        if (data.comment) { var cp = data.comment.substring(0, 50); title = title + ' - ' + cp; }
        var body = '<!-- delmed-pdf-annotation -->\n**PDF:** ' + pdfName + '\n**Page:** ' + data.page + '\n**Type:** ' + data.type + '\n**Status:** ' + (data.status||'open') + '\n**Reviewer:** ' + (data.reviewer||'') + '\n\n**Comment:** ' + (data.comment||'') + '\n\n```json\n' + JSON.stringify(data) + '\n```';
        return this._fetch('/issues', { method: 'POST', body: JSON.stringify({ title: title, body: body }) });
    },
    updateIssue: async function(num, data) {
        var body = '<!-- delmed-pdf-annotation -->\n**PDF:** ' + (data._pdfName||'') + '\n**Page:** ' + data.page + '\n**Type:** ' + data.type + '\n**Status:** ' + (data.status||'open') + '\n**Reviewer:** ' + (data.reviewer||'') + '\n\n**Comment:** ' + (data.comment||'') + '\n\n```json\n' + JSON.stringify(data) + '\n```';
        return this._fetch('/issues/' + num, { method: 'PATCH', body: JSON.stringify({ body: body }) });
    },
    closeIssue: async function(num) { return this._fetch('/issues/' + num, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) }); },
    addComment: async function(num, body) { return this._fetch('/issues/' + num + '/comments', { method: 'POST', body: JSON.stringify({ body: body }) }); },
    getComments: async function(num) { return this._fetch('/issues/' + num + '/comments'); }
};

// ============================================================
// ANNOTATION STATE
// ============================================================
function getAnnotations() { return annotations[currentPDFName] || []; }
function setAnnotations(a) { annotations[currentPDFName] = a; }
function saveLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations)); } catch(e) {} }
function loadLocal() { try { annotations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { annotations = {}; } }
function getReviewer() { var r = $('reviewer-name'); return (r && r.value.trim()) || 'Anonymous'; }

function addAnnotation(ann) {
    var anns = getAnnotations();
    ann.id = 'ann-' + Date.now();
    ann.reviewer = getReviewer();
    ann.timestamp = new Date().toISOString();
    ann.status = 'open';
    ann.replies = [];
    anns.push(ann);
    setAnnotations(anns);
    saveLocal();
    renderSidebar();
    // Sync to GitHub
    API.createIssue(currentPDFName, ann).then(function(issue) {
        ann.issueNumber = issue.number; ann.issueUrl = issue.html_url;
        setAnnotations(anns); saveLocal(); renderSidebar();
    }).catch(function() {});
}

function deleteAnnotation(index) {
    var anns = getAnnotations(), ann = anns[index];
    if (!ann) return;
    if (ann.issueNumber) API.closeIssue(ann.issueNumber).catch(function() {});
    if (ann.page && fabricCanvases[ann.page]) { fabricCanvases[ann.page].clear(); fabricCanvases[ann.page].renderAll(); }
    anns.splice(index, 1); setAnnotations(anns); saveLocal(); renderSidebar();
}

function updateStatus(index, status) {
    var anns = getAnnotations();
    if (index < 0 || index >= anns.length) return;
    anns[index].status = status;
    if (anns[index].issueNumber) API.updateIssue(anns[index].issueNumber, anns[index]).catch(function() {});
    setAnnotations(anns); saveLocal(); renderSidebar();
}

// ============================================================
// TOOLS
// ============================================================
function setTool(tool) {
    currentTool = tool;
    var btns = document.querySelectorAll('[data-tool]');
    for (var i = 0; i < btns.length; i = i + 1) btns[i].classList.remove('tool-active');
    var b = document.querySelector('[data-tool="' + tool + '"]');
    if (b) b.classList.add('tool-active');
    
    var keys = Object.keys(fabricCanvases);
    for (var j = 0; j < keys.length; j = j + 1) {
        var fc = fabricCanvases[keys[j]];
        if (!fc || !fc.lowerCanvasEl) continue;
        var el = fc.lowerCanvasEl;
        if (tool === 'select' || tool === 'highlight') {
            el.style.pointerEvents = 'none'; el.classList.remove('annotation-layer-active');
            fc.isDrawingMode = false; fc.selection = false;
        } else if (tool === 'draw') {
            el.style.pointerEvents = 'auto'; el.classList.add('annotation-layer-active');
            fc.isDrawingMode = true; fc.selection = false;
            fc.freeDrawingBrush.color = currentColor.replace(/[\d.]+\)$/, '1)'); fc.freeDrawingBrush.width = 3;
        } else {
            el.style.pointerEvents = 'auto'; el.classList.add('annotation-layer-active');
            fc.isDrawingMode = false; fc.selection = false;
        }
        fc.renderAll();
    }
}

function setColor(color) {
    currentColor = color;
    var btns = document.querySelectorAll('.color-btn');
    for (var i = 0; i < btns.length; i = i + 1) btns[i].classList.remove('selected');
    var b = document.querySelector('[data-color="' + color + '"]');
    if (b) b.classList.add('selected');
}

// ============================================================
// FABRIC CANVAS
// ============================================================
function createFabricCanvas(pageNum, el) {
    var fc = new fabric.Canvas(el, { selection: false, isDrawingMode: false, renderOnAddRemove: true });
    fc.lowerCanvasEl.style.pointerEvents = 'none';
    fc.on('path:created', function() {
        currentDrawingPage = pageNum;
        clearTimeout(drawDebounceTimer);
        drawDebounceTimer = setTimeout(function() {
            saveDrawings(currentDrawingPage);
            showCommentModal('Save drawing on page ' + currentDrawingPage + '?', function(comment) {
                var anns = getAnnotations();
                var found = null;
                for (var k = 0; k < anns.length; k = k + 1) {
                    if (anns[k].type === 'drawing' && anns[k].page === currentDrawingPage && anns[k]._pending) {
                        found = anns[k]; break;
                    }
                }
                if (found) { found.comment = comment || ''; delete found._pending; }
                setAnnotations(anns); saveLocal(); renderSidebar();
                toast('Drawing saved', 'success');
            });
        }, 800);
    });
    fabricCanvases[pageNum] = fc;
    return fc;
}

function saveDrawings(pageNum) {
    var fc = fabricCanvases[pageNum];
    if (!fc) return;
    var objects = fc.getObjects();
    var arr = [];
    for (var i = 0; i < objects.length; i = i + 1) arr.push(objects[i].toJSON());
    var anns = getAnnotations();
    var filtered = [];
    for (var j = 0; j < anns.length; j = j + 1) {
        if (!((anns[j].type === 'drawing' || anns[j].type === 'rectangle') && anns[j].page === pageNum)) {
            filtered.push(anns[j]);
        }
    }
    if (arr.length > 0) {
        filtered.push({ type: 'drawing', page: pageNum, objects: arr, color: currentColor, reviewer: getReviewer(), timestamp: new Date().toISOString(), _pending: true });
    }
    setAnnotations(filtered); saveLocal();
}

// ============================================================
// HIGHLIGHT
// ============================================================
function handleHighlight(e) {
    if (currentTool !== 'highlight') return;
    var pw = e.currentTarget.closest('.page-wrapper');
    if (!pw) return;
    var pageNum = parseInt(pw.getAttribute('data-page'));
    if (isNaN(pageNum)) return;
    var sel = window.getSelection(), text = sel.toString().trim();
    if (!text) return;
    var fc = fabricCanvases[pageNum];
    if (!fc) return;
    var range = sel.getRangeAt(0), rects = range.getClientRects();
    var cr = pw.getBoundingClientRect();
    for (var i = 0; i < rects.length; i = i + 1) {
        var r = rects[i];
        fc.add(new fabric.Rect({ left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height, fill: currentColor, selectable: false, evented: false, opacity: 0.5 }));
    }
    fc.renderAll();
    var preview = text.length > 80 ? text.substring(0,80) + '...' : text;
    showCommentModal('Highlight on page ' + pageNum + ': "' + preview + '"', function(comment) {
        addAnnotation({ type: 'highlight', page: pageNum, comment: comment || text.substring(0,100), quotedText: text, color: currentColor });
    });
}

// ============================================================
// STICKY NOTE
// ============================================================
function handleSticky(e) {
    if (currentTool !== 'comment') return;
    var pw = e.currentTarget.closest('.page-wrapper');
    if (!pw) return;
    var pageNum = parseInt(pw.getAttribute('data-page'));
    if (isNaN(pageNum)) return;
    var cr = pw.getBoundingClientRect(), x = e.clientX - cr.left, y = e.clientY - cr.top;
    showCommentModal('Note on page ' + pageNum, function(comment) {
        if (!comment) return;
        var fc = fabricCanvases[pageNum]; if (!fc) return;
        var rect = new fabric.Rect({ left: x-20, top: y-20, width: 40, height: 40, fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4, selectable: false, evented: false });
        fc.add(rect); fc.renderAll();
        addAnnotation({ type: 'comment', page: pageNum, comment: comment, x: Math.round(x), y: Math.round(y) });
    });
}

// ============================================================
// RECTANGLE
// ============================================================
var isDrawingRect = false, rectStart = null, tempRect = null;

function rectDown(e) {
    if (currentTool !== 'rectangle') return;
    var pw = e.target.closest('.page-wrapper'); if (!pw) return;
    var pageNum = parseInt(pw.getAttribute('data-page')); if (isNaN(pageNum)) return;
    var fc = fabricCanvases[pageNum]; if (!fc) return;
    var ptr = fc.getPointer(e);
    isDrawingRect = true; rectStart = { x: ptr.x, y: ptr.y };
    tempRect = new fabric.Rect({ left: ptr.x, top: ptr.y, width: 0, height: 0, fill: 'transparent', stroke: currentColor.replace(/[\d.]+\)$/, '1)'), strokeWidth: 2, strokeDashArray: [5,5], selectable: false, evented: false });
    fc.add(tempRect);
}
function rectMove(e) {
    if (!isDrawingRect || !tempRect) return;
    var pw = e.target.closest('.page-wrapper'); if (!pw) return;
    var fc = fabricCanvases[parseInt(pw.getAttribute('data-page'))]; if (!fc) return;
    var ptr = fc.getPointer(e);
    tempRect.set({ left: Math.min(ptr.x, rectStart.x), top: Math.min(ptr.y, rectStart.y), width: Math.abs(ptr.x-rectStart.x), height: Math.abs(ptr.y-rectStart.y) });
    fc.renderAll();
}
function rectUp(e) {
    if (!isDrawingRect || currentTool !== 'rectangle') { isDrawingRect = false; return; }
    isDrawingRect = false;
    if (tempRect && tempRect.width > 5 && tempRect.height > 5) {
        tempRect.set({ strokeDashArray: null, fill: currentColor.replace(/[\d.]+\)$/, '0.3)' });
        var pw = e.target.closest('.page-wrapper');
        if (pw) {
            var pageNum = parseInt(pw.getAttribute('data-page'));
            if (!isNaN(pageNum)) {
                showCommentModal('Save rectangle on page ' + pageNum + '?', function(comment) {
                    saveDrawings(pageNum);
                    var anns = getAnnotations();
                    for (var j = 0; j < anns.length; j = j + 1) {
                        if (anns[j].type === 'drawing' && anns[j].page === pageNum && anns[j]._pending) {
                            anns[j].comment = comment || ''; delete anns[j]._pending; break;
                        }
                    }
                    setAnnotations(anns); saveLocal(); renderSidebar();
                    toast('Rectangle saved', 'success');
                });
            }
        }
    } else if (tempRect) { try { tempRect.canvas.remove(tempRect); } catch(er) {} }
    tempRect = null; rectStart = null;
}

// ============================================================
// UNDO / CLEAR
// ============================================================
function undo() {
    var best = getMostVisiblePage(); if (!best) return;
    var fc = fabricCanvases[best]; if (!fc) return;
    var objs = fc.getObjects(); if (!objs.length) return;
    fc.remove(objs[objs.length-1]); fc.renderAll(); saveDrawings(best);
}
function clearPage() {
    var best = getMostVisiblePage(); if (!best) return;
    var fc = fabricCanvases[best]; if (!fc) return;
    fc.clear(); fc.renderAll();
    var anns = [];
    var all = getAnnotations();
    for (var i = 0; i < all.length; i = i + 1) { if (all[i].page !== best) anns.push(all[i]); }
    setAnnotations(anns); saveLocal(); renderSidebar();
}
function getMostVisiblePage() {
    var cr = $('pdf-scroll-container').getBoundingClientRect(), best = null, bestO = 0;
    var keys = Object.keys(pageContainers);
    for (var i = 0; i < keys.length; i = i + 1) {
        var r = pageContainers[keys[i]].getBoundingClientRect();
        var o = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
        if (o > bestO) { bestO = o; best = parseInt(keys[i]); }
    }
    return best;
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebar() {
    var list = $('annotation-list'), count = $('annotation-count');
    if (!list || !count) return;
    var all = getAnnotations();
    var typeF = $('filter-type').value, statusF = $('filter-status').value, sortF = $('filter-sort').value;
    var filtered = [];
    for (var i = 0; i < all.length; i = i + 1) {
        var a = all[i];
        if (typeF !== 'all' && a.type !== typeF) continue;
        if (statusF !== 'all' && (a.status||'open') !== statusF) continue;
        filtered.push(a);
    }
    if (sortF === 'page-asc') filtered.sort(function(a,b) { return a.page - b.page; });
    else if (sortF === 'page-desc') filtered.sort(function(a,b) { return b.page - a.page; });
    else filtered.sort(function(a,b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    if (!filtered.length) { list.innerHTML = '<div class="text-center py-8 text-base-content/40 text-sm">No annotations</div>'; count.textContent = '0'; return; }
    count.textContent = filtered.length;

    var labels = { highlight: '🖍', drawing: '✏️', rectangle: '⬜', comment: '📝' };
    var statusCls = { 'open': 'badge-error', 'in-review': 'badge-warning', 'resolved': 'badge-success' };
    var html = '';
    for (var j = 0; j < filtered.length; j = j + 1) {
        var ann = filtered[j], sc = statusCls[ann.status||'open'] || 'badge-ghost';
        var body = '';
        if (ann.comment) body = body + '<p class="text-sm">' + esc(ann.comment) + '</p>';
        var ghLink = ann.issueNumber ? '<a href="' + ann.issueUrl + '" target="_blank" class="text-xs text-info ml-auto">#' + ann.issueNumber + '</a>' : '<span class="text-xs text-warning ml-auto">local</span>';
        html = html + '<div class="card card-compact bg-base-100 border border-base-300 cursor-pointer hover:border-primary" onclick="scrollToPage(' + ann.page + ')"><div class="card-body p-2">';
        html = html + '<div class="flex items-center gap-1 text-xs flex-wrap"><span class="badge badge-xs">' + (labels[ann.type]||'?') + '</span><span class="badge badge-xs ' + sc + '">' + (ann.status||'open') + '</span><span>Pg ' + ann.page + '</span>' + ghLink;
        html = html + '<button class="btn btn-ghost btn-xs p-0 h-5 w-5 ml-auto" onclick="event.stopPropagation();deleteAnnotation(' + j + ')"><i data-lucide="x" class="w-3 h-3"></i></button>';
        html = html + '<div class="dropdown dropdown-end" onclick="event.stopPropagation()"><button class="btn btn-ghost btn-xs p-0 h-5 w-5">⋯</button><ul class="dropdown-content menu p-1 bg-base-200 rounded-box w-32 z-30 text-xs"><li><a href="#" onclick="updateStatus(' + j + ',\'in-review\')">In Review</a></li><li><a href="#" onclick="updateStatus(' + j + ',\'resolved\')">Resolved</a></li><li><a href="#" onclick="updateStatus(' + j + ',\'open\')">Reopen</a></li></ul></div>';
        html = html + '</div>' + body + '</div></div>';
    }
    list.innerHTML = html;
    lucide.createIcons();
}

function scrollToPage(pageNum) {
    var c = pageContainers[pageNum];
    if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

// ============================================================
// COMMENT MODAL
// ============================================================
function showCommentModal(context, callback) {
    var modal = $('comment-modal'), ctx = $('modal-context'), txt = $('modal-comment');
    var saveBtn = $('modal-save'), cancelBtn = $('modal-cancel');
    if (!modal || !ctx || !txt) { if (callback) callback(''); return; }
    ctx.textContent = context; txt.value = '';
    modal.showModal(); setTimeout(function() { txt.focus(); }, 100);
    function onSave() { var c = txt.value.trim(); modal.close(); saveBtn.removeEventListener('click', onSave); cancelBtn.removeEventListener('click', onCancel); if (callback) callback(c || ''); }
    function onCancel() { modal.close(); saveBtn.removeEventListener('click', onSave); cancelBtn.removeEventListener('click', onCancel); if (callback) callback(''); }
    saveBtn.addEventListener('click', onSave); cancelBtn.addEventListener('click', onCancel);
}

// ============================================================
// PDF LOADING (lazy, progressive)
// ============================================================
async function loadPDF(contentsPath, name) {
    if (isLoadingPDF) return;
    isLoadingPDF = true;
    
    // Cleanup
    var keys = Object.keys(fabricCanvases);
    for (var i = 0; i < keys.length; i = i + 1) { try { fabricCanvases[keys[i]].dispose(); } catch(e) {} }
    fabricCanvases = {}; pageContainers = {};
    
    currentPDFName = name;
    $('current-pdf-name').textContent = name;
    $('no-pdf-message').style.display = 'none';
    $('annotation-toolbar').style.display = 'flex';
    var scroll = $('pdf-scroll-container');
    scroll.innerHTML = '<div class="text-center py-10 text-white/50"><span class="loading loading-spinner"></span> Loading PDF...</div>';
    
    // Highlight file
    var rows = $('file-list').querySelectorAll('.file-row');
    for (var r = 0; r < rows.length; r = r + 1) rows[r].classList.remove('active-file');
    var active = $('file-list').querySelector('[data-name="' + name + '"]');
    if (active) active.classList.add('active-file');

    // Load annotations first (instant)
    loadLocal();
    renderSidebar();
    
    // Load from GitHub in background
    $('sync-badge').className = 'badge badge-sm badge-info gap-1'; $('sync-label').textContent = 'Loading...';
    API.fetchIssuesForPDF(name).then(function(issues) {
        var githubAnns = [];
        for (var i = 0; i < issues.length; i = i + 1) {
            var match = issues[i].body.match(/```json\n([\s\S]*?)\n```/);
            if (!match) continue;
            try {
                var data = JSON.parse(match[1]);
                data.issueNumber = issues[i].number; data.issueUrl = issues[i].html_url;
                data.status = issues[i].state === 'closed' ? 'resolved' : (data.status || 'open');
                githubAnns.push(data);
            } catch(e) {}
        }
        var localAnns = annotations[name] || [];
        var merged = [], seen = {};
        for (var j = 0; j < githubAnns.length; j = j + 1) { merged.push(githubAnns[j]); seen[githubAnns[j].issueNumber] = true; }
        for (var k = 0; k < localAnns.length; k = k + 1) {
            if (!localAnns[k].issueNumber || !seen[localAnns[k].issueNumber]) merged.push(localAnns[k]);
        }
        annotations[name] = merged; saveLocal(); renderSidebar();
        $('sync-badge').className = 'badge badge-sm badge-ghost gap-1'; $('sync-label').textContent = 'GitHub';
    }).catch(function() {
        $('sync-badge').className = 'badge badge-sm badge-ghost gap-1'; $('sync-label').textContent = 'GitHub';
    });

    // Load PDF
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        var data = await API.fetchPDF(contentsPath);
        var pdfDoc = await pdfjsLib.getDocument({ data: data }).promise;
        scroll.innerHTML = '';
        
        // Render first 5 pages immediately
        var firstBatch = Math.min(5, pdfDoc.numPages);
        for (var p = 1; p <= firstBatch; p = p + 1) {
            await renderPage(p, pdfDoc, scroll);
        }
        // Render remaining pages in background
        if (pdfDoc.numPages > 5) {
            renderRemainingPages(6, pdfDoc, scroll);
        }
        
        restoreAnnotations();
        setTool('select');
        toast('Loaded ' + pdfDoc.numPages + ' pages', 'success');
    } catch(err) {
        scroll.innerHTML = '<div class="text-center py-10 text-error">' + esc(err.message) + '</div>';
    } finally {
        isLoadingPDF = false;
    }
}

async function renderPage(pageNum, pdfDoc, scroll) {
    var page = await pdfDoc.getPage(pageNum);
    var vp = page.getViewport({ scale: PDF_SCALE });
    var wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width = vp.width + 'px';
    wrapper.style.height = vp.height + 'px';
    wrapper.setAttribute('data-page', String(pageNum));
    pageContainers[pageNum] = wrapper;

    var pdfCanvas = document.createElement('canvas');
    pdfCanvas.width = vp.width; pdfCanvas.height = vp.height;
    await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: vp }).promise;
    wrapper.appendChild(pdfCanvas);

    var textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = vp.width + 'px'; textLayer.style.height = vp.height + 'px';
    var textContent = await page.getTextContent();
    for (var i = 0; i < textContent.items.length; i = i + 1) {
        var item = textContent.items[i];
        if (!item.str) continue;
        var tx = pdfjsLib.Util.transform(vp.transform, item.transform);
        var fh = Math.sqrt(tx[2]*tx[2] + tx[3]*tx[3]);
        var span = document.createElement('span');
        span.textContent = item.str;
        span.style.left = tx[4] + 'px'; span.style.top = (tx[5]-fh) + 'px';
        span.style.fontSize = fh + 'px';
        textLayer.appendChild(span);
    }
    wrapper.appendChild(textLayer);

    var annCanvas = document.createElement('canvas');
    annCanvas.className = 'ann-canvas';
    annCanvas.width = vp.width; annCanvas.height = vp.height;
    wrapper.appendChild(annCanvas);
    createFabricCanvas(pageNum, annCanvas);

    wrapper.addEventListener('mouseup', handleHighlight);
    wrapper.addEventListener('dblclick', handleSticky);

    var label = document.createElement('div');
    label.className = 'page-label'; label.textContent = 'Page ' + pageNum;
    wrapper.appendChild(label);
    scroll.appendChild(wrapper);
}

async function renderRemainingPages(start, pdfDoc, scroll) {
    for (var p = start; p <= pdfDoc.numPages; p = p + 1) {
        await renderPage(p, pdfDoc, scroll);
        // Yield to UI every 5 pages
        if (p % 5 === 0) await new Promise(function(r) { setTimeout(r, 0); });
    }
}

function restoreAnnotations() {
    var anns = getAnnotations();
    for (var i = 0; i < anns.length; i = i + 1) {
        var ann = anns[i];
        if ((ann.type === 'drawing' || ann.type === 'rectangle') && ann.objects && fabricCanvases[ann.page]) {
            fabric.util.enlivenObjects(ann.objects, function(objects) {
                for (var j = 0; j < objects.length; j = j + 1) { objects[j].set({ selectable: false, evented: false }); fabricCanvases[ann.page].add(objects[j]); }
                fabricCanvases[ann.page].renderAll();
            });
        }
        if (ann.type === 'comment' && ann.x && ann.y && fabricCanvases[ann.page]) {
            var rect = new fabric.Rect({ left: ann.x-20, top: ann.y-20, width: 40, height: 40, fill: '#fef08a', stroke: '#ca8a04', strokeWidth: 2, rx: 4, ry: 4, selectable: false, evented: false });
            fabricCanvases[ann.page].add(rect); fabricCanvases[ann.page].renderAll();
        }
    }
}

// ============================================================
// FILE BROWSER
// ============================================================
function isDraft(n) { return /Rev_\d+[A-Za-z]/i.test(n); }
function folderInfo(path) {
    var l = (path||'').toLowerCase();
    if (l.indexOf('staging')!==-1) return { l:'STAGING', c:'badge-warning', i:'package-open' };
    if (l.indexOf('draft')!==-1) return { l:'DRAFTS', c:'badge-error', i:'pencil' };
    if (l.indexOf('archive')!==-1) return { l:'ARCHIVE', c:'badge-ghost', i:'archive' };
    if (l.indexOf('service')!==-1) return { l:'SERVICE', c:'badge-info', i:'wrench' };
    if (l.indexOf('user')!==-1) return { l:'USER', c:'badge-success', i:'users' };
    return null;
}

async function loadDir(path) {
    var fl = $('file-list'); if (!fl) return;
    fl.innerHTML = '<div class="text-center py-8 text-base-content/50"><span class="loading loading-spinner loading-sm"></span></div>';
    currentPath = path;
    try {
        var contents = await API.fetchContents(path);
        if (!Array.isArray(contents)) { fl.innerHTML = '<div class="text-center py-8 text-sm">Not a directory</div>'; return; }
        var folders = [], pdfs = [];
        for (var i = 0; i < contents.length; i = i + 1) {
            if (contents[i].type === 'dir') folders.push(contents[i]);
            else if (contents[i].name.toLowerCase().endsWith('.pdf')) pdfs.push(contents[i]);
        }
        folders.sort(function(a,b) { return a.name.localeCompare(b.name); });
        pdfs.sort(function(a,b) { return a.name.localeCompare(b.name); });

        var fi = folderInfo(path), h = '';
        if (fi) h = h + '<div class="px-3 py-2 bg-base-300/50 border-b border-base-300"><span class="badge ' + fi.c + ' badge-lg">' + fi.l + '</span></div>';
        for (var f = 0; f < folders.length; f = f + 1) {
            var ffi = folderInfo(folders[f].path);
            var fb = ffi ? '<span class="badge ' + ffi.c + ' badge-lg ml-auto">' + ffi.l + '</span>' : '';
            h = h + '<div class="file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm select-none" data-path="' + esc(folders[f].path) + '"><i data-lucide="folder" class="w-4 h-4 text-warning"></i><span class="truncate">' + esc(folders[f].name) + '</span>' + fb + '</div>';
        }
        for (var p = 0; p < pdfs.length; p = p + 1) {
            var draft = isDraft(pdfs[p].name), pfi = folderInfo(currentPath);
            var badge = draft ? '<span class="badge badge-error badge-lg ml-auto">DRAFT</span>' : (pfi ? '<span class="badge ' + pfi.c + ' badge-lg ml-auto">' + pfi.l + '</span>' : '');
            var active = currentPDFName === pdfs[p].name ? ' active-file' : '';
            h = h + '<div class="file-row flex items-center gap-2 px-3 py-2 cursor-pointer text-sm select-none' + active + '" data-path="' + esc(pdfs[p].path) + '" data-name="' + esc(pdfs[p].name) + '"><i data-lucide="file-text" class="w-4 h-4 text-error"></i><span class="truncate">' + esc(pdfs[p].name) + '</span>' + badge + '</div>';
        }
        fl.innerHTML = h; lucide.createIcons();
        var dirs = fl.querySelectorAll('[data-path]:not([data-name])');
        for (var d = 0; d < dirs.length; d = d + 1) { dirs[d].onclick = function() { loadDir(this.dataset.path); }; }
        var files = fl.querySelectorAll('[data-name]');
        for (var fi2 = 0; fi2 < files.length; fi2 = fi2 + 1) { files[fi2].onclick = function() { loadPDF(this.dataset.path, this.dataset.name); }; }
        $('back-btn').disabled = !path;
    } catch(err) { fl.innerHTML = '<div class="text-center py-8 text-error">' + esc(err.message) + '</div>'; }
}

// ============================================================
// EXPORT
// ============================================================
function exportCSV() {
    var anns = getAnnotations(), csv = 'Page,Type,Reviewer,Status,Comment,Date\n';
    for (var i = 0; i < anns.length; i = i + 1) {
        var a = anns[i], c = (a.comment||'').replace(/"/g,'""');
        csv = csv + a.page + ',' + a.type + ',' + (a.reviewer||'') + ',' + (a.status||'open') + ',"' + c + '",' + a.timestamp + '\n';
    }
    var blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'annotations.csv'; link.click(); URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
}
function exportPDFReport() {
    var anns = getAnnotations(), doc = new jspdf.jsPDF();
    doc.setFontSize(16); doc.text('Annotation Report', 14, 20);
    doc.setFontSize(10); doc.text('Document: ' + (currentPDFName||'Unknown'), 14, 30);
    doc.text('Total: ' + anns.length, 14, 38);
    var y = 48;
    for (var i = 0; i < anns.length; i = i + 1) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(10); doc.text('Page ' + anns[i].page + ' - ' + anns[i].type + ' [' + (anns[i].status||'open') + ']', 14, y); y = y + 6;
        if (anns[i].comment) { doc.setFontSize(8); doc.text(anns[i].comment, 20, y); y = y + 6; }
        y = y + 4;
    }
    doc.save('annotation-report.pdf');
    toast('PDF exported', 'success');
}

// ============================================================
// SYNC
// ============================================================
async function syncToGitHub() {
    var anns = getAnnotations(), synced = 0, updated = 0;
    for (var i = 0; i < anns.length; i = i + 1) {
        try {
            if (anns[i].issueNumber) { await API.updateIssue(anns[i].issueNumber, anns[i]); updated = updated + 1; }
            else { var issue = await API.createIssue(currentPDFName, anns[i]); anns[i].issueNumber = issue.number; anns[i].issueUrl = issue.html_url; synced = synced + 1; }
        } catch(e) {}
    }
    setAnnotations(anns); saveLocal(); renderSidebar();
    toast('Synced: ' + synced + ' new, ' + updated + ' updated', 'success');
}

// ============================================================
// EVENT WIRING
// ============================================================
var toolBtns = document.querySelectorAll('[data-tool]');
for (var tb = 0; tb < toolBtns.length; tb = tb + 1) { toolBtns[tb].onclick = function() { setTool(this.dataset.tool); }; }
var colorBtns = document.querySelectorAll('.color-btn');
for (var cb = 0; cb < colorBtns.length; cb = cb + 1) { colorBtns[cb].onclick = function() { setColor(this.dataset.color); }; }

$('pdf-scroll-container').addEventListener('mousedown', rectDown);
$('pdf-scroll-container').addEventListener('mousemove', rectMove);
$('pdf-scroll-container').addEventListener('mouseup', rectUp);
$('undo-btn').onclick = undo;
$('clear-page').onclick = clearPage;
$('sync-btn').onclick = syncToGitHub;
$('refresh-btn').onclick = function() {
    if (currentPDFName) {
        $('sync-badge').className = 'badge badge-sm badge-info gap-1'; $('sync-label').textContent = 'Refreshing...';
        API.fetchIssuesForPDF(currentPDFName).then(function(issues) {
            var githubAnns = [];
            for (var i = 0; i < issues.length; i = i + 1) {
                var match = issues[i].body.match(/```json\n([\s\S]*?)\n```/);
                if (!match) continue;
                try {
                    var data = JSON.parse(match[1]);
                    data.issueNumber = issues[i].number; data.issueUrl = issues[i].html_url;
                    data.status = issues[i].state === 'closed' ? 'resolved' : (data.status || 'open');
                    githubAnns.push(data);
                } catch(e) {}
            }
            annotations[currentPDFName] = githubAnns; saveLocal(); renderSidebar();
            $('sync-badge').className = 'badge badge-sm badge-ghost gap-1'; $('sync-label').textContent = 'GitHub';
            toast('Refreshed from GitHub', 'success');
        }).catch(function() {
            $('sync-badge').className = 'badge badge-sm badge-ghost gap-1'; $('sync-label').textContent = 'GitHub';
        });
    }
};
$('export-btn').onclick = function() { $('export-modal').showModal(); };
$('export-csv').onclick = function() { exportCSV(); $('export-modal').close(); };
$('export-pdf').onclick = function() { exportPDFReport(); $('export-modal').close(); };
$('export-cancel').onclick = function() { $('export-modal').close(); };
$('back-btn').onclick = function() { if (currentPath) loadDir(currentPath.split('/').slice(0,-1).join('/') || ''); };
$('search-input').oninput = function(e) {
    var q = e.target.value.toLowerCase(), rows = $('file-list').querySelectorAll('.file-row');
    for (var i = 0; i < rows.length; i = i + 1) {
        var span = rows[i].querySelector('.truncate'), name = span ? span.textContent : '';
        rows[i].style.display = name.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    }
};
$('toggle-browser').onclick = function() { var p = $('browser-panel'); if (p) { p.classList.toggle('!w-0'); p.classList.toggle('!min-w-0'); } };
$('toggle-annotations').onclick = function() { var p = $('annotation-sidebar'); if (p) { p.classList.toggle('!w-0'); p.classList.toggle('!min-w-0'); } };
$('filter-type').onchange = renderSidebar;
$('filter-status').onchange = renderSidebar;
$('filter-sort').onchange = renderSidebar;
$('reviewer-name').value = localStorage.getItem('delmed-reviewer') || '';
$('reviewer-name').onchange = function() { localStorage.setItem('delmed-reviewer', this.value.trim()); };

// Theme
var savedTheme = localStorage.getItem('delmed-theme') || 'auto';
function applyTheme(t) {
    if (t === 'auto') document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    else document.documentElement.setAttribute('data-theme', t);
}
applyTheme(savedTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() { if (localStorage.getItem('delmed-theme') === 'auto') applyTheme('auto'); });
var themeLinks = document.querySelectorAll('[data-theme-switch]');
for (var tl = 0; tl < themeLinks.length; tl = tl + 1) {
    themeLinks[tl].onclick = function(e) { e.preventDefault(); var t = this.dataset.themeSwitch; localStorage.setItem('delmed-theme', t); applyTheme(t); };
}

// Keyboard
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') setTool('select');
    if (e.key === 'h') setTool('highlight');
    if (e.key === 'd') setTool('draw');
    if (e.key === 'r') setTool('rectangle');
    if (e.key === 'n') setTool('comment');
    if (e.key === 'j') { e.preventDefault(); /* navigate next */ }
    if (e.key === 'k') { e.preventDefault(); /* navigate prev */ }
});

// Expose to window for onclick handlers
window.deleteAnnotation = deleteAnnotation;
window.updateStatus = updateStatus;
window.scrollToPage = scrollToPage;

// Start
loadDir('').then(function() { toast('Connected', 'success'); }).catch(function(err) { toast(err.message, 'error'); });
