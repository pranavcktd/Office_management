export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Best-effort browser geolocation capture for a self-punch. Resolves to null (never rejects) on
 * denied permission, an insecure origin (geolocation requires HTTPS or localhost), an unsupported
 * browser, or a timeout — a punch must never be blocked just because location wasn't available. */
export function captureLocation(timeoutMs = 8000): Promise<CapturedLocation | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

export function mapLink(loc: CapturedLocation): string {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
}
