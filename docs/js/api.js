// ============================================================
// GITHUB API (via Cloudflare Proxy)
// ============================================================
const API = (function() {
    const BASE = CONFIG.PROXY_URL;

    async function githubFetch(url, options) {
        options = options || {};
        let proxyUrl;
        if (url.startsWith('https://api.github.com')) {
            const parsed = new URL(url);
            proxyUrl = BASE + parsed.pathname + parsed.search;
        } else if (url.startsWith(BASE)) {
            proxyUrl = url;
        } else {
            proxyUrl = BASE + url;
        }

        const fetchOptions = {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        };
        if (options.method) fetchOptions.method = options.method;
        if (options.body) {
            fetchOptions.body = options.body;
            fetchOptions.headers['Content-Type'] = 'application/json';
        }

        const resp = await fetch(proxyUrl, fetchOptions);
        if (!resp.ok) {
            let err = {};
            try { err = await resp.json(); } catch (e) {}
            throw new Error(`API error (${resp.status}): ${err.message || resp.statusText}`);
        }
        return resp.json();
    }

    return {
        fetchContents(path) {
            return githubFetch('/contents/' + path);
        },

        async fetchPDF(contentsPath) {
            const proxyPDFUrl = BASE + '/raw/master/' + contentsPath;
            const response = await fetch(proxyPDFUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - Failed to load PDF`);
            }
            return response.arrayBuffer();
        },

        async fetchIssuesForPDF(pdfName) {
            const label = CONFIG.ISSUE_LABEL_PREFIX + ':' + encodeURIComponent(pdfName);
            const allIssues = [];
            let page = 1;
            while (true) {
                const batch = await githubFetch('/issues?labels=' + label + '&state=all&per_page=100&page=' + page);
                if (!batch.length) break;
                allIssues.push(...batch);
                page++;
            }
            return allIssues;
        },

        async createAnnotationIssue(pdfName, pageNum, annotationData) {
            const label = CONFIG.ISSUE_LABEL_PREFIX + ':' + encodeURIComponent(pdfName);
            const typeIcons = { highlight: '🖍', quote: '💬', drawing: '✏️', comment: '📝', rectangle: '⬜' };
            const icon = typeIcons[annotationData.type] || '📌';
            const title = `[${pdfName}] Page ${pageNum}: ${icon} ${annotationData.type} annotation`;
            const body = `<!-- delmed-pdf-annotation -->
**PDF:** ${pdfName}
**Page:** ${pageNum}
**Type:** ${annotationData.type}
**Color:** ${annotationData.color || 'default'}
**Data:** \`\`\`json
${JSON.stringify(annotationData, null, 2)}
\`\`\`
${annotationData.quotedText ? '\n**Quoted Text:**\n> ' + annotationData.quotedText + '\n' : ''}
${annotationData.comment || ''}`;
            return githubFetch('/issues', {
                method: 'POST',
                body: JSON.stringify({ title, body, labels: [label] }),
            });
        },
    };
})();
