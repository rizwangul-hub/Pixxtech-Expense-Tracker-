/**
 * Utility to reliably download purchase / receipt evidence images in the browser.
 * Tries direct Blob fetch first with cross-origin support,
 * and falls back to Cloudinary fl_attachment header transformation or direct anchor download.
 */
export async function downloadReceiptImage(url, preferredFilename) {
  if (!url) return false;

  const cleanFilename = (preferredFilename || 'receipt.jpg').replace(/[/\\?%*:|"<>]/g, '-');

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    return true;
  } catch (error) {
    console.warn('Direct blob download failed, trying Cloudinary attachment URL fallback:', error);

    // If Cloudinary URL, inject fl_attachment transformation to force browser download
    let directUrl = url;
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
      const sanitizedName = cleanFilename.replace(/\.[^/.]+$/, '');
      directUrl = url.replace('/upload/', `/upload/fl_attachment:${encodeURIComponent(sanitizedName)}/`);
    }

    const link = document.createElement('a');
    link.href = directUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }
}

/**
 * Downloads multiple receipt images sequentially with a short interval
 * to avoid browser popup/download blocker interventions.
 */
export async function downloadAllReceipts(attachments, baseName = 'Voucher_Receipt') {
  if (!Array.isArray(attachments) || attachments.length === 0) return;

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const url = typeof att === 'string' ? att : att?.url;
    if (!url) continue;

    const originalName = typeof att === 'object' && att?.originalName ? att.originalName : '';
    const ext = url.split('.').pop().split(/[?#]/)[0] || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(ext.toLowerCase()) ? ext : 'jpg';

    const filename = originalName && originalName.includes('.')
      ? originalName
      : `${baseName}_${i + 1}.${cleanExt}`;

    await downloadReceiptImage(url, filename);

    if (i < attachments.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
}
