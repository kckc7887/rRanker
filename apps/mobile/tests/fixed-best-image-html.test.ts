import { describe, expect, it } from 'vitest';
import { buildFixedBestImageHtml } from '@/features/best-image/build-fixed-best-image-html';

describe('fixed community best image html', () => {
  it.each([1080, 1440, 2160])('renders a three-column escaped document at width %s', (width) => {
    const html = buildFixedBestImageHtml({
      width,
      title: 'Top20',
      playerName: '<玩家 & A>',
      ratingLabel: 'Rating',
      ratingDisplay: '123.45',
      avatarUrl: 'https://example.test/a.png?x=1&y=2',
      avatarFallbackUrl: 'data:image/png;base64,test',
      dataSource: 'TUF <公开>',
      cardLayout: { asideMetricKey: 'impact' },
      theme: { accent: '#24B8E6', accentSoft: '#DFF6FC', secondaryAccent: '#F05B5B' },
      sections: [{
        id: 'top20', title: 'Top 20', items: [{
          key: '1', gameId: 'fictional', route: { songId: '1' }, position: 1,
          title: '<Song>', accessibilityLabel: 'song',
          primaryMetric: { key: 'score', label: 'Score', text: '100.00' },
          secondaryMetrics: [{ key: 'impact', label: 'Impact', text: '9.99' }],
          difficulty: { key: 'difficulty', label: 'G12', tone: 'tuf-g' },
          achievementRows: [[{ key: 'wf', label: 'WF', tone: 'world-first' }]],
        }],
      }],
    });
    expect(html).toContain(`width:${width}px`);
    expect(html).toContain('class="preview-stage"');
    expect(html).toContain('class="canvas"');
    expect(html).toContain('data-layout-content');
    expect(html).toContain('grid-template-columns:repeat(3');
    expect(html).toContain('&lt;玩家 &amp; A&gt;');
    expect(html).toContain('&lt;Song&gt;');
    expect(html).not.toContain('<Song>');
    expect(html).toContain("type: 'best-image-ready'");
    expect(html).toContain('ResizeObserver');
    expect(html).toContain('class="position">1.</span>');
    expect(html).toContain('<aside><small>Impact</small><strong>9.99</strong></aside>');
    expect(html).not.toContain('document-title');
    expect(html).not.toContain('document.body.scrollHeight');
    expect(html).toContain('#F05B5B');
  });
});
