/**
 * Geteilte Rechtstexte — einmal gepflegt, in allen Varianten gerendert.
 * Betreiberdaten: Josephine Almstädt (Inhaberin, keine Handelsregister-Eintragung), Stand 08.10.2026.
 * Offen (Kunde): E-Mail-Adresse für § 5 Abs. 1 Nr. 2 DDG, ggf. USt-IdNr. — siehe Checkliste.
 * Technischer Stand der Datenschutzerklärung: Node-Server bei Hetzner (Falkenstein), keine Analyse,
 * selbst gehostete Schriften, Karte (OpenStreetMap) erst nach Klick, Instagram-Bilder lokal,
 * Login-Cookie nur für den internen Zugang.
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export const OPERATOR = {
  name: 'Josephine Almstädt',
  business: 'Sauer & Saftig — Café und Backstube',
  street: 'Mittelallee 3',
  zipCity: '18230 Rerik',
  phone: '038296 769924',
} as const;

export const IMPRESSUM: LegalSection[] = [
  {
    heading: 'Angaben gemäß § 5 DDG',
    paragraphs: [
      OPERATOR.business,
      `Inhaberin: ${OPERATOR.name}`,
      `${OPERATOR.street}, ${OPERATOR.zipCity}`,
      'Café: Dünenstraße 1, 18230 Ostseebad Rerik',
    ],
  },
  {
    heading: 'Kontakt',
    paragraphs: [`Telefon: ${OPERATOR.phone}`],
  },
  {
    heading: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
    paragraphs: [`${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.zipCity}`],
  },
  {
    heading: 'Verbraucherstreitbeilegung',
    paragraphs: [
      'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
    ],
  },
  {
    heading: 'Haftung für Inhalte und Links',
    paragraphs: [
      'Die Inhalte dieser Website erstellen wir mit Sorgfalt. Für Inhalte externer Websites, auf die wir verlinken (z. B. Instagram), sind ausschließlich deren Betreiber verantwortlich. Werden uns Rechtsverletzungen bekannt, entfernen wir die betreffenden Inhalte oder Links umgehend.',
    ],
  },
];

export const DATENSCHUTZ: LegalSection[] = [
  {
    heading: 'Verantwortliche',
    paragraphs: [
      `${OPERATOR.name}, ${OPERATOR.business}`,
      `${OPERATOR.street}, ${OPERATOR.zipCity}`,
      `Telefon: ${OPERATOR.phone}`,
    ],
  },
  {
    heading: 'Datenschutz auf einen Blick',
    paragraphs: [
      'Wir setzen auf dieser Website keine Analyse-Tools, keine Werbe-Tracker und keine Social-Media-Plugins ein. Schriften werden von unserem eigenen Server geladen, nicht von Drittanbietern.',
    ],
  },
  {
    heading: 'Hosting und Server-Logs',
    paragraphs: [
      'Die Website läuft auf einem Server der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, im Rechenzentrum Falkenstein (Deutschland). Beim Aufruf verarbeitet der Server technisch notwendige Zugriffsdaten: IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser-Kennung und Statuscode.',
      'Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — unser berechtigtes Interesse an einem sicheren und stabilen Betrieb. Die Daten werden nur so lange gespeichert, wie es dafür nötig ist, und nicht mit anderen Daten zusammengeführt.',
    ],
  },
  {
    heading: 'Cookies',
    paragraphs: [
      'Für Besucherinnen und Besucher setzen wir keine Cookies. Nur wer sich für den internen Bereich anmeldet (Team), erhält ein technisch notwendiges Sitzungs-Cookie („sus_session“, Laufzeit bis zu 30 Tage), das die Anmeldung speichert (§ 25 Abs. 2 Nr. 2 TDDDG, Art. 6 Abs. 1 lit. f DSGVO).',
    ],
  },
  {
    heading: 'Kartendarstellung (OpenStreetMap)',
    paragraphs: [
      'Die Anfahrtskarte wird erst geladen, wenn du sie aktiv anklickst. Erst dann werden Kartendaten von der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Großbritannien) abgerufen und dabei deine IP-Adresse übertragen. Rechtsgrundlage ist deine Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO). Für Großbritannien besteht ein Angemessenheitsbeschluss der EU-Kommission. Ohne Klick findet keine Übertragung statt.',
    ],
  },
  {
    heading: 'Instagram und externe Links',
    paragraphs: [
      'Die Instagram-Beiträge auf unserer Website sind als Bilder auf unserem eigenen Server gespeichert; beim Ansehen wird keine Verbindung zu Instagram aufgebaut. Erst wenn du einem Link zu Instagram, Google Maps oder einem anderen externen Angebot folgst, verlässt du unsere Website — dann gelten die Datenschutzhinweise des jeweiligen Anbieters.',
    ],
  },
  {
    heading: 'Kontakt per Telefon',
    paragraphs: [
      'Wenn du uns anrufst, etwa für eine Reservierung oder eine Tortenbestellung, verarbeiten wir deine Angaben nur, um dein Anliegen zu bearbeiten (Art. 6 Abs. 1 lit. b DSGVO), und löschen sie, sobald sie dafür nicht mehr gebraucht werden und keine gesetzlichen Aufbewahrungspflichten bestehen.',
    ],
  },
  {
    heading: 'Formulare',
    paragraphs: [
      'Die Formulare für Vorbestellung, Gutscheine und Newsletter sind noch nicht in Betrieb: Eingaben werden derzeit weder an uns übertragen noch gespeichert. Bevor sie aktiviert werden, ergänzen wir diese Erklärung.',
    ],
  },
  {
    heading: 'Deine Rechte',
    paragraphs: [
      'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen.',
      'Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Landesbeauftragten für Datenschutz und Informationsfreiheit Mecklenburg-Vorpommern, Werderstraße 74a, 19055 Schwerin.',
    ],
  },
];
