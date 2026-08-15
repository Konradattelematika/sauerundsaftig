import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Karten-Sektion (Frühstück, Kuchen, Brot, Schnecken, Kaffee) */
const menu = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/menu' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    intro: z.string(),
    order: z.number(),
    note: z.string().optional(),
    items: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        price: z.number().optional(),
        /** true = Preis ist Platzhalter, TODO(kunde) — im UI mit Hinweis rendern */
        priceIsPlaceholder: z.boolean().default(true),
        priceSuffix: z.string().optional(), // z. B. "pro Stück"
        veggie: z.boolean().default(false),
        vegan: z.boolean().default(false),
        allergens: z.array(z.string()).default([]),
        seasonal: z.string().optional(), // z. B. "nur samstags", "solange Vorrat"
        motif: z.string().optional(), // Bild-Registry-Key
        highlight: z.boolean().default(false),
      }),
    ),
  }),
});

const heuteFrisch = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/heute-frisch' }),
  schema: z.object({
    date: z.string(),
    items: z.array(
      z.object({
        name: z.string(),
        note: z.string().optional(), // z. B. "ofenfrisch ab 9:30"
        motif: z.string().optional(),
        soldOut: z.boolean().default(false),
      }),
    ).min(3).max(5),
  }),
});

const workshops = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/workshops' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    duration: z.string(), // "3,5 Stunden"
    price: z.number(),
    /** Preise/Termine sind Entwurf bis zur Kundenfreigabe (TODO(kunde)) */
    isDraft: z.boolean().default(true),
    level: z.enum(['Anfänger', 'Fortgeschritten', 'Alle']),
    capacity: z.number(),
    includes: z.array(z.string()),
    motif: z.string(),
    order: z.number(),
    dates: z.array(
      z.object({
        date: z.string(), // ISO
        time: z.string(), // "10:00"
        seatsLeft: z.number(),
      }),
    ),
  }),
});

const journal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    category: z.enum(['backstube', 'sauerteig', 'rerik']),
    motif: z.string(),
    order: z.number().default(0),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/faq' }),
  schema: z.object({
    question: z.string(),
    order: z.number(),
    todoKunde: z.string().optional(),
  }),
});

const testimonials = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/testimonials' }),
  schema: z.object({
    quote: z.string(),
    author: z.string(), // Vorname + Monat, z. B. "Sabine, Juli 2026"
    /** true = Platzhalter, echtes Google-Zitat muss noch eingesetzt werden */
    isPlaceholder: z.boolean().default(true),
    order: z.number(),
  }),
});

export const collections = { menu, heuteFrisch, workshops, journal, faq, testimonials };
