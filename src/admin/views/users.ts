/** Benutzerverwaltung (Recht users.manage): Liste, anlegen (admin/redaktion), Passwort setzen, deaktivieren. */
import { api, ApiError, type CmsUser } from '../api';
import { h, domId } from '../dom';
import { store } from '../state';
import { badge, btn, card, confirmDialog, emptyState, loading, notice, openDialog, pageHeader, toast } from '../ui';
import { formatDateTime, slugify } from '../util';

const ROLES: [string, string, string][] = [
  ['redaktion', 'Redaktion', 'Darf alle Inhalte bearbeiten und veröffentlichen, aber keine Benutzer verwalten.'],
  ['admin', 'Admin', 'Darf alles, auch Benutzer anlegen und deaktivieren.'],
];

const roleName = (r: string) => (r === 'redaktion' ? 'Redaktion' : r === 'admin' || r === 'team' || r === 'inhaberin' ? 'Admin' : r);
const isDisabled = (u: CmsUser) => u.disabled === true || u.active === false;

function generatePassword(): string {
  const words = ['Krume', 'Kruste', 'Sauerteig', 'Ostsee', 'Rerik', 'Schnecke', 'Duene', 'Salzhaff', 'Ofen', 'Mehl', 'Roggen', 'Dinkel'];
  const rnd = new Uint32Array(4);
  crypto.getRandomValues(rnd);
  return `${words[rnd[0] % words.length]}-${words[rnd[1] % words.length]}-${(rnd[2] % 900) + 100}-${words[rnd[3] % words.length]}`;
}

