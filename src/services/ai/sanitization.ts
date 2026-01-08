
const analyzeTokenStats = (str: string) => {
    // 1. Split on separators (hyphen, underscore, plus, space, dot, colon, equals)
    let clean = str.replace(/[-_+. :=]/g, ' ');

    // 2. Insert space before capital letters (CamelCase)
    // Handle acronyms: XMLHttp -> XML Http
    clean = clean.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    // Handle normal: camelCase -> camel Case
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

    const stats = analyzeTokenStats(value);

    // RULE 1: Massive Token (Fatal)
    // Chrome Ext IDs are 32 chars. Longest common English words < 20.
    // If a single token is > 30 chars, it's almost certainly a key/hash.
    if (stats.maxLen > 30) return true;

    // RULE 2: Extreme Fragmentation (Fatal)
    // Avglen < 2.2 means the string is chopped into tiny pieces (e.g. hex).
    // Natural language (even short words) usually averages > 3.0.
    if (stats.avgLen < 2.2) return true;

    // RULE 3: High Entropy (Conditional)
    // Avglen < 3.0 is suspicious, but simple English can fall here ("to be").
    // If avg < 3.0, strip if it's long enough to be an ID (> 25 chars)
    if (stats.avgLen < 3.0 && value.length > 25) return true;

    // If none of the above, assume it's safe (e.g. Long natural text).
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
