// ============================================================
// GITHUB API (via Cloudflare Proxy)
// ============================================================
var API = (function() {
    if (typeof API !== 'undefined' && API.fetchContents) {
        return API;
    }

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
            throw new Error('API error (' + resp.status + '): ' + (err.message || resp.statusText));
        }
        return resp.json();
    }

    return {
        fetchContents: function(path) {
            return githubFetch('/contents/' + path);
        },

        fetchPDF: async function(contentsPath) {
            const proxyPDFUrl = BASE + '/raw/master/' + contentsPath;
            const response = await fetch(proxyPDFUrl);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' - Failed to load PDF');
            }
            return response.arrayBuffer();
        },

        fetchIssuesForPDF: async function(pdfName) {
            const label = CONFIG.ISSUE_LABEL_PREFIX + ':' + encodeURIComponent(pdfName);
            const allIssues = [];
            let page = 1;
            while (true) {
                const url = '/issues?labels=' + label + '&state=all&per_page=100&page=' + page;
                const batch = await githubFetch(url);
                if (!batch.length) break;
                allIssues.push(...batch);
                page++;
            }
            return allIssues;
        },

        createAnnotationIssue: async function(pdfName, pageNum, annotationData) {
            const label = CONFIG.ISSUE_LABEL_PREFIX + ':' + encodeURIComponent(pdfName);
            const title = '[' + pdfName + '] Page ' + pageNum + ': ' + annotationData.type + ' annotation';
            const body = '<!-- delmed-pdf-annotation -->\n' +
                '**PDF:** ' + pdfName + '\n' +
                '**Page:** ' + pageNum + '\n' +
                '**Type:** ' + annotationData.type + '\n' +
                '**Color:** ' + (annotationData.color || 'default') + '\n' +
                '**Data:** ```json\n' + JSON.stringify(annotationData, null, 2) + '\n```\n' +
                (annotationData.quotedText ? '\n**Quoted Text:**\n> ' + annotationData.quotedText + '\n' : '') +
                (annotationData.comment || '');
            return githubFetch('/issues', {
                method: 'POST',
                body: JSON.stringify({ title: title, body: body, labels: [label] }),
            });
        },
    };
})();
