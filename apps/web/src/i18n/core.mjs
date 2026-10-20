import nepali from './ne.json' with { type: 'json' };
export const supportedLanguages = ['en', 'ne'];
const englishLabels = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  VIEWER: 'Viewer',
  GOLD: 'Gold',
  SILVER: 'Silver',
  CASH: 'Cash',
  BANK: 'Bank',
  DIGITAL_WALLET: 'Digital wallet',
};
export function resolveLanguage(saved, browserLanguage = 'en') {
  return supportedLanguages.includes(saved)
    ? saved
    : browserLanguage.toLowerCase().startsWith('ne')
      ? 'ne'
      : 'en';
}
export function interpolate(text, values = {}) {
  return text.replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
export function translate(text, values = {}, language = 'en') {
  const key = text.trim(),
    catalog = language === 'ne' ? nepali : englishLabels;
  const result = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
  if (result === undefined) return interpolate(text, values);
  const leading = text.slice(0, text.length - text.trimStart().length),
    trailing = text.slice(text.trimEnd().length);
  return leading + interpolate(result, values) + trailing;
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.keys(nepali)
  .filter(
    (key) =>
      /\{\w+\}/.test(key) && /[A-Za-z]/.test(key.replace(/\{\w+\}/g, '')),
  )
  .sort((a, b) => b.length - a.length)
  .map((key) => {
    const names = [],
      pattern = key
        .split(/(\{[a-zA-Z][\w]*\})/)
        .map((part) => {
          if (/^\{/.test(part)) {
            names.push(part.slice(1, -1));
            return '(.+?)';
          }
          return escape(part);
        })
        .join('');
    return { key, names, pattern: new RegExp(`^${pattern}$`, 'u') };
  });
const fields = {
  name: 'Customer name',
  phone: 'Phone',
  pan: 'PAN',
  address: 'Address',
  fineness: 'Purity',
  grossWeightGrams: 'Gross weight',
  nonMetalWeightGrams: 'Stone / other weight',
  openingAmountNpr: 'Opening amount (NPR)',
  password: 'Password',
  currentPassword: 'Current password',
  username: 'Username',
  quantity: 'Quantity',
  reason: 'Reason',
  amountNpr: 'Amount (NPR)',
  itemCode: 'Item code',
};
export function translateMessage(text, language = 'en') {
  if (language === 'en' || !text) return text;
  const trimmed = text.trim();
  if (Object.hasOwn(nepali, trimmed)) return translate(text, {}, language);
  if (trimmed.includes('\n'))
    return trimmed
      .split(/\n+/)
      .map((part) => translateMessage(part, language))
      .join('\n');
  const size =
    /^Too (small|big): expected (string|number|array) to (?:have |be )?([<>]=?)([\d.]+)(?: (characters|items))?$/.exec(
      trimmed,
    );
  if (size)
    return translate(
      size[2] === 'string'
        ? size[1] === 'small'
          ? 'Use at least {count} characters.'
          : 'Use no more than {count} characters.'
        : size[1] === 'small'
          ? 'The value must be at least {count}.'
          : 'The value must be at most {count}.',
      { count: size[4] },
      language,
    );
  if (
    /^Invalid (?:input|option|UUID|email|date)|^Unrecognized key/.test(trimmed)
  )
    return translate('Please check the entered details.', {}, language);
  const colon = trimmed.indexOf(': ');
  if (colon > 0) {
    const label = trimmed.slice(0, colon),
      detail = trimmed.slice(colon + 2);
    const translated = translateMessage(detail, language);
    if (translated !== detail)
      return `${translate(Object.hasOwn(fields, label) ? fields[label] : label, {}, language)}: ${translated}`;
  }
  for (const template of templates) {
    const match = template.pattern.exec(trimmed);
    if (match)
      return translate(
        template.key,
        Object.fromEntries(
          template.names.map((name, index) => [
            name,
            name === 'details'
              ? translateMessage(match[index + 1], language)
              : match[index + 1],
          ]),
        ),
        language,
      );
  }
  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
  if (parts.length > 1)
    return parts.map((part) => translateMessage(part, language)).join(' ');
  if (/^(?:Failed to fetch|Load failed|NetworkError)/.test(trimmed))
    return translate('The connection failed. Please try again.', {}, language);
  return text;
}
export function hasTranslation(text) {
  return Object.hasOwn(nepali, text.trim());
}
export const translationCatalog = nepali;
