import { FieldDef, ItemTypeDef } from '../models/vault.models';

function field(name: string, label: string, type = 'text', options: Partial<FieldDef> = {}): FieldDef {
  return {
    name,
    label,
    type,
    required: Boolean(options.required),
    placeholder: options.placeholder || '',
    options: options.options || null,
    monospaced: Boolean(options.monospaced),
  };
}

const types: ItemTypeDef[] = [
  {
    id: 'password',
    label: 'Login / credentials',
    icon: 'key',
    fields: [
      field('url', 'Website', 'url'),
      field('username', 'Username', 'text', { required: true }),
      field('password', 'Password', 'password', { required: true }),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'social',
    label: 'Social account',
    icon: 'users',
    fields: [
      field('platform', 'Platform', 'text', { required: true }),
      field('username', 'Username / handle', 'text', { required: true }),
      field('password', 'Password', 'password', { required: true }),
      field('email', 'Linked email', 'email'),
      field('url', 'Profile URL', 'url'),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'bankAccount',
    label: 'Bank account',
    icon: 'bank',
    fields: [
      field('bankName', 'Bank name', 'text', { required: true }),
      field('accountHolder', 'Account holder name', 'text', { required: true }),
      field('accountNumber', 'Account number', 'password', { required: true, monospaced: true }),
      field('ifsc', 'IFSC / routing / sort code', 'text', { monospaced: true }),
      field('upi', 'UPI ID', 'text'),
      field('username', 'Netbanking username', 'text'),
      field('password', 'Netbanking password', 'password'),
      field('registeredPhone', 'Registered phone', 'text'),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'creditCard',
    label: 'Credit / Debit card',
    icon: 'card',
    fields: [
      field('cardholder', 'Name on card', 'text', { required: true }),
      field('number', 'Card number', 'password', { required: true, monospaced: true }),
      field('expiry', 'Expiry (MM/YY)', 'text'),
      field('cvv', 'CVV', 'password'),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    icon: 'car',
    fields: [
      field('makeModel', 'Make & model', 'text', { required: true }),
      field('registration', 'Registration number', 'text', { required: true, monospaced: true }),
      field('insurancePolicy', 'Insurance policy no.', 'text'),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'document',
    label: 'Document / certificate / ID',
    icon: 'file',
    fields: [
      field('category', 'Category', 'select', {
        options: [
          { value: 'id', label: 'ID proof' },
          { value: 'academic', label: 'Academic / certificate' },
          { value: 'other', label: 'Other document' },
        ],
      }),
      field('docType', 'What is it?', 'text', { required: true }),
      field('documentNumber', 'Document / certificate number', 'password', { monospaced: true }),
      field('institution', 'School / university / issuer', 'text'),
      field('issued', 'Issue date', 'date'),
      field('expires', 'Valid until', 'date'),
      field('notes', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'custom',
    label: 'Custom (fully yours)',
    icon: 'sparkles',
    fields: [field('value', 'Main value', 'textarea'), field('notes', 'Notes', 'textarea')],
  },
];

const byId = Object.fromEntries(types.map((t) => [t.id, t]));

export function listItemTypes(): ItemTypeDef[] {
  return types.slice();
}

export function getItemType(id: string): ItemTypeDef {
  return byId[id] || byId['custom'];
}

export function emptyFieldsForType(typeId: string): Record<string, string> {
  const def = getItemType(typeId);
  const fields: Record<string, string> = {};
  for (const f of def.fields) fields[f.name] = '';
  return fields;
}
