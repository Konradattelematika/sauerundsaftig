/** Export aller Daten als JSON-Objekt bzw. Markdown (offenes Feedback zuerst). */
import { PHASES, PRIORITIES, STATUSES } from './model.mjs';

const BERLIN = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO-Zeit → „07.10.2026, 10:30" (Europe/Berlin). */
export function berlinTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return BERLIN.format(d);
}

const PHASE_LABEL = { vor: 'Vor Go-Live', nach: 'Nach Go-Live' };
const STATUS_LABEL = { offen: 'offen', in_arbeit: 'in Arbeit', erledigt: 'erledigt', verworfen: 'verworfen' };
const KIND_LABEL = { feedback: 'Feedback', frage: 'Frage', antwort: 'Antwort' };
const RATING_LABEL = { nein: 'Nein', gut: 'Gut', super: 'Super gut' };

export function buildExport({ checklist, module }, { now, goLiveAt, live }) {
  return {
    exportedAt: now.toISOString(),
    goLiveAt: goLiveAt ? goLiveAt.toISOString() : null,
    live,
    checklist: { items: checklist.items, comments: checklist.comments },
    module: { votes: module.votes, choices: module.choices },
  };
}

/** Mehrzeiligen Text für Markdown-Listen einrücken. */
function indent(text, pad) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .join(`\n${pad}`);
}

function byTime(a, b) {
  return String(a.createdAt ?? a.updatedAt).localeCompare(String(b.createdAt ?? b.updatedAt));
}

function commentLine(c, pad = '') {
  const state = c.resolved ? 'erledigt' : 'offen';
  const who = c.userName || c.userId;
  return `${pad}- [${state}] ${KIND_LABEL[c.kind] ?? c.kind} · ${who} · ${berlinTime(c.createdAt)}: ${indent(c.text, `${pad}  `)}`;
}

function itemSort(a, b) {
  return (
    PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) ||
    STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
    byTime(a, b)
  );
}

export function buildMarkdown({ checklist, module }, { now, goLiveAt, live }) {
  const L = [];
  L.push('# Sauer & Saftig — Export', '');
  L.push(
    `Stand: ${berlinTime(now.toISOString())} (Europe/Berlin) · Go-Live: ${goLiveAt ? berlinTime(goLiveAt.toISOString()) : '—'} · Website: ${live ? 'öffentlich' : 'privat'}`,
    '',
  );

  /* ---------------- Checkliste ---------------- */
  const items = [...checklist.items].sort(itemSort);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const commentsByItem = new Map();
  for (const c of [...checklist.comments].sort(byTime)) {
    if (!commentsByItem.has(c.itemId)) commentsByItem.set(c.itemId, []);
    commentsByItem.get(c.itemId).push(c);
  }

  L.push('## Checkliste', '');
  const open = checklist.comments.filter((c) => !c.resolved);
  L.push(`### Offenes Feedback (${open.length})`, '');
  if (!open.length) {
    L.push('_Kein offenes Feedback._', '');
  } else {
    const openItemIds = [...new Set(open.map((c) => c.itemId))].sort((a, b) => {
      const ia = itemById.get(a);
      const ib = itemById.get(b);
      return ia && ib ? itemSort(ia, ib) : ia ? -1 : ib ? 1 : 0;
    });
    for (const id of openItemIds) {
      const item = itemById.get(id);
      L.push(`#### ${item ? item.title : `(gelöschter Punkt ${id})`}${item ? ` · ${STATUS_LABEL[item.status] ?? item.status}` : ''}`, '');
      for (const c of (commentsByItem.get(id) ?? []).filter((x) => !x.resolved)) L.push(commentLine(c));
      L.push('');
    }
  }

  L.push('### Alle Punkte', '');
  if (!items.length) L.push('_Noch keine Punkte._', '');
  for (const phase of PHASES) {
    const inPhase = items.filter((i) => i.phase === phase);
    if (!inPhase.length) continue;
    L.push(`#### ${PHASE_LABEL[phase]} (${inPhase.length})`, '');
    for (const item of inPhase) {
      L.push(`##### ${item.title}`, '');
      const meta = [
        `Status: ${STATUS_LABEL[item.status] ?? item.status}`,
        `Priorität: ${item.priority}`,
        `Zuständig: ${item.owner}${item.assignee ? ` (${item.assignee})` : ''}`,
        `Kategorie: ${item.category}`,
      ];
      L.push(`- ${meta.join(' · ')}`);
      L.push(`- Zuletzt geändert: ${berlinTime(item.updatedAt)} von ${item.updatedBy}`);
      if (item.link) L.push(`- Link: ${item.link}`);
      if (item.description) L.push(`- Beschreibung: ${indent(item.description, '  ')}`);
      const comments = commentsByItem.get(item.id) ?? [];
      if (comments.length) {
        L.push('- Kommentare:');
        for (const c of comments) L.push(commentLine(c, '  '));
      }
      L.push('');
    }
  }

  /* ---------------- Module ---------------- */
  L.push('## Module', '');
  const moduleIds = [...new Set([...module.votes.map((v) => v.itemId), ...module.choices.map((c) => c.itemId)])].sort();
  if (!moduleIds.length) L.push('_Noch keine Bewertungen oder Entscheidungen._', '');
  for (const itemId of moduleIds) {
    L.push(`### ${itemId}`, '');
    const choice = module.choices.find((c) => c.itemId === itemId);
    L.push(
      choice
        ? `- Entscheidung: **${choice.optionId}** (${choice.userName || choice.userId}, ${berlinTime(choice.updatedAt)})`
        : '- Entscheidung: noch offen',
    );
    const votes = module.votes.filter((v) => v.itemId === itemId);
    const rated = votes.filter((v) => v.rating);
    if (rated.length) {
      L.push('- Bewertungen:');
      const options = [...new Set(rated.map((v) => v.optionId))].sort();
      for (const opt of options) {
        const list = rated
          .filter((v) => v.optionId === opt)
          .map((v) => `${v.userName || v.userId}: ${RATING_LABEL[v.rating] ?? v.rating}`)
          .join(' · ');
        L.push(`  - ${opt}: ${list}`);
      }
    }
    const commented = votes.filter((v) => v.comment && v.comment.trim()).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
    if (commented.length) {
      L.push('- Kommentare:');
      for (const v of commented) {
        L.push(`  - ${v.optionId} · ${v.userName || v.userId} · ${berlinTime(v.updatedAt)}: ${indent(v.comment, '    ')}`);
      }
    }
    L.push('');
  }

  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
