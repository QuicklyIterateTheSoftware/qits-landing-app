/** The idp's page origin `provideAppRoute()` gives. */
export const TEST_IDP = 'https://idp.qits.example.test';

/**
 * Gives an IdP admin page's frame (qits-2481) a fixed stand-in document and waits for it.
 *
 * The frame's own document is the idp's, and no test reaches the idp. So after a spec checks where
 * the frame points, this sets `srcdoc`, which wins over `src`: the same pixels on every machine.
 */
export async function standInIdpFrame(frame: HTMLIFrameElement, page: string): Promise<void> {
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.setAttribute(
    'srcdoc',
    `<p style="font: 14px sans-serif; margin: 24px">The idp’s ${page} page</p>`,
  );
  await loaded;
}
