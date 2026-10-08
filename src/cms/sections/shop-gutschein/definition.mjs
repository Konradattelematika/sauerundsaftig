/** Sektion „Shop-Gutschein": bindet die VoucherConfigurator-Insel ein (Beträge als Feldliste). */
/** @type {import('../../types').SectionDefinition} */
export default {
  type: 'shop-gutschein',
  label: 'Shop: Gutschein-Konfigurator',
  description: 'Gutschein-Konfigurator mit wählbaren Beträgen.',
  allowedOn: ['shop'],
  fields: [
    {
      key: 'amounts',
      label: 'Betragskacheln',
      kind: 'list',
      min: 1,
      itemLabel: 'value',
      of: [{ key: 'value', label: 'Betrag (€)', kind: 'number', required: true }],
    },
    { key: 'workshops', label: 'Workshop-Gutscheine anbieten', kind: 'boolean' },
  ],
  defaults: () => ({ amounts: [{ value: 20 }, { value: 35 }, { value: 50 }], workshops: false }),
};
