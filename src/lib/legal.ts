/**
 * Geteilte Rechtstexte — einmal gepflegt, in allen Varianten gerendert.
 * TODO(kunde): Betreiberdaten (Name, Rechtsform, USt-ID, Vertretungsberechtigte)
 * fehlen noch und MÜSSEN vor Launch eingesetzt werden.
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export const IMPRESSUM: LegalSection[] = [
  {
    heading: 'Angaben gemäß § 5 DDG',
    paragraphs: [
      'Sauer & Saftig — Café und Backstube',
      'TODO(kunde): Vollständiger Name der Betreiberin / des Betreibers bzw. Firmierung inkl. Rechtsform',
      'Dünenstraße 1, 18230 Ostseebad Rerik',
      'Telefon: 038296 769924',
      'TODO(kunde): E-Mail-Adresse',
    ],
  },
  {
    heading: 'Umsatzsteuer',
    paragraphs: ['TODO(kunde): USt-IdNr. gemäß § 27a UStG (falls vorhanden)'],
  },
  {
    heading: 'Verantwortlich für den Inhalt',
    paragraphs: ['TODO(kunde): Name und Anschrift der inhaltlich verantwortlichen Person'],
  },
  {
    heading: 'Streitschlichtung',
    paragraphs: [
      'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: https://ec.europa.eu/consumers/odr. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
    ],
  },
];

export const DATENSCHUTZ: LegalSection[] = [
  {
    heading: 'Datenschutz auf einen Blick',
    paragraphs: [
      'Diese Website ist eine statische Seite. Wir setzen keine Cookies, keine Analyse-Tools und keine Werbe-Tracker ein.',
      'Beim Aufruf der Seite verarbeitet unser Hosting-Server (Hetzner Online GmbH, Deutschland) technisch notwendige Zugriffsdaten (IP-Adresse, Zeitpunkt, aufgerufene Seite) in Server-Logs. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer Betrieb der Website).',
    ],
  },
  {
    heading: 'Verantwortliche Stelle',
    paragraphs: [
      'TODO(kunde): Name und Kontaktdaten der verantwortlichen Stelle (identisch mit Impressum).',
    ],
  },
  {
    heading: 'Kartendarstellung (OpenStreetMap)',
    paragraphs: [
      'Die Anfahrtskarte wird erst geladen, wenn du sie aktiv anklickst. Erst dann werden Kartendaten von OpenStreetMap (OpenStreetMap Foundation) abgerufen und dabei deine IP-Adresse übertragen. Ohne Klick findet keine Übertragung statt.',
    ],
  },
  {
    heading: 'Externe Links',
    paragraphs: [
      'Links zu Instagram, Google Maps und Too Good To Go führen zu externen Anbietern. Für deren Datenverarbeitung gelten die dortigen Datenschutzerklärungen.',
    ],
  },
  {
    heading: 'Formulare (Demo-Betrieb)',
    paragraphs: [
      'Vorbestellung, Workshop-Reservierung, Gutschein und Newsletter befinden sich im Demo-Betrieb: Eingaben werden derzeit nicht an uns übertragen und nicht gespeichert. Vor Aktivierung echter Bestell- und Versandfunktionen wird diese Erklärung aktualisiert. TODO(kunde): bei Anbindung (Shopify/Brevo o. ä.) ergänzen.',
    ],
  },
  {
    heading: 'Deine Rechte',
    paragraphs: [
      'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Beschwerde bei einer Aufsichtsbehörde (für MV: Landesbeauftragter für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern).',
    ],
  },
];
