/* Keep the fixed composer above the virtual keyboard. */
export function initViewportInsets() {
  const root = document.documentElement;
  const viewport = window.visualViewport;

  const update = () => {
    let inset = 0;
    if (viewport) {
      inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    }
    root.style.setProperty('--keyboard-inset', `${inset}px`);
  };

  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);

  // Safari scrolls a focused field into view after its keyboard animation.
  document.addEventListener('focusin', (event) => {
    if (!event.target.matches('input, textarea')) return;
    setTimeout(() => {
      event.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      update();
    }, 280);
  });
  document.addEventListener('focusout', () => setTimeout(update, 280));

  update();
}
