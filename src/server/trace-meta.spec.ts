import { withTraceparentMeta } from './trace-meta';

const TRACEPARENT = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

describe('withTraceparentMeta', () => {
  it('puts the meta tag first in the head', () => {
    expect(
      withTraceparentMeta('<html><head lang="en"><title>x</title></head></html>', TRACEPARENT),
    ).toBe(
      `<html><head lang="en"><meta name="traceparent" content="${TRACEPARENT}"><title>x</title></head></html>`,
    );
  });

  it('leaves the page alone without a valid traceparent', () => {
    const html = '<html><head></head></html>';
    expect(withTraceparentMeta(html, undefined)).toBe(html);
    expect(withTraceparentMeta(html, '00-"><script>')).toBe(html);
  });

  it('does not match a header element', () => {
    expect(withTraceparentMeta('<header></header>', TRACEPARENT)).toBe('<header></header>');
  });
});
