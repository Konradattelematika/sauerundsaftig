/**
 * Benutzerverwaltung (Recht users.manage): Liste, anlegen (Admin/Redaktion), Passwort setzen, Zugang entfernen.
 * Server-Vertrag (server/lib/cms/users.mjs): Benutzer aus der Server-Konfiguration (source 'env') lassen sich
 * hier nur im Passwort ändern; im Dashboard angelegte (source 'dashboard') vollständig. Ein „Deaktivieren“
 * kennt der Server nicht — ein Zugang wird entfernt (und kann jederzeit neu angelegt werden).
 */
import { api, ApiError, type CmsUser } from '../api';
import { add, h, domId } from '../dom';
import { store } from '../state';
import { badge, btn, card, confirmDialog, emptyState, loading, notice, openDialog, pageHeader, toast } from '../ui';
import { formatDateTime, slugify } from '../util';

const ROLES: [string, string, string][] = [
  ['redaktion', 'Redaktion', 'Darf alle Inhalte bearbeiten und veröffentlichen, aber keine Benutzer verwalten.'],
  ['admin', 'Admin', 'Darf alles, auch Benutzer anlegen und entfernen.'],
];
const USER_ID_RE = /^[a-z0-9_-]{1,32}$/;
const PASSWORD_MIN = 10;

const roleName = (r: string) => (r === 'redaktion' ? 'Redaktion' : r === 'admin' || r === 'team' || r === 'inhaberin' ? 'Admin' : r);
const fromEnv = (u: CmsUser) => u.source === 'env';

function generatePassword(): string {
  const words = ['Krume', 'Kruste', 'Sauerteig', 'Ostsee', 'Rerik', 'Schnecke', 'Duene', 'Salzhaff', 'Ofen', 'Mehl', 'Roggen', 'Dinkel'];
  const rnd = new Uint32Array(4);
  crypto.getRandomValues(rnd);
  return `${words[rnd[0] % words.length]}-${words[rnd[1] % words.length]}-${(rnd[2] % 900) + 100}-${words[rnd[3] % words.length]}`;
}

function passwordInput(id: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { id, class: 'ad-input', type: 'text', autocomplete: 'new-password', minlength: String(PASSWORD_MIN), spellcheck: 'false' });
  const gen = btn('Vorschlagen', { kind: 'quiet', small: true, onClick: () => (input.value = generatePassword()) });
  return { wrap: h('div', { class: 'ad-inline' }, input, gen), input };
}

