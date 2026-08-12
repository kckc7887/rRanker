import { describe, expect, it } from 'vitest';
import { buildFixedBestImageHtml } from '@/features/best-image/build-fixed-best-image-html';

describe('fixed community best image html', () => {
  it.each([1080, 1440, 2160])('renders the shared application card contract at width %s', (width) => {
    const html = buildFixedBestImageHtml({
      width,
      playerName: '<玩家 & A>',
      ratingDisplay: '123.45',
      avatarUri: 'data:image/png;base64,test',
      sectionTitle: 'Top1',
      dataSource: 'TUF <公开>',
      cards: [{
        key: '1',
        accessibilityLabel: 'song',
        identifier: 'ID42',
        title: '<Song>',
        coverUri: 'data:image/png;base64,cover',
        palette: { background: '#F2A700', border: '#B87F00', text: '#172033' },
        primary: { label: 'Score', text: '100.00' },
        relation: { text: 'G12 -> 9.99' },
        iconRow: [{ key: 'featured', label: 'Featured', source: 'data:image/png;base64,tag' }],
        badgeRows: [[{ key: 'wf', label: 'WF', background: '#FFF3B0', text: '#4B3A05' }]],
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
    expect(html).toContain('<span class="song-rank">ID42</span>');
    expect(html).toContain('<span class="primary-label">Score</span>');
    expect(html).toContain('G12 -&gt; 9.99');
    expect(html).toContain('class="tag-icon"');
    expect(html).toContain("onerror=\"this.style.display='none'\"");
    expect(html).toContain('<div class="section-divider"><span>Top1</span>');
    expect(html).not.toContain('accent-lines');
    expect(html).not.toContain('section-heading');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('1 条');
    expect(html).not.toContain('document.body.scrollHeight');
    expect(html).toContain('Designed by EgawaHokori. Data from TUF &lt;公开&gt;.');
  });
});
