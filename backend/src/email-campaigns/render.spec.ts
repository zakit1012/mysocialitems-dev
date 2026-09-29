import { fillVariables, inlineHtml, renderContent, safeUrl } from './render';

/**
 * Campaign content is written with a little formatting and turned into
 * email HTML. Whatever is typed, it cannot add its own HTML or script.
 */

const sam = { email: 'sam@example.test', name: 'Sam Lee' };
const nobody = { email: 'x@example.test', name: null };

describe('campaign content', () => {
  it('fills in the name, first name and email', () => {
    expect(
      fillVariables('Hi {{name}} / {{ first_name }} / {{email}}', sam),
    ).toBe('Hi Sam Lee / Sam / sam@example.test');
    expect(fillVariables('Hi {{name}}, {{first_name}}', nobody)).toBe(
      'Hi there, there',
    );
    expect(
      fillVariables('Hi {{first_name}}', {
        email: 'm@example.test',
        name: 'Diaz, Maria',
      }),
    ).toBe('Hi Maria');
  });

  it('escapes HTML typed into the content', () => {
    const { html } = renderContent('<script>alert(1)</script> & <b>x</b>', sam);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('escapes HTML in a name filled in', () => {
    const { html } = renderContent('Hi {{name}}', {
      email: 'e@example.test',
      name: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img');
  });

  it('only links to web and mail addresses', () => {
    expect(safeUrl('https://widgetpop.com/new')).toBe(
      'https://widgetpop.com/new',
    );
    expect(safeUrl('mailto:support@widgetpop.com')).toBe(
      'mailto:support@widgetpop.com',
    );
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(inlineHtml('[click](javascript:alert(1))')).toBe('click');
  });

  it('makes links, bold and italic', () => {
    const html = inlineHtml(
      '**New:** see [the docs](https://x.test/a?b=1&c=2) *today*',
    );
    expect(html).toContain('<strong>New:</strong>');
    expect(html).toContain('href="https://x.test/a?b=1&amp;c=2"');
    expect(html).toContain('>the docs</a>');
    expect(html).toContain('<em>today</em>');
    expect(
      inlineHtml('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet)).'),
    ).toBe(
      '<a href="https://en.wikipedia.org/wiki/Mercury_(planet)" style="color:#0096D6;text-decoration:underline">Mercury</a>.',
    );
  });

  it('links a bare address, leaving the full stop out', () => {
    const html = inlineHtml('Visit https://widgetpop.com/pricing.');
    expect(html).toContain('href="https://widgetpop.com/pricing"');
    expect(html).toMatch(/<\/a>\.$/);
  });

  it('turns blocks into headings, lists, a box, a button, an image and a line', () => {
    const { html, text } = renderContent(
      [
        '# What is new',
        'Two things:',
        '- Carousel autoplay',
        '- Dark theme',
        '',
        '1. Open the editor',
        '2. Pick a design',
        '',
        '> Heads-up: prices change in May',
        '',
        '[button: Try it](https://app.widgetpop.com)',
        '![A screenshot](https://widgetpop.com/shot.png)',
        '---',
        'Thanks, {{first_name}}',
      ].join('\n'),
      sam,
    );
    expect(html).toContain('<h2');
    expect(html).toContain('<ul');
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).toContain('<ol');
    expect(html).toContain('border-left:4px solid');
    expect(html).toContain('href="https://app.widgetpop.com/"');
    expect(html).toContain('<img src="https://widgetpop.com/shot.png"');
    expect(html).toContain('<hr');
    expect(html).toContain('Thanks, Sam');
    expect(text).toContain('- Carousel autoplay');
    expect(text).toContain('2. Pick a design');
    expect(text).toContain('Try it: https://app.widgetpop.com/');
  });

  it('keeps lines of one paragraph together, and a star list apart from bold', () => {
    const { html } = renderContent('one\ntwo\n\n**bold start** here', sam);
    expect(html).toContain('one<br>two');
    expect(html).toContain('<strong>bold start</strong> here');
    expect(html).not.toContain('<ul');
  });

  it('completes links written as a path with the site address', () => {
    const { html, text } = renderContent(
      '[button: Pricing](/pricing)\nSee [the demo](/#demo), not [this](//evil.test)',
      sam,
      'https://widgetpop.com/',
    );
    expect(html).toContain('href="https://widgetpop.com/pricing"');
    expect(html).toContain('href="https://widgetpop.com/#demo"');
    expect(html).not.toContain('evil.test"');
    expect(text).toContain('Pricing: https://widgetpop.com/pricing');
  });

  it('drops a button or image that points somewhere unsafe', () => {
    const { html } = renderContent(
      '[button: Go](javascript:alert(1))\n![x](javascript:alert(1))',
      sam,
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
  });
});
