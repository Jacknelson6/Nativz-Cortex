/**
 * Rasterizes a DOM subtree to a single-page A4 PDF (content is scaled to fit).
 */
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#0d0d14',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const margin = 10;
  const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
  const imgRatio = canvas.width / canvas.height;
  let w = pageW;
  let h = pageW / imgRatio;
  if (h > pageH) {
    h = pageH;
    w = h * imgRatio;
  }
  pdf.addImage(imgData, 'PNG', margin, margin, w, h);
  pdf.save(filename);
}
