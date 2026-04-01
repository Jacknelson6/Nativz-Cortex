/** Opens a print dialog with a clone of the rendered message (Save as PDF from the dialog). */
export function printMessageElement(element: HTMLElement): void {
  const w = window.open('', '_blank');
  if (!w) return;

  const doc = w.document;
  const html = doc.documentElement;
  const head = doc.createElement('head');
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  const title = doc.createElement('title');
  title.textContent = 'Cortex message';
  const style = doc.createElement('style');
  style.textContent = `
    body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; background: #fff; color: #111; max-width: 720px; margin: 0 auto; }
    pre { overflow-x: auto; background: #f4f4f5; padding: 12px; border-radius: 8px; }
    img { max-width: 100%; height: auto; }
  `;
  head.appendChild(meta);
  head.appendChild(title);
  head.appendChild(style);
  html.appendChild(head);

  const body = doc.createElement('body');
  body.appendChild(element.cloneNode(true));
  html.appendChild(body);

  w.focus();
  w.print();
}
