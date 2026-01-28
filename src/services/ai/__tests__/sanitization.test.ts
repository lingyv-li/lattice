import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../sanitization';

describe('sanitizeUrl - Token Segmentation Logic', () => {
    it('should sanitize fragmented IDs (avg token len < 3)', () => {
        // "d7Bv9X2z1K5m3Q" split: d, 7, B, v, 9, X, 2, z... -> Avg 1.0 -> STRIP
        expect(sanitizeUrl('https://example.com/item/d7Bv9X2z1K5m3Q')).toBe('https://example.com/item');

        // UUID "123e4567-e89b-12d3" -> 123, e, 4567, e, 89, b... -> Avg < 3 -> STRIP
        expect(sanitizeUrl('https://example.com/id/123e4567-e89b-12d3-a456-426614174000')).toBe('https://example.com/id');
    });

    it('should correctly split on regex special char separators (., -, +)', () => {
        // "word.with-separators+and_more"
        // Tokens: word, with, separators, and, more
        // Lengths: 4, 4, 10, 3, 4 -> Avg 5.0 -> KEEP
        // If regex failed (e.g. treated . as any char or - as range), stats would be wrong
        expect(sanitizeUrl('https://example.com/word.with-separators+and_more')).toBe('https://example.com/word.with-separators+and_more');

        // "a.b-c+d_e.f-g" (13 chars) -> tokens: a,b,c,d,e,f,g -> Avg 1.0 -> STRIP (fragmented)
        expect(sanitizeUrl('https://example.com/item/a.b-c+d_e.f-g')).toBe('https://example.com/item');
    });

    it('should KEEP multilingual slugs (avg token len > 3)', () => {
        // Spanish: "la-casa-de-papel" -> la, casa, de, papel -> Avg (2+4+2+5)/4 = 3.25 -> KEEP
        expect(sanitizeUrl('https://ex.com/la-casa-de-papel')).toBe('https://ex.com/la-casa-de-papel');

        // German: "das-boot" -> das, boot -> Avg 3.5 -> KEEP
        expect(sanitizeUrl('https://ex.com/das-boot')).toBe('https://ex.com/das-boot');

        // Italian: "la-vita-e-bella" -> la, vita, e, bella -> Avg (2+4+1+5)/4 = 3.0 -> KEEP
        // Actually, let's test the specific user failing cases
        expect(sanitizeUrl('https://ex.com/la-vita-e-bella-movie')).toBe('https://ex.com/la-vita-e-bella-movie');
    });

    it('should KEEP English CamelCase (avg token len > 3)', () => {
        // "MyTop10BestMovies" -> My, Top, 10, Best, Movies -> Avg (2+3+2+4+6)/5 = 3.4 -> KEEP
        expect(sanitizeUrl('https://ex.com/MyTop10BestMovies')).toBe('https://ex.com/MyTop10BestMovies');
    });

    it('should sanitize super long single tokens (maxLen > 40)', () => {
        const longHash = 'a'.repeat(45);
        expect(sanitizeUrl(`https://ex.com/${longHash}`)).toBe('https://ex.com/');
    });
});