function passwordInput(id: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { id, class: 'ad-input', type: 'text', autocomplete: 'new-password', minlength: '10', spellcheck: 'false' });
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

  const render = () => {
    list.replaceChildren(
      h(
        'div',
        { class: 'ad-row ad-row--head', role: 'row' },
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Name'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Rolle'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, 'Status'),
        h('span', { class: 'ad-cell', role: 'columnheader' }, h('span', { class: 'sr-only' }, 'Aktionen')),
      ),
      ...users.map((u) => {
        const self = u.id === store.me.id;
        return h(
          'div',
          { class: `ad-row${isDisabled(u) ? ' is-muted' : ''}`, role: 'row' },
          h('div', { class: 'ad-cell ad-cell--main', role: 'cell' }, h('span', { class: 'ad-row__title' }, u.name || u.id, self ? ' (du)' : ''), h('span', { class: 'ad-row__sub' }, `Anmeldename: ${u.id}`)),
          h('div', { class: 'ad-cell', role: 'cell' }, roleName(u.role)),
          h(
            'div',
            { class: 'ad-cell', role: 'cell' },
            isDisabled(u) ? badge('deaktiviert', 'neutral') : badge('aktiv', 'ok'),
            u.lastLoginAt ? h('span', { class: 'ad-row__sub' }, `zuletzt da: ${formatDateTime(u.lastLoginAt)}`) : null,
          ),
          h(
            'div',
            { class: 'ad-cell ad-cell--actions', role: 'cell' },
            btn('Bearbeiten', { kind: 'quiet', small: true, icon: 'edit', onClick: () => editUser(u) }),
            !self
              ? btn(isDisabled(u) ? 'Aktivieren' : 'Deaktivieren', {
                  kind: 'quiet',
                  small: true,
                  onClick: async () => {
                    const disable = !isDisabled(u);
                    if (disable && !(await confirmDialog({ title: `${u.name || u.id} deaktivieren?`, message: 'Die Person kann sich danach nicht mehr anmelden. Das lässt sich jederzeit rückgängig machen.', confirm: 'Deaktivieren', danger: true }))) return;
                    try {
                      await api.patchUser(u.id, { disabled: disable });
                      toast(disable ? 'Benutzer deaktiviert.' : 'Benutzer aktiviert.', 'ok');
                      await load();
                    } catch (e) {
                      toast(e instanceof ApiError ? e.message : 'Änderung fehlgeschlagen.', 'error');
                    }
                  },
                })
              : null,
          ),
        );
      }),
    );
    if (!users.length) list.append(emptyState('Keine Benutzer gefunden.'));
  };

  const editUser = (u?: CmsUser) => {
    const d = openDialog({ title: u ? `Benutzer: ${u.name || u.id}` : 'Neuen Benutzer anlegen', size: 'md' });
    const nameId = domId();
    const idId = domId();
    const pwId = domId();
    const name = h('input', { id: nameId, class: 'ad-input', type: 'text', value: u?.name ?? '', autocomplete: 'off' });
    const login = h('input', { id: idId, class: 'ad-input', type: 'text', value: u?.id ?? '', autocomplete: 'off', spellcheck: 'false', readonly: Boolean(u) });
    let loginTouched = Boolean(u);
    name.addEventListener('input', () => {
      if (!loginTouched) login.value = slugify(name.value.split(' ')[0] ?? '', 30);
    });
    login.addEventListener('input', () => (loginTouched = true));
    const pw = passwordInput(pwId);
    const roleName2 = `role-${domId()}`;
    const roles = h(
      'fieldset',
      { class: 'ad-field' },
      h('legend', { class: 'ad-label' }, 'Rolle'),
      ...ROLES.map(([value, label, help]) => {
        const id = domId();
        return h(
          'label',
          { class: 'ad-typecard', for: id },
          h('input', { id, type: 'radio', name: roleName2, value, checked: (u ? (u.role === 'redaktion' ? 'redaktion' : 'admin') : 'redaktion') === value, disabled: u?.id === store.me.id }),
          h('span', null, h('strong', null, label), h('small', null, help)),
        );
      }),
    );
    const err = h('div', { 'aria-live': 'polite' });
    d.body.append(
      h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: nameId }, 'Name'), name),
      h('div', { class: 'ad-field' }, h('label', { class: 'ad-label', for: idId }, 'Anmeldename'), h('p', { class: 'ad-help' }, u ? 'Kann nicht geändert werden.' : 'Damit meldet sich die Person an. Kleinbuchstaben, ohne Leerzeichen.'), login),
      roles,
      h(
        'div',
        { class: 'ad-field' },
        h('label', { class: 'ad-label', for: pwId }, u ? 'Neues Passwort (optional)' : 'Passwort'),
        h('p', { class: 'ad-help' }, `Mindestens 10 Zeichen. ${u ? 'Leer lassen = Passwort bleibt.' : ''} Gib es der Person persönlich weiter — sie kann es danach unter „Passwort ändern“ selbst ändern.`),
        pw.wrap,
      ),
      err,
    );
    const save = btn(u ? 'Speichern' : 'Anlegen', { kind: 'primary' });
    d.footer.append(btn('Abbrechen', { kind: 'quiet', onClick: () => d.close() }), save);
    name.focus();
    save.addEventListener('click', async () => {
      const role = (d.body.querySelector(`input[name="${roleName2}"]:checked`) as HTMLInputElement | null)?.value ?? 'redaktion';
      const problems: string[] = [];
      if (!name.value.trim()) problems.push('Bitte einen Namen angeben.');
      if (!u && !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(login.value)) problems.push('Anmeldename: 2–32 Kleinbuchstaben/Ziffern, ohne Leerzeichen.');
      if ((!u || pw.input.value) && pw.input.value.length < 10) problems.push('Das Passwort braucht mindestens 10 Zeichen.');
      if (problems.length) {
        err.replaceChildren(notice('error', ...problems.map((p) => h('p', null, p))));
        return;
      }
      save.disabled = true;
      try {
        if (u) {
          const patch: Record<string, unknown> = { name: name.value.trim() };
          if (u.id !== store.me.id) patch.role = role;
          if (pw.input.value) patch.password = pw.input.value;
          await api.patchUser(u.id, patch);
          toast('Gespeichert.', 'ok');
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
