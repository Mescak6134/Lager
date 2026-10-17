// Barcode-Scanner über die Kamera (nur wenn der Browser das kann, z. B. Chrome auf Android).
import { el, icon, formDialog } from './ui.js';

export const canScan = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

// iPhone (Safari) kann keine Barcodes erkennen → dort die Nummer eintippen lassen
export const barcodeLabel = () => (canScan() ? 'Barcode scannen' : 'EAN eintippen');
export const barcodeIcon = () => (canScan() ? 'scan' : 'hash');
export function getBarcode() { return canScan() ? scanBarcode() : typeBarcode(); }

async function typeBarcode() {
  const res = await formDialog('EAN eintippen', [
    { name: 'ean', label: 'EAN / Barcode-Nummer', required: true, inputmode: 'numeric', max: 32, placeholder: 'z. B. 4006381000017', hint: 'Die Zahl unter dem Strichcode auf der Packung.' },
  ], {}, { submit: 'Suchen' });
  const code = res?.ean ? String(res.ean).replace(/\s/g, '') : '';
  return code || null;
}

export async function scanBarcode() {
  if (!canScan()) return null;
  let formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    formats = formats.filter((f) => supported.includes(f));
  } catch { /* alte Version */ }
  const detector = new window.BarcodeDetector({ formats });
  return new Promise((resolve) => {
    const video = el('video', { playsinline: true, muted: true, autoplay: true, class: 'scan-video' });
    const status = el('p', { class: 'sub center', text: 'Kamera wird gestartet …' });
    let stream, timer, done = false;
    const dlg = el('dialog', { class: 'scan-dlg' },
      el('form', { method: 'dialog' },
        el('h2', { text: 'Barcode scannen' }),
        el('div', { class: 'scan-box' }, video, el('div', { class: 'scan-frame' })),
        status,
        el('div', { class: 'actions mt' }, el('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, icon('x'), 'Abbrechen'))));
    function finish(v) {
      if (done) return; done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      try { dlg.close(); } catch { /* */ }
      dlg.remove();
      resolve(v);
    }
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    document.body.append(dlg);
    dlg.showModal();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      stream = s; video.srcObject = s;
      status.textContent = 'Halte den Barcode in den Rahmen.';
      timer = setInterval(async () => {
        if (video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) { navigator.vibrate?.(60); finish(codes[0].rawValue.trim()); }
        } catch { /* nächster Versuch */ }
      }, 250);
    }).catch(() => {
      status.textContent = 'Kein Zugriff auf die Kamera. Bitte in den Browser-Einstellungen erlauben.';
    });
  });
}