export function renderUsers(root: HTMLElement): void {
  if (!store.can('users.manage')) {
    root.append(h('div', { class: 'ad-viewpad' }, pageHeader('Benutzer'), notice('warn', h('p', null, 'Dafür fehlt dir die Berechtigung.'))));
    return;
  }
  const list = h('div', { class: 'ad-table ad-table--users', role: 'table', 'aria-label': 'Benutzer' }, loading('Lade Benutzer …'));
  let users: CmsUser[] = [];

  const load = async () => {
    try {
      users = await api.users();
      render();
    } catch (e) {
      list.replaceChildren(notice('error', h('p', null, e instanceof ApiError ? e.message : 'Benutzer konnten nicht geladen werden.')));
    }
  };

  const remove = async (u: CmsUser) => {
    const ok = await confirmDialog({
      title: `Zugang von ${u.name || u.id} entfernen?`,
      message: 'Die Person kann sich danach nicht mehr anmelden; laufende Sitzungen enden. Inhalte, die sie bearbeitet hat, bleiben erhalten. Bei Bedarf legst du den Zugang einfach neu an.',
      confirm: 'Zugang entfernen',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      toast('Zugang entfernt.', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Entfernen fehlgeschlagen.', 'error', 8000);
    }
  };

  const render = () => {
    list.replaceChildren(
      h(
        'div',
        { class: 'ad-row ad-row--head', role: 'row' },
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Name'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Rolle'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Herkunft'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Aktionen')),
      ),
      ...users.map((u) => {
        const self = u.id === store.me.id;
        return h(
          'div',
          { class: 'ad-row', role: 'row' },
          h('div', { class: 'ad-cell ad-cell--main', role: 'cell' }, h('span', { class: 'ad-row__title' }, u.name || u.id, self ? ' (du)' : ''), h('span', { class: 'ad-row__sub' }, `Anmeldename: ${u.id}`)),
          h('div', { class: 'ad-cell', role: 'cell' }, roleName(u.role)),
          h(
            'div',
            { class: 'ad-cell', role: 'cell' },
            fromEnv(u) ? badge('Server-Konfiguration', 'info') : badge('im Dashboard angelegt', 'neutral'),
            u.createdAt ? h('span', { class: 'ad-row__sub' }, `seit ${formatDateTime(u.createdAt)}`) : null,
          ),
          h(
            'div',
            { class: 'ad-cell ad-cell--actions', role: 'cell' },
            btn(fromEnv(u) ? 'Passwort setzen' : 'Bearbeiten', { kind: 'quiet', small: true, icon: fromEnv(u) ? 'key' : 'edit', onClick: () => editUser(u) }),
            !self && !fromEnv(u) ? btn('Entfernen', { kind: 'quiet', small: true, icon: 'trash', onClick: () => void remove(u) }) : null,
          ),
        );
      }),
    );
    if (!users.length) list.append(emptyState('Keine Benutzer gefunden.'));
  };

  const editUser = (u?: CmsUser) => {
    const envUser = Boolean(u && fromEnv(u));
    const d = openDialog({ title: u ? (envUser ? `Passwort für ${u.name || u.id}` : `Benutzer: ${u.name || u.id}`) : 'Neuen Benutzer anlegen', size: 'md' });
    const nameId = domId();
    const idId = domId();
    const pwId = domId();
    const name = h('input', { id: nameId, class: 'ad-input', type: 'text', value: u?.name ?? '', autocomplete: 'off', readonly: envUser });
    const login = h('input', { id: idId, class: 'ad-input', type: 'text', value: u?.id ?? '', autocomplete: 'off', spellcheck: 'false', readonly: Boolean(u) });
    let loginTouched = Boolean(u);
    name.addEventListener('input', () => {
      if (!loginTouched) login.value = slugify(name.value.split(' ')[0] ?? '', 32);
    });
    login.addEventListener('input', () => (loginTouched = true));
    const pw = passwordInput(pwId);
    const roleGroup = `role-${domId()}`;
    const current = u ? (u.role === 'redaktion' ? 'redaktion' : 'admin') : 'redaktion';
    const roles = envUser
      ? null
      : h(
          'fieldset',
          { class: 'ad-field' },
          h('legend', { class: 'ad-label' }, 'Rolle'),
          ...ROLES.map(([value, label, help]) => {
            const id = domId();
            return h(
              'label',
              { class: 'ad-typecard', for: id },
              h('input', { id, type: 'radio', name: roleGroup, value, checked: current === value, disabled: u?.id === store.me.id }),
              h('span', null, h('strong', null, label), h('small', null, help)),
            );
          }),
          u?.id === store.me.id ? h('p', { class: 'ad-help' }, 'Deine eigene Rolle kann nur ein anderer Admin ändern.') : null,
        );
    const err = h('div', { 'aria-live': 'polite' });
    add(
      d.body,
      envUser ? notice('info', h('p', null, 'Dieser Zugang steht in der Server-Konfiguration. Name und Rolle lassen sich nur dort ändern — hier kannst du ein neues Passwort setzen (z. B. wenn es vergessen wurde).')) : null,
      h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: nameId }, 'Name'), name),
      h(
        'div',
        { class: 'ad-field' },
        h('label', { class: 'ad-label', for: idId }, 'Anmeldename'),
        h('p', { class: 'ad-help' }, u ? 'Kann nicht geändert werden.' : 'Damit meldet sich die Person an: Kleinbuchstaben, Ziffern, _ und -, ohne Leerzeichen.'),
        login,
      ),
      roles,
      h(
        'div',
        { class: 'ad-field' },
        h('label', { class: 'ad-label', for: pwId }, u ? 'Neues Passwort' + (envUser ? '' : ' (optional)') : 'Passwort'),
        h(
          'p',
          { class: 'ad-help' },
          `Mindestens ${PASSWORD_MIN} Zeichen. ${u && !envUser ? 'Leer lassen = Passwort bleibt. ' : ''}Gib es der Person persönlich weiter — sie kann es danach unter „Passwort ändern“ selbst ändern. Bestehende Anmeldungen enden.`,
        ),
        pw.wrap,
      ),
      err,
    );
    const save = btn(u ? 'Speichern' : 'Anlegen', { kind: 'primary' });
    d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close() }), save);
    (envUser ? pw.input : name).focus();
    save.addEventListener('click', async () => {
      const role = (d.body.querySelector(`input[name="${roleGroup}"]:checked`) as HTMLInputElement | null)?.value ?? current;
      const problems: string[] = [];
      if (!envUser && !name.value.trim()) problems.push('Bitte einen Namen angeben.');
      if (!u && !USER_ID_RE.test(login.value)) problems.push('Anmeldename: 1–32 Zeichen, nur a–z, 0–9, _ und -.');
      if ((!u || envUser || pw.input.value) && [...pw.input.value].length < PASSWORD_MIN) problems.push(`Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`);
      if (problems.length) {
        err.replaceChildren(notice('error', ...problems.map((p) => h('p', null, p))));
        return;
      }
      save.disabled = true;
      try {
        if (u) {
          const patch: Record<string, unknown> = {};
          if (!envUser) {
            patch.name = name.value.trim();
            if (u.id !== store.me.id) patch.role = role;
          }
          if (pw.input.value) patch.password = pw.input.value;
          await api.patchUser(u.id, patch);
          toast(pw.input.value ? 'Gespeichert — das neue Passwort gilt ab sofort.' : 'Gespeichert.', 'ok');
        } else {
          await api.createUser({ id: login.value, name: name.value.trim(), role, password: pw.input.value });
          toast(`${name.value.trim()} angelegt.`, 'ok');
        }
        d.close();
        await load();
      } catch (e) {
        save.disabled = false;
        err.replaceChildren(notice('error', h('p', null, e instanceof ApiError ? e.message : 'Speichern fehlgeschlagen.')));
      }
    });
  };

  root.append(
    h(
      'div',
      { class: 'ad-viewpad ad-viewpad--narrow' },
      pageHeader('Benutzer', 'Wer darf die Inhalte bearbeiten? Neue Personen bekommen ein Passwort, das sie nach der ersten Anmeldung selbst ändern können.', btn('Benutzer anlegen', { kind: 'primary', icon: 'plus', onClick: () => editUser() })),
      card(list),
    ),
  );
  void load();
}
