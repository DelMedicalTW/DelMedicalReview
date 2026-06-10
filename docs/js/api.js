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
        var safe = pdfName.replace(/[^a-zA-Z0-9_-]/g, '-');
        safe = safe.replace(/-+/g, '-');
        safe = safe.replace(/^-+|-+$/g, '');
        if (safe.length > 50) { safe = safe.substring(0, 50); }
        if (!safe) { safe = 'pdf-review'; }
        return ISSUE_LABEL_PREFIX + ':' + safe;
    }

    // Search for issues by searching the body for our marker + PDF name
    async function searchIssuesForPDF(pdfName) {
        var allIssues = [];
        var page = 1;
        // Use GitHub search API to find issues with our marker
        var query = 'repo:' + OWNER + '/' + REPO + ' "<!-- delmed-pdf-annotation -->" in:body type:issue state:all';
        while (true) {
            var searchUrl = '/search/issues?q=' + encodeURIComponent(query) + '&per_page=100&page=' + page;
            try {
                var result = await githubAPI(searchUrl);
                if (!result.items || !result.items.length) break;
                // Filter by PDF name in the body
                var matching = result.items.filter(function(issue) {
                    return issue.body && issue.body.indexOf(pdfName) !== -1;
                });
                allIssues = allIssues.concat(matching);
                if (result.items.length < 100) break;
                page++;
            } catch (e) {
                // Search API might not be available, fall back to empty
                console.warn('Search API failed:', e.message);
                break;
            }
        }
        return allIssues;
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
            // Try search API first, fall back to label-based lookup
            var issues = await searchIssuesForPDF(pdfName);
            if (issues.length > 0) return issues;

            // Fallback: try label-based lookup
            var label = getIssueLabel(pdfName);
            var allIssues = [];
            var page = 1;
            while (true) {
                try {
                    var batch = await githubAPI('/issues?labels=' + encodeURIComponent(label) + '&state=all&per_page=100&page=' + page);
                    if (!batch.length) break;
                    allIssues = allIssues.concat(batch);
                    page++;
                } catch (e) {
                    // Label might not exist, which is fine
                    break;
                }
            }
            return allIssues.filter(function(issue) {
                return issue.body && issue.body.indexOf('<!-- delmed-pdf-annotation -->') !== -1;
            });
        },

        createAnnotationIssue: async function(pdfName, annotationData) {
            var cp = (annotationData.comment || '');
            if (cp.length > 50) { cp = cp.substring(0, 50); }
            var shortName = pdfName;
            if (shortName.length > 40) { shortName = shortName.substring(0, 37) + '...'; }
            var title = 'Page ' + annotationData.page + ': ' + annotationData.type;
            if (cp) { title = title + ' - ' + cp; }
            title = title.substring(0, 255);

            var body = '<!-- delmed-pdf-annotation -->\n';
            body = body + '| Field | Value |\n| --- | --- |\n';
            body = body + '| **PDF** | ' + shortName + ' |\n';
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

            // Try creating with label first, fall back to no label
            var label = getIssueLabel(pdfName);
            try {
                return await githubAPI('/issues', {
                    method: 'POST',
                    body: JSON.stringify({ title: title, body: body, labels: [label] })
                });
            } catch (e) {
                // If label doesn't exist, create without it
                return await githubAPI('/issues', {
                    method: 'POST',
                    body: JSON.stringify({ title: title, body: body })
                });
            }
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
