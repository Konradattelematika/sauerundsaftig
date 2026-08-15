/** JSON-LD-Builder für alle Seitentypen (Master-Prompt §10 SEO). */
import site from '../data/site.json';
import type { Schedule, WeekKey } from './opening-hours';

const DAY_MAP: Record<WeekKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export function localBusiness(siteUrl: string) {
  const schedule = site.openingHours as unknown as Schedule;
  const spec = (Object.keys(DAY_MAP) as WeekKey[])
    .filter((k) => (schedule.week[k] ?? []).length > 0)
    .flatMap((k) =>
      (schedule.week[k] ?? []).map(([opens, closes]) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAY_MAP[k],
        opens,
        closes,
      })),
    );
  return {
    '@context': 'https://schema.org',
    '@type': ['Bakery', 'CafeOrCoffeeShop'],
    name: site.name,
    url: siteUrl,
    telephone: site.phone,
    priceRange: site.priceRange,
    servesCuisine: 'Café, Backwaren, Frühstück',
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      postalCode: site.address.zip,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      addressCountry: site.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: site.geo.lat, longitude: site.geo.lng },
    openingHoursSpecification: spec,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: site.rating.value,
      reviewCount: site.rating.count,
    },
    sameAs: [`https://www.instagram.com/${site.instagram}/`],
  };
}

interface MenuItemData {
  name: string;
  description?: string;
  price?: number;
  priceIsPlaceholder?: boolean;
}
interface MenuSectionData {
  title: string;
  items: MenuItemData[];
}

/** Menu-Schema. Platzhalterpreise werden NICHT ausgegeben (keine falschen Fakten an Google). */
export function menuSchema(sections: MenuSectionData[], siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: `Karte — ${site.name}`,
    url: `${siteUrl}/karte`,
    hasMenuSection: sections.map((s) => ({
      '@type': 'MenuSection',
      name: s.title,
      hasMenuItem: s.items.map((i) => ({
        '@type': 'MenuItem',
        name: i.name,
        ...(i.description ? { description: i.description } : {}),
        ...(i.price !== undefined && !i.priceIsPlaceholder
          ? { offers: { '@type': 'Offer', price: i.price.toFixed(2), priceCurrency: 'EUR' } }
          : {}),
      })),
    })),
  };
}

export function workshopEvent(w: {
  title: string; subtitle: string; price: number; isDraft: boolean;
  date: string; time: string; duration: string; url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${w.title} — Backkurs bei ${site.name}`,
    description: w.subtitle,
    startDate: `${w.date}T${w.time}:00+02:00`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: site.name,
      address: { '@type': 'PostalAddress', streetAddress: site.address.street, postalCode: site.address.zip, addressLocality: site.address.city },
    },
    ...(w.isDraft ? {} : { offers: { '@type': 'Offer', price: w.price.toFixed(2), priceCurrency: 'EUR', url: w.url } }),
  };
}

export function faqPage(entries: { question: string; answerHtml: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: { '@type': 'Answer', text: e.answerHtml },
    })),
  };
}

export function article(a: { title: string; description: string; date: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    datePublished: a.date,
    url: a.url,
    publisher: { '@type': 'Organization', name: site.name },
  };
}

export function breadcrumbs(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}
