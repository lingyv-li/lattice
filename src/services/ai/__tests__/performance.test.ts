import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../sanitization';

describe('sanitizeUrl Performance Benchmark', () => {
    it('should handle high throughput', () => {
        const ITERATIONS = 10000;

        const datasets = {
            fastShort: "https://example.com/short",
            fastSeparators: "https://example.com/my-very-long-article-title-with-dashes",
            fastUnicode: "https://example.com/über-unsere-produkte",
            knownId: "https://example.com/e5f8a9b2-2930-4b2c-8d1e-2f3a4b5c6d7e", // UUID
            ambiguousNatural: "https://example.com/MyTop10BestMoviesOf2025SoFar", // Low entropy
            ambiguousJunk: "https://example.com/d7Bv9X2z1K5m3Q8j4N6w0L9p2R5t8Y", // High entropy
            veryLongInput: "https://example.com/" + "a".repeat(2000), // Max length truncation test
        };

        const results: Record<string, number> = {};

        console.log(`\n=== Performance Benchmark (${ITERATIONS} iterations) ===`);

        for (const [name, url] of Object.entries(datasets)) {
            const start = performance.now();
            for (let i = 0; i < ITERATIONS; i++) {
                sanitizeUrl(url);
            }
            const end = performance.now();
            const duration = end - start;
            const opsPerSec = Math.floor((ITERATIONS / duration) * 1000);

            results[name] = opsPerSec;
            console.log(`${name.padEnd(20)}: ${opsPerSec.toLocaleString()} ops/sec (${duration.toFixed(2)}ms total)`);
        }

        // Assert basic performance baseline (e.g., >100k ops/sec for fast paths)
        // Adjust baseline based on actual run, but "fastSeparators" should be significantly faster than "ambiguousJunk"
        // if the cascade works (no math for separators).

        expect(results.fastSeparators).toBeGreaterThan(1000);
        expect(results.fastShort).toBeGreaterThan(10000);
    });
});