describe('sanitizeUrl', () => {
    it('should strip common tracking parameters', () => {
        const url = 'https://example.com?utm_source=twitter&utm_medium=social&id=123';
        expect(sanitizeUrl(url)).toBe('https://example.com/?id=123');
    });

    it('should strip clid, braid and ref parameters', () => {
        const url = 'https://example.com?gclid=123&fbclid=456&wbraid=abc&gbraid=xyz&ref=something&valid=true';
        // Ref should be stripped, clids/braids stripped, valid kept
        expect(sanitizeUrl(url)).toBe('https://example.com/?valid=true');
    });

    it('should truncate extremely long URLs post-sanitization', () => {
        const base = 'there_is_something_interesting_with_common_bigrams_';
        const longSlug = base.repeat(20); // ~1000 chars
        const url = `https://example.com/${longSlug}`;

        const result = sanitizeUrl(url);
        expect(result.length).toBe(500);
        expect(result).toBe(url.substring(0, 500));
    });

    it('should remove mixed alphanumeric IDs but preserve slugs (CamelCase/Hyphens)', () => {
        // Pure ID -> Strip
        expect(sanitizeUrl('https://example.com/item/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6/details')).toBe('https://example.com/item/details');

        // UUID -> Strip
        expect(sanitizeUrl('https://example.com/item/123e4567-e89b-12d3-a456-426614174000/details')).toBe('https://example.com/item/details');

        // Slug with hyphens -> Keep
        expect(sanitizeUrl('https://medium.com/swlh/why-generative-ai-is-changing-the-landscape-of-coding-12345')).toBe(
            'https://medium.com/swlh/why-generative-ai-is-changing-the-landscape-of-coding-12345'
        );

        // Slug with underscores -> Keep
        expect(sanitizeUrl('https://example.com/wiki/some_very_long_article_title_with_underscores')).toBe('https://example.com/wiki/some_very_long_article_title_with_underscores');

        // CamelCase Slug -> Keep
        expect(sanitizeUrl('https://example.com/wiki/SomeVeryLongArticleTitleAboutSomething')).toBe('https://example.com/wiki/SomeVeryLongArticleTitleAboutSomething');

        // Base64-like ID (Mixed Case + Numbers) -> Strip
        expect(sanitizeUrl('https://example.com/verify/d7Bv9X2z1K5m3Q8j4N6w0L9p2R5t8Y')).toBe('https://example.com/verify');

        // CamelCase with numbers (e.g. "Top10") -> Keep (User Request)
        expect(sanitizeUrl('https://example.com/blog/MyTop10BestMoviesOf2025SoFar')).toBe('https://example.com/blog/MyTop10BestMoviesOf2025SoFar');
    });

    it('should preserve short paths', () => {
        const url = 'https://github.com/clean/path';
        expect(sanitizeUrl(url)).toBe('https://github.com/clean/path');
    });

    it('should return original string if invalid URL', () => {
        const url = 'not a url';
        expect(sanitizeUrl(url)).toBe('not a url');
    });

    it('should strip long ID in chrome webstore url', () => {
        const url = 'https://chrome.google.com/webstore/devconsole/dc04e5fd-5e23-4cad-a23d-3bc59f84b4e3/pmfnbmepjanpoolfjelpgbakphakhjmf/edit';
        expect(sanitizeUrl(url)).toBe('https://chrome.google.com/webstore/devconsole/edit');
    });

    it('should strip long query params generically but keep whitelisted ones', () => {
        // long_garbage is > 25 chars.
        // "long_garbage=Xy7z9qL2m4P8j1N6w0R5t3K9v2B" (High Entropy)
        const input = 'https://google.com/search?q=hello&long_garbage=Xy7z9qL2m4P8j1N6w0R5t3K9v2B&short=ok';
        const cleaned = sanitizeUrl(input);

        expect(cleaned).toContain('q=hello');
        expect(cleaned).toContain('short=ok');
        expect(cleaned).not.toContain('long_garbage');
    });

    it('should handle complex Google Search URLs (User Reported)', () => {
        const url =
            'https://www.google.com/search?num=10&sca_esv=84a8ac606539b77f&rlz=1C5CHFA_enAU946AU946&sxsrf=AE3TifO5ludzRZKXUldIh7oO5eBDe-vKDw:1767779678692&udm=2&fbs=AIIjpHxU7SXXniUZfeShr2fp4giZ1Y6MJ25_tmWITc7uy4KIeuYzzFkfneXafNx6OMdA4MRo3L_oOc-1oJ7O1RV73dx3MIyCigtuiU2aDjExIvydX85cOq96-7Mxd4KSNCLhHwYIo4RJXEXVWYwYSeCFXG0J5g7J0_QlNiqM4Euq3DbUukakRlQBtEL4YIItWZLBS4_D4qpoqMYJgdHY3UCoXAcIgwU4ag&q=chanel+bodyguard&sa=X&ved=2ahUKEwiH96e-lPmRAxWAZvUHHQKLBw4QtKgLegQIHhAB&biw=829&bih=844&dpr=2#sv=CAMSVhoyKhBlLW40ZlN3dG';

        const cleaned = sanitizeUrl(url);

        // Should keep:
        expect(cleaned).toContain('q=chanel+bodyguard');
        expect(cleaned).toContain('num=10');
        expect(cleaned).toContain('udm=2');

        // Should remove (because value > 25 chars):
        expect(cleaned).not.toContain('sca_esv');
        expect(cleaned).not.toContain('sxsrf');
        expect(cleaned).not.toContain('fbs');
        expect(cleaned).not.toContain('ved');
    });

    it('should handle complex Google Search URL with gemini prompt (User Reported)', () => {
        const url =
            'https://www.google.com/search?q=gemini+nano+gemma+prompt&num=10&sca_esv=0bef742b4fee5174&rlz=1C5CHFA_enAU946AU946&sxsrf=ANbL-n6-_RzSXSumgdhn8SdCcRiohu5ymg%3A1767870526022&ei=PZBfafSNNp7g2roPtrih6AQ&ved=0ahUKEwi0oNH15vuRAxUesFYBHTZcCE0Q4dUDCBE&uact=5&oq=gemini+nano+gemma+prompt&gs_lp=Egxnd3Mtd2l6LXNlcnAiGGdlbWluaSBuYW5vIGdlbW1hIHByb21wdDIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzIKEAAYsAMY1gQYRzINEAAYgAQYsAMYQxiKBTINEAAYgAQYsAMYQxiKBUj6C1DQBVisC3ABeAGQAQCYAZEDoAHEC6oBBTMtMy4xuAEDyAEA-AEBmAIBoAIImAMAiAYBkAYKkgcBMaAH1BeyBwC4BwDCBwMyLTHIBwWACAA&sclient=gws-wiz-serp';

        const cleaned = sanitizeUrl(url);

        // Should keep relevant params
        expect(cleaned).toContain('q=gemini+nano+gemma+prompt');
        expect(cleaned).toContain('num=10');
        expect(cleaned).toContain('uact=5');

        // Should remove large tracking payloads
        expect(cleaned).not.toContain('gs_lp'); // Massive payload
        expect(cleaned).not.toContain('sxsrf'); // Long token
        expect(cleaned).not.toContain('ved'); // Tracking
        expect(cleaned).not.toContain('sca_esv'); // Tracking (explicitly in regex)
    });
});
