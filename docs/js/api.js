var API = (function() {
    async function githubAPI(path, opts) {
        opts = opts || {};
        var headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (opts.body) { headers['Content-Type'] = 'application/json'; }
        var resp = await fetch(PROXY + path, {
            headers: headers,
            method: opts.method || 'GET',
            body: opts.body || undefined
        });
        if (!resp.ok) {
            var err = {};
            try { err = await resp.json(); } catch (e) {}
            throw new Error(err.message || 'GitHub API ' + resp.status);
        }
        return resp.json();
    }

    function getIssueLabel(pdfName) {
        var safe = pdfName.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50);
        return ISSUE_LABEL_PREFIX + ':' + safe;
    }

    return {
        fetchContents: function(path) {
            return githubAPI('/contents/' + path);
        },

        fetchPDF: async function(contentsPath) {
            var resp = await fetch(PROXY + '/raw/master/' + contentsPath);
            if (!resp.ok) { throw new Error('HTTP ' + resp.status); }
            return resp.arrayBuffer();
        },

        fetchIssuesForPDF: async function(pdfName) {
            var label = getIssueLabel(pdfName);
            var allIssues = [];
            var page = 1;
            while (true) {
                var batch = await githubAPI('/issues?labels=' + encodeURIComponent(label) + '&state=all&per_page=100&page=' + page);
                if (!batch.length) { break; }
                allIssues = allIssues.concat(batch);
                page++;
            }
            return allIssues.filter(function(issue) {
                return issue.body && issue.body.indexOf('<!-- delmed-pdf-annotation -->') !== -1;
            });
        },

        createAnnotationIssue: async function(pdfName, annotationData) {
            var label = getIssueLabel(pdfName);
            var cp = (annotationData.comment || '');
            if (cp.length > 60) { cp = cp.substring(0, 60); }
            var title = '[' + pdfName + '] Page ' + annotationData.page + ': ' + annotationData.type;
            if (cp) { title = title + ' - ' + cp; }
            var body = '<!-- delmed-pdf-annotation -->\n';
            body = body + '| Field | Value |\n| --- | --- |\n';
            body = body + '| **PDF** | ' + pdfName + ' |\n';
            body = body + '| **Page** | ' + annotationData.page + ' |\n';
            body = body + '| **Type** | ' + annotationData.type + ' |\n';
            body = body + '| **Reviewer** | ' + (annotationData.reviewer || 'Unknown') + ' |\n';
            body = body + '| **Date** | ' + annotationData.timestamp + ' |\n';
            body = body + '| **Color** | ' + (annotationData.color || 'default') + ' |\n\n';
            body = body + '**Comment:** ' + (annotationData.comment || 'No comment') + '\n';
            if (annotationData.quotedText) {
                body = body + '\n**Quoted Text:**\n> ' + annotationData.quotedText + '\n';
            }
            body = body + '\n```json\n' + JSON.stringify(annotationData, null, 2) + '\n```\n';
            return githubAPI('/issues', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, labels: [label] })
            });
        },

        updateAnnotationIssue: async function(issueNumber, annotationData) {
            var body = '<!-- delmed-pdf-annotation -->\n';
            body = body + '| Field | Value |\n| --- | --- |\n';
            body = body + '| **PDF** | ' + (annotationData._pdfName || '') + ' |\n';
            body = body + '| **Page** | ' + annotationData.page + ' |\n';
            body = body + '| **Type** | ' + annotationData.type + ' |\n';
            body = body + '| **Reviewer** | ' + (annotationData.reviewer || 'Unknown') + ' |\n';
            body = body + '| **Date** | ' + annotationData.timestamp + ' |\n';
            body = body + '| **Color** | ' + (annotationData.color || 'default') + ' |\n\n';
            body = body + '**Comment:** ' + (annotationData.comment || 'No comment') + '\n';
            if (annotationData.quotedText) {
                body = body + '\n**Quoted Text:**\n> ' + annotationData.quotedText + '\n';
            }
            body = body + '\n```json\n' + JSON.stringify(annotationData, null, 2) + '\n```\n';
            return githubAPI('/issues/' + issueNumber, {
                method: 'PATCH',
                body: JSON.stringify({ body: body })
            });
        },

        closeAnnotationIssue: async function(issueNumber) {
            return githubAPI('/issues/' + issueNumber, {
                method: 'PATCH',
                body: JSON.stringify({ state: 'closed' })
            });
        }
    };
})();
