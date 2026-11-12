import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ReceiveForm } from '../src/inventory/ReceiveForm';
import { getLanguage, setLanguage } from '../src/i18n/language';

test.each(['en', 'ne'] as const)(
  'receive-piece purity options show decimal percentages while retaining fineness values (%s)',
  (language) => {
    const previousLanguage = getLanguage();
    try {
      setLanguage(language);
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(
        <ReceiveForm onClose={() => {}} onSaved={() => {}} />,
      );
      const select = host.querySelector<HTMLSelectElement>(
        '.purity-selector select',
      );
      expect(select).not.toBeNull();
      const options = [...select!.options].slice(0, 5);
      expect(options.map((option) => option.textContent)).toEqual([
        '24K · 99.9%',
        '22K · 91.6%',
        '18K · 75.0%',
        '14K · 58.5%',
        '10K · 41.7%',
      ]);
      expect(options.map((option) => option.value)).toEqual([
        '999',
        '916',
        '750',
        '585',
        '417',
      ]);
      expect(select!.value).toBe('916');
    } finally {
      setLanguage(previousLanguage);
    }
  },
);
