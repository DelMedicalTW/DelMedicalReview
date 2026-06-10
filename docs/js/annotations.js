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
