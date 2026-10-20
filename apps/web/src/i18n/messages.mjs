import { catalogs, translate, hasTranslation } from './core.mjs';

// Compatibility boundary for API/contract validation messages, which currently arrive as
// English strings. UI components use typed semantic keys through t(), never this index.
const englishMessages = Object.fromEntries(
  Object.entries(catalogs.en).map(([key, text]) => [text, key]),
);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.keys(englishMessages)
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
  name: 'customers.fields.name',
  phone: 'common.fields.phone',
  pan: 'common.fields.pan',
  address: 'common.fields.address',
  fineness: 'common.fields.purity',
  grossWeightGrams: 'common.fields.grossWeight',
  nonMetalWeightGrams: 'common.fields.nonMetalWeight',
  openingAmountNpr: 'customers.fields.openingAmount',
  password: 'auth.fields.password',
  currentPassword: 'auth.fields.currentPassword',
  username: 'auth.fields.username',
  quantity: 'common.fields.quantity',
  reason: 'common.fields.reason',
  amountNpr: 'common.fields.amount',
  itemCode: 'inventory.fields.itemCode',
};
export function translateMessage(text, language = 'en') {
  if (!text) return text;
  if (hasTranslation(text)) return translate(text, {}, language);
  if (language === 'en') return text;
  const trimmed = text.trim();
  if (Object.hasOwn(englishMessages, trimmed))
    return translate(englishMessages[trimmed], {}, language);
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
          ? 'validation.length.minimum'
          : 'validation.length.maximum'
        : size[1] === 'small'
          ? 'validation.value.minimum'
          : 'validation.value.maximum',
      { count: size[4] },
      language,
    );
  if (
    /^Invalid (?:input|option|UUID|email|date)|^Unrecognized key/.test(trimmed)
  )
    return translate('validation.invalidDetails', {}, language);
  const colon = trimmed.indexOf(': ');
  if (colon > 0) {
    const label = trimmed.slice(0, colon),
      detail = trimmed.slice(colon + 2);
    const translated = translateMessage(detail, language);
    if (translated !== detail)
      return `${Object.hasOwn(fields, label) ? translate(fields[label], {}, language) : label}: ${translated}`;
  }
  for (const template of templates) {
    const match = template.pattern.exec(trimmed);
    if (match)
      return translate(
        englishMessages[template.key],
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
    return translate('errors.network.connectionFailed', {}, language);
  return text;
}
