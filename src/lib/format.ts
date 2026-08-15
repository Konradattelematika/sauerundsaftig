/** Formatter — Preise, Daten, Telefon. Zeitzone/Locale: Europe/Berlin, de-DE. */

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value).replace(/ /g, ' ');
}

/** Platzhalterpreise bekommen ein hochgestelltes ° — Legende auf der Seite erklärt es. */
export function formatMenuPrice(value: number | undefined, isPlaceholder: boolean, suffix?: string): string {
  if (value === undefined) return '';
  const base = formatPrice(value);
  return `${base}${isPlaceholder ? '°' : ''}${suffix ? ` ${suffix}` : ''}`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...opts,
  }).format(new Date(`${iso}T12:00:00+01:00`));
}

export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${iso}T12:00:00+01:00`));
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

/** Google-Maps-Routenlink (kein iFrame — reiner Deeplink, DSGVO-unkritisch). */
export function routeHref(street: string, zip: string, city: string): string {
  const q = encodeURIComponent(`${street}, ${zip} ${city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
