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
            // Fetch ALL issues with pagination, filter by our marker + PDF name
            var allIssues = [];
            var page = 1;
            while (page <= 10) { // Safety limit
                try {
                    var batch = await githubAPI('/issues?state=all&per_page=100&page=' + page + '&sort=updated&direction=desc');
                    if (!batch || !batch.length) break;
                    
                    var matching = batch.filter(function(issue) {
                        if (!issue.body) return false;
                        if (issue.body.indexOf('<!-- delmed-pdf-annotation -->') === -1) return false;
                        // Check if this issue is for our PDF
                        return issue.body.indexOf('**PDF:** ' + pdfName) !== -1 ||
                               issue.body.indexOf(pdfName) !== -1;
                    });
                    
                    allIssues = allIssues.concat(matching);
                    if (batch.length < 100) break;
                    page++;
                } catch (e) {
                    console.warn('Issue fetch failed on page ' + page + ':', e.message);
                    break;
                }
            }
            return allIssues;
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
            body = body + '| **Color** | ' + (annotationData.color || 'default') + ' |\n';
            body = body + '| **Status** | ' + (annotationData.status || 'open') + ' |\n';
            body = body + '\n**Comment:** ' + (annotationData.comment || 'No comment') + '\n';
            if (annotationData.quotedText) {
                body = body + '\n**Quoted Text:**\n> ' + annotationData.quotedText + '\n';
            }
            body = body + '\n```json\n' + JSON.stringify(annotationData, null, 2) + '\n```\n';

            // Create without label to avoid 422 errors
            return githubAPI('/issues', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body })
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
            body = body + '| **Color** | ' + (annotationData.color || 'default') + ' |\n';
            body = body + '| **Status** | ' + (annotationData.status || 'open') + ' |\n';
            body = body + '\n**Comment:** ' + (annotationData.comment || 'No comment') + '\n';
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
        },

        // Add reply to existing issue
        addIssueComment: async function(issueNumber, commentBody) {
            return githubAPI('/issues/' + issueNumber + '/comments', {
                method: 'POST',
                body: JSON.stringify({ body: commentBody })
            });
        },

        // Get comments on an issue (replies)
        getIssueComments: async function(issueNumber) {
            return githubAPI('/issues/' + issueNumber + '/comments');
        }
    };
})();
