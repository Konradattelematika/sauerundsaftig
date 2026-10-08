/** Gleichlauf des Browser-Spiegels (src/admin/rich.ts) mit dem Build-Renderer (src/cms/rich.mjs). */
import { describe, expect, it } from 'vitest';
import * as server from '../cms/rich.mjs';
import { resolveHref as serverResolve } from '../cms/store.mjs';
import * as client from './rich';
import type { SiteDoc } from '../cms/types';

const doc = {
  settings: {
    phone: '+49 38296 769924',
    phoneDisplay: '038296 769924',
    email: 'hallo@example.org',
    name: 'Sauer & Saftig',
    address: { street: 'Dünenstraße 1', zip: '18230', city: 'Ostseebad Rerik' },
    breakfastUntil: '12:00',
    instagram: 'sauerundsaftig',
  },
  pages: [
    { id: 'start', slug: '' },
    { id: 'besuch', slug: 'besuch' },
    { id: 'schnecken', slug: 'karte/schnecken' },
  ],
} as unknown as SiteDoc;

const samples = [
  '',
  'Einfacher Text',
  'Zeile eins\nZeile zwei',
  'Absatz eins\n\nAbsatz **zwei** mit *kursiv*',
  '[Besuch](page:besuch) und [Anker](page:besuch#karte) und [Schnecken](page:schnecken)',
  '[Extern](https://example.org/a?b=1&c=2) · [Mail](mailto:a@b.de) · [Tel]({{tel}}) · [Route]({{route}})',
  'Ruf an: {{phoneDisplay}} bis {{breakfastUntil}} · {{unbekannt}}',
  '<script>alert(1)</script> & "Zitat" \'x\'',
  '[böse](javascript:alert(1)) [fehlt](page:gibtsnicht) [**fett** im Link](/karte)',
  '*a* **b** ***c*** 2*3*4',
];

describe('admin/rich.ts = cms/rich.mjs', () => {
  for (const s of samples) {
    it(`renderRich ${JSON.stringify(s).slice(0, 40)}`, () => {
      for (const opts of [{}, { blocks: true }, { blocks: true, linkClass: 'link-ul', pClass: 'mt-2' }]) {
        expect(client.renderRich(s, doc, opts)).toBe(server.renderRich(s, doc, opts));
      }
      expect(client.plainText(s, doc)).toBe(server.plainText(s, doc));
      expect(client.fillTokens(s, doc.settings)).toBe(server.fillTokens(s, doc.settings));
    });
  }
  it('resolveHref', () => {
    for (const h of ['page:besuch', 'page:schnecken#x', 'page:nix', '{{tel}}', '{{route}}', '/a', 'https://x.de', '', 'mailto:a@b']) {
      expect(client.resolveHref(h, doc)).toBe(serverResolve(h, doc));
    }
  });
});
