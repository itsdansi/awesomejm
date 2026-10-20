# Frontend translations

English and Nepali have **explicit, mirrored resources**. JSON object keys identify a UI concept; their string values contain the copy translators edit. English is the fallback locale. Changing English copy does not change the identifier used by components.

```text
locales/
  en/
    common.json
    auth.json
    inventory.json
    rates.json
    customers.json
    sales.json
    orders.json
    purchases.json
    dashboard.json
    reports.json
    staff.json
    validation.json
    errors.json
  ne/
    …the same namespace files and nested keys
```

For example, `locales/en/inventory.json` contains:

```json
{
  "receiveForm": {
    "title": "Receive a piece"
  }
}
```

The matching entry in `locales/ne/inventory.json` is:

```json
{
  "receiveForm": {
    "title": "गहना प्राप्त गर्नुहोस्"
  }
}
```

Use it from a component:

```tsx
import { t, useLanguage } from '../i18n/language';

export function ReceiveHeading() {
  useLanguage();
  return <h1>{t('inventory.receiveForm.title')}</h1>;
}
```

## Adding or editing copy

1. Choose the owning business namespace. Use `common` for deliberately shared actions, units and fields. Give different concepts different IDs even when their English wording happens to match.
2. Add matching nested entries to both languages. Use camelCase keys describing the meaning or purpose, such as `purchaseBuilder.physicalExchangeConfirmation`. Keep the ID stable when wording changes. Prefer whole messages to concatenated sentence fragments so translators can reorder words.
3. Use descriptive parameters such as `{amount}`, `{date}`, `{name}`, `{itemCode}` and `{count}`. Keep the same parameters in each locale. Interpolation inserts values literally; React handles escaping. Render business names, notes, item codes and descriptions directly rather than using them as lookup keys.
4. Run `pnpm i18n:types` from the repository root. This generates `schema.d.ts` from the English resources; do not edit that file manually.
5. Call `t('namespace.section.key', { parameter: value })` and subscribe with `useLanguage`. TypeScript checks IDs, parameter names and required values. Dynamic enum labels use typed maps (`labels.ts`, order/customer format helpers), preserving the original API enum values.
6. Run `pnpm check`. The tests check namespace registration, complete locale parity, placeholder parity, the generated schema and UI coverage. `test/i18n.types.ts` verifies that invalid IDs and interpolation calls fail compilation.

A new namespace needs matching JSON files and registration in `resources.mjs` and its declaration `resources.d.mts`. A new language needs the same files, a resource registration, an updated `Language` union, language selector and display locale. Tests require complete translations for every registered language.

Both locales are loaded eagerly for this two-language MVP, so switching stays synchronous and never remounts a screen. Namespace ownership allows future module/language loading changes without changing translation IDs. This engine supports named interpolation; it does not claim ICU/select/plural-message support. Existing count-specific labels choose their forms explicitly. If richer plural/select rules become necessary, keep the IDs and adopt a formatter that supports those rules.

## API and validation messages

`t()` accepts semantic IDs only. `message()` is the compatibility boundary for existing API, shared-contract validation and notification strings. `messages.mjs` matches known English **resource values** to their semantic IDs; it is separate from component lookup and preserves unknown errors as received. Dynamic external messages retain their named values. As long as the API uses English prose, changes to an API message require updating the matching English resource and its translation. A future error-code/parameter protocol can replace this adapter without renaming UI keys.

Missing locale values fall back to the English value at runtime, while CI rejects incomplete committed catalogs. Unknown IDs remain visible as IDs for diagnosis; prototype properties cannot become translations. UI language does not change stored data, machine-readable CSV fields, accounting precision, Latin digits or the AD calendar.
