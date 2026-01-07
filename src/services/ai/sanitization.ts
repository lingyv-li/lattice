
const analyzeTokenStats = (str: string) => {
    // 1. Split on separators (hyphen, underscore, plus, space, dot)
    let clean = str.replace(/[-_+. ]/g, ' ');

    // 2. Insert space before capital letters (CamelCase)
    clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');

    // 3. Insert space between Alpha and Number
    clean = clean.replace(/([a-zA-Z])([0-9])/g, '$1 $2');
    clean = clean.replace(/([0-9])([a-zA-Z])/g, '$1 $2');

    const tokens = clean.split(/\s+/).filter(t => t.length > 0);

    if (tokens.length === 0) return { avgLen: 0, maxLen: 0, count: 0 };

    const totalLen = tokens.reduce((acc, t) => acc + t.length, 0);
    const maxLen = Math.max(...tokens.map(t => t.length));

    return {
        avgLen: totalLen / tokens.length,
        maxLen,
        count: tokens.length
    };
};

const shouldSanitizeValue = (value: string): boolean => {
    // 0. SAFETY: Very short strings are usually meaningful
    if (value.length <= 10) return false;

    // 1. NATURAL LANGUAGE CHECKS (Fail Fast - Keep)
    // Non-ASCII characters (unicode slugs) are almost certainly natural
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(value)) return false;

    // 2. ROBUST: Token Segmentation Stats
    // IDs are highly fragmented (short tokens). Natural language has longer words.
    const stats = analyzeTokenStats(value);

    // Heuristic A: High Fragmentation
    // If avg < 1.8, it's extremely fragmented (mixed case/nums) -> Strip even if short (10-25 chars)
    if (stats.avgLen < 1.8) return true;

    // If avg < 3.0, strip if it's long enough to be an ID (> 25 chars)
    if (stats.avgLen < 3.0 && value.length > 25) return true;

    // Heuristic B: Single Massive Token (e.g. Hash/Key)
    // Longest English words are rarely > 20 chars. 30 is a safe upper bound.
    // Chrome Ext IDs are 32 chars.
    if (stats.maxLen > 30) return true;

    return false;
};

const TRACKING_PARAM_REGEX = /^(?:utm_|ref$)|(?:clid|braid|sca_esv)$/i;
const QUERY_PARAM_WHITELIST = new Set(['q', 'query', 'p', 'search', 'text']);

export const sanitizeUrl = (url: string): string => {
    try {
        // Soft pre-check to avoid parsing massive strings
        if (url.length > 2000) {
            url = url.substring(0, 2000);
        }

        const urlObj = new URL(url);
        const searchParams = new URLSearchParams(urlObj.search);
        const paramsToDelete: string[] = [];

        searchParams.forEach((value, key) => {
            // 1. Always strip known tracking prefixes/suffixes (RegEx is faster & handles case-insensitive)
            if (TRACKING_PARAM_REGEX.test(key)) {
                paramsToDelete.push(key);
                return;
            }

            const lowerKey = key.toLowerCase();

            // 2. Safety Whitelist: If it's a known content param, keep it regardless of length (unless it was tracking)
            if (QUERY_PARAM_WHITELIST.has(lowerKey)) {
                return;
            }

            // 3. Generic Length/Entropy Cleaning for Query Params
            if (shouldSanitizeValue(value)) {
                paramsToDelete.push(key);
            }
        });

        paramsToDelete.forEach(key => searchParams.delete(key));
        urlObj.search = searchParams.toString();

        // 4. Sanitize Path Segments
        const pathSegments = urlObj.pathname.split('/');
        const cleanPathSegments = pathSegments.filter(segment => {
            return !shouldSanitizeValue(segment);
        });

        urlObj.pathname = cleanPathSegments.join('/');

        const finalUrl = urlObj.toString();

        // 5. Hard Cap (500 chars) post-sanitization
        if (finalUrl.length > 500) {
            return finalUrl.substring(0, 500);
        }

        return finalUrl;
    } catch {
        return url.length > 500 ? url.substring(0, 500) : url;
    }
};
