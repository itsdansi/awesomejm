import { useEffect } from 'react';
import { t, useLanguage } from './language';
export function FormValidation() {
  const language = useLanguage();
  useEffect(() => {
    const touched = new Set<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >();
    const field = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
        ? target
        : null;
    const invalid = (event: Event) => {
      const input = field(event.target);
      if (!input) return;
      input.setCustomValidity('');
      const validity = input.validity;
      let text = t('validation.native.invalidValue');
      if (validity.valueMissing) text = t('validation.native.required');
      else if ('minLength' in input && validity.tooShort) {
        text = t('validation.length.minimum', { count: input.minLength });
      } else if ('maxLength' in input && validity.tooLong) {
        text = t('validation.length.maximum', { count: input.maxLength });
      } else if (input instanceof HTMLInputElement && validity.rangeUnderflow) {
        text = t('validation.range.minimum', { count: input.min });
      } else if (input instanceof HTMLInputElement && validity.rangeOverflow) {
        text = t('validation.range.maximum', { count: input.max });
      }
      input.setCustomValidity(text);
      touched.add(input);
    };
    const clear = (event: Event) => {
      const input = field(event.target);
      if (input) {
        input.setCustomValidity('');
        touched.delete(input);
      }
    };
    document.addEventListener('invalid', invalid, true);
    document.addEventListener('input', clear, true);
    document.addEventListener('change', clear, true);
    return () => {
      for (const input of touched) input.setCustomValidity('');
      document.removeEventListener('invalid', invalid, true);
      document.removeEventListener('input', clear, true);
      document.removeEventListener('change', clear, true);
    };
  }, [language]);
  return null;
}
