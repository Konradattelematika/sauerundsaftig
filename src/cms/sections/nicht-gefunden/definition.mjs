/**
 * Sektion „Seite nicht gefunden" — zentrierter Hinweis der 404-Seite (H1, Text, Buttons).
 * Nur auf der Systemseite `nicht-gefunden` (Route src/pages/404.astro).
 */
import { buttonsField } from '../cover/definition.mjs';

/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'nicht-gefunden',
  label: 'Hinweis „Seite nicht gefunden"',
  description: 'Zentrierte Überschrift mit kurzem Text und Buttons für die 404-Seite.',
  allowedOn: ['nicht-gefunden'],
  fields: [
    { key: 'eyebrow', label: 'Dachzeile', kind: 'text', maxLength: 40 },
    { key: 'title', label: 'Überschrift (H1)', kind: 'textarea', required: true, maxLength: 160 },
    { key: 'text', label: 'Text', kind: 'rich', maxLength: 600, help: '**fett**, *kursiv*, [Linktext](page:seite)' },
    buttonsField,
  ],
  defaults: () => ({
    eyebrow: '404',
    title: 'Diese Seite gibt es nicht.',
    text: '',
    buttons: [{ link: { label: 'Zur Startseite', href: 'page:start', variant: 'secondary' }, icon: '' }],
  }),
};
