import { describe, it, expect } from 'vitest';
import { HtmlAnalysisService } from '../../services/HtmlAnalysisService';

describe('HtmlAnalysisService', () => {
  const service = new HtmlAnalysisService();

  describe('normalizeHtml', () => {
    it('should remove Google Analytics scripts', () => {
      const html = `
        <html><head>
          <script src="https://www.google-analytics.com/analytics.js"></script>
          <title>Test</title>
        </head><body><p>Hello</p></body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('google-analytics');
      expect(result).toContain('Hello');
    });

    it('should remove Google Tag Manager scripts', () => {
      const html = `
        <html><body>
          <script src="https://www.googletagmanager.com/gtag/js"></script>
          <p>Content</p>
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('googletagmanager');
    });

    it('should remove CSRF tokens', () => {
      const html = `
        <html><body>
          <meta name="csrf-token" content="abc123">
          <input name="_token" value="xyz789">
          <input name="_csrf" value="def456">
          <p>Content</p>
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('csrf-token');
      expect(result).not.toContain('abc123');
    });

    it('should remove HTML comments', () => {
      const html = `
        <html><body>
          <!-- This is a comment -->
          <p>Content</p>
          <!-- Another comment -->
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('This is a comment');
      expect(result).not.toContain('Another comment');
    });

    it('should remove nonce attributes', () => {
      const html = `
        <html><body>
          <script nonce="abc123">console.log('test')</script>
          <p>Content</p>
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('nonce=');
    });

    it('should remove custom selectors', () => {
      const html = `
        <html><body>
          <div class="news-ticker">Breaking: Something happened</div>
          <div id="visitor-count">12345 visitors</div>
          <p>Main Content</p>
        </body></html>
      `;
      const result = service.normalizeHtml(html, ['.news-ticker', '#visitor-count']);
      expect(result).not.toContain('news-ticker');
      expect(result).not.toContain('visitor-count');
      expect(result).toContain('Main Content');
    });

    it('should remove tracking pixels', () => {
      const html = `
        <html><body>
          <img width="1" height="1" src="https://tracking.example.com/pixel.gif">
          <p>Content</p>
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      expect(result).not.toContain('tracking.example.com');
    });

    it('should normalize whitespace', () => {
      const html = `
        <html><body>
          <p>   Hello    World   </p>
        </body></html>
      `;
      const result = service.normalizeHtml(html);
      // Multiple spaces should be collapsed
      expect(result).not.toContain('    ');
    });
  });

  describe('extractStructuralFingerprint', () => {
    it('should produce the same hash for same structure with different text', () => {
      const html1 = '<html><body><div><h1>Title One</h1><p>Content A</p></div></body></html>';
      const html2 = '<html><body><div><h1>Title Two</h1><p>Content B</p></div></body></html>';

      const hash1 = service.extractStructuralFingerprint(html1);
      const hash2 = service.extractStructuralFingerprint(html2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different structures', () => {
      const html1 = '<html><body><div><h1>Title</h1><p>Content</p></div></body></html>';
      const html2 = '<html><body><div><h1>Title</h1><p>Content</p><span>Extra</span></div></body></html>';

      const hash1 = service.extractStructuralFingerprint(html1);
      const hash2 = service.extractStructuralFingerprint(html2);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce the same hash regardless of attributes', () => {
      const html1 = '<html><body><div class="main"><p id="text">Hello</p></div></body></html>';
      const html2 = '<html><body><div class="sidebar"><p id="other">World</p></div></body></html>';

      const hash1 = service.extractStructuralFingerprint(html1);
      const hash2 = service.extractStructuralFingerprint(html2);

      expect(hash1).toBe(hash2);
    });

    it('should produce the same hash regardless of images/videos', () => {
      const html1 = '<html><body><div><img src="a.jpg"><video src="b.mp4"></video></div></body></html>';
      const html2 = '<html><body><div><img src="x.jpg"><video src="y.mp4"></video></div></body></html>';

      const hash1 = service.extractStructuralFingerprint(html1);
      const hash2 = service.extractStructuralFingerprint(html2);

      expect(hash1).toBe(hash2);
    });

    it('should return a valid SHA-256 hash (64 hex chars)', () => {
      const hash = service.extractStructuralFingerprint('<html><body><p>test</p></body></html>');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('extractCriticalDomains', () => {
    const siteUrl = 'https://example.com';

    it('should extract external script domains', () => {
      const html = `
        <html><body>
          <script src="https://cdn.jquery.com/jquery.min.js"></script>
          <script src="https://evil.com/malware.js"></script>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toContain('cdn.jquery.com');
      expect(domains).toContain('evil.com');
    });

    it('should extract iframe domains', () => {
      const html = `
        <html><body>
          <iframe src="https://embed.example.org/widget"></iframe>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toContain('embed.example.org');
    });

    it('should extract link href domains', () => {
      const html = `
        <html><head>
          <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet">
        </head><body></body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toContain('fonts.googleapis.com');
    });

    it('should extract form action domains', () => {
      const html = `
        <html><body>
          <form action="https://phishing.evil.com/steal"></form>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toContain('phishing.evil.com');
    });

    it('should exclude the site own domain', () => {
      const html = `
        <html><body>
          <script src="https://example.com/app.js"></script>
          <script src="https://cdn.other.com/lib.js"></script>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).not.toContain('example.com');
      expect(domains).toContain('cdn.other.com');
    });

    it('should ignore relative paths', () => {
      const html = `
        <html><body>
          <script src="/js/app.js"></script>
          <script src="lib.js"></script>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toHaveLength(0);
    });

    it('should handle protocol-relative URLs', () => {
      const html = `
        <html><body>
          <script src="//cdn.external.com/lib.js"></script>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toContain('cdn.external.com');
    });

    it('should return sorted unique domains', () => {
      const html = `
        <html><body>
          <script src="https://b.com/1.js"></script>
          <script src="https://a.com/2.js"></script>
          <script src="https://b.com/3.js"></script>
        </body></html>
      `;
      const domains = service.extractCriticalDomains(html, siteUrl);
      expect(domains).toEqual(['a.com', 'b.com']);
    });
  });

  describe('compareWithBaseline', () => {
    const siteUrl = 'https://example.com';

    it('should return 100/100 when structure and domains match', () => {
      const html = '<html><body><div><p>Content</p></div></body></html>';
      const structuralHash = service.extractStructuralFingerprint(html);
      const domains = service.extractCriticalDomains(html, siteUrl);

      const result = service.compareWithBaseline(html, siteUrl, {
        structuralHash,
        domainWhitelist: domains,
      });

      expect(result.structuralScore).toBe(100);
      expect(result.criticalElementsScore).toBe(100);
      expect(result.structuralMatch).toBe(true);
      expect(result.newDomains).toHaveLength(0);
    });

    it('should detect new external domain and reduce critical score', () => {
      const baselineHtml = `
        <html><body>
          <script src="https://cdn.good.com/lib.js"></script>
          <p>Content</p>
        </body></html>
      `;
      const currentHtml = `
        <html><body>
          <script src="https://cdn.good.com/lib.js"></script>
          <script src="https://evil.com/malware.js"></script>
          <p>Content</p>
        </body></html>
      `;

      const structuralHash = service.extractStructuralFingerprint(baselineHtml);
      const baselineDomains = service.extractCriticalDomains(baselineHtml, siteUrl);

      const result = service.compareWithBaseline(currentHtml, siteUrl, {
        structuralHash,
        domainWhitelist: baselineDomains,
      });

      expect(result.newDomains).toContain('evil.com');
      expect(result.criticalElementsScore).toBe(75); // 100 - 25 for one new domain
    });

    it('should give 0 structural score when structure changes', () => {
      const baselineHtml = '<html><body><div><p>Content</p></div></body></html>';
      const currentHtml = '<html><body><div><p>Content</p><span>Injected</span></div></body></html>';

      const structuralHash = service.extractStructuralFingerprint(baselineHtml);
      const domains = service.extractCriticalDomains(baselineHtml, siteUrl);

      const result = service.compareWithBaseline(currentHtml, siteUrl, {
        structuralHash,
        domainWhitelist: domains,
      });

      expect(result.structuralScore).toBe(0);
      expect(result.structuralMatch).toBe(false);
    });

    it('should handle multiple new domains (score capped at 0)', () => {
      const baselineHtml = '<html><body><p>Content</p></body></html>';
      const currentHtml = `
        <html><body>
          <script src="https://a.com/1.js"></script>
          <script src="https://b.com/2.js"></script>
          <script src="https://c.com/3.js"></script>
          <script src="https://d.com/4.js"></script>
          <script src="https://e.com/5.js"></script>
          <p>Content</p>
        </body></html>
      `;

      const structuralHash = service.extractStructuralFingerprint(baselineHtml);

      const result = service.compareWithBaseline(currentHtml, siteUrl, {
        structuralHash,
        domainWhitelist: [],
      });

      expect(result.criticalElementsScore).toBe(0);
      expect(result.newDomains.length).toBe(5);
    });

    it('should apply ignoreSelectors during comparison', () => {
      const baselineHtml = '<html><body><p>Content</p></body></html>';
      const currentHtml = `
        <html><body>
          <div class="dynamic-widget"><script src="https://widget.com/w.js"></script></div>
          <p>Content</p>
        </body></html>
      `;

      const structuralHash = service.extractStructuralFingerprint(baselineHtml);

      const result = service.compareWithBaseline(currentHtml, siteUrl, {
        structuralHash,
        domainWhitelist: [],
      }, ['.dynamic-widget']);

      // The widget should be removed by ignoreSelectors, so no new domains
      expect(result.newDomains).toHaveLength(0);
    });

    it('should detect removed domains with minor score reduction', () => {
      const html = '<html><body><p>Content</p></body></html>';
      const structuralHash = service.extractStructuralFingerprint(html);

      const result = service.compareWithBaseline(html, siteUrl, {
        structuralHash,
        domainWhitelist: ['cdn.removed.com'],
      });

      expect(result.removedDomains).toContain('cdn.removed.com');
      expect(result.criticalElementsScore).toBe(95); // 100 - 5
    });
  });

  describe('createBaselineData', () => {
    it('should return htmlHash, structuralHash, and domainWhitelist', () => {
      const html = `
        <html><body>
          <script src="https://cdn.example.com/lib.js"></script>
          <p>Content</p>
        </body></html>
      `;
      const result = service.createBaselineData(html, 'https://mysite.com');

      expect(result.htmlHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.structuralHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.domainWhitelist).toContain('cdn.example.com');
    });

    it('should apply ignoreSelectors when creating baseline', () => {
      const html = `
        <html><body>
          <div class="ad-banner"><script src="https://ads.com/ad.js"></script></div>
          <script src="https://cdn.example.com/lib.js"></script>
          <p>Content</p>
        </body></html>
      `;
      const result = service.createBaselineData(html, 'https://mysite.com', ['.ad-banner']);

      // ads.com should be excluded because .ad-banner is removed
      expect(result.domainWhitelist).not.toContain('ads.com');
      expect(result.domainWhitelist).toContain('cdn.example.com');
    });
  });
});
