'use client';

// Renders a scannable QR code pointing at a devis/facture's public
// /suivi/[token] tracking page — mirrors the QR embedded in the downloaded
// PDF (see lib/server/pdf/invoicePdf.tsx) so the on-screen preview matches
// what gets printed. Generated client-side (the `qrcode` package works in
// both Node and the browser) rather than fetched from an API, since the URL
// is already known from `invoice.trackingToken` with no server round-trip
// needed.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function TrackingQrCode({
  url,
  size = 72,
  className = '',
}: {
  url: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: size * 2 })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch(() => {
        // Non-critical — the link is still available via "Copier le lien".
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!dataUrl) return null;

  return (
    // Generated data URI, not an optimizable remote asset — plain <img> is correct here.
    <img
      src={dataUrl}
      alt="Code QR — scanner pour accéder au suivi en ligne"
      width={size}
      height={size}
      className={className}
    />
  );
}
