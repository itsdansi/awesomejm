import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  catalogs,
  translate,
  resolveLanguage,
  hasTranslation,
  interpolate,
  supportedLanguages,
} from '../src/i18n/core.mjs';
import { translateMessage } from '../src/i18n/messages.mjs';
import { resources } from '../src/i18n/resources.mjs';
import { flattenCatalog, schemaSource } from '../scripts/i18n-schema.mjs';

const params = (text) =>
  [...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]).sort();
const sortedKeys = (value) => Object.keys(value).sort();

test('every registered locale has matching domain namespaces, semantic keys and placeholders', async () => {
  const english = catalogs.en;
  assert(Object.keys(english).length > 1000);
  assert.deepEqual(supportedLanguages, ['en', 'ne']);
  for (const language of supportedLanguages) {
    const files = (
      await readdir(
        new URL(`../src/i18n/locales/${language}/`, import.meta.url),
      )
    )
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -5))
      .sort();
    assert.deepEqual(
      files,
      sortedKeys(resources[language]),
      `${language}: register every locale file`,
    );
    assert.deepEqual(sortedKeys(resources[language]), sortedKeys(resources.en));
    assert.deepEqual(
      sortedKeys(catalogs[language]),
      sortedKeys(english),
      `${language}: locale keys must match English`,
    );
    for (const [key, value] of Object.entries(catalogs[language])) {
      assert(
        key.split('.').every((part) => /^[a-z][a-zA-Z0-9]*$/.test(part)),
        `Use semantic camelCase key segments: ${key}`,
      );
      assert.equal(typeof value, 'string', key);
      assert(value.trim(), key);
      assert.deepEqual(params(value), params(english[key]), key);
      assert(!/\{value\d+\}/.test(value), `Use named parameters: ${key}`);
    }
  }
});

test('the generated TypeScript key and parameter contract matches English resources', async () => {
  assert.equal(
    await readFile(new URL('../src/i18n/schema.d.ts', import.meta.url), 'utf8'),
    await schemaSource(),
  );
});

test('language selection, English fallback and unknown keys resolve safely', () => {
  assert.equal(resolveLanguage('ne', 'en-US'), 'ne');
  assert.equal(resolveLanguage('en', 'ne-NP'), 'en');
  assert.equal(resolveLanguage('invalid', 'ne-NP'), 'ne');
  assert.equal(resolveLanguage(null, 'fr-FR'), 'en');
  assert.equal(translate('common.metals.gold', {}, 'ne'), 'सुन');
  assert.equal(translate('common.metals.gold', {}, 'en'), 'Gold');
  assert.equal(translate('common.roles.owner', {}, 'en'), 'Owner');
  assert.equal(translate('common.roles.owner', {}, 'ne'), 'सञ्चालक');
  assert.equal(translate('common.navigation.inventory', {}, 'fr'), 'Inventory');
  // Simulate an incomplete new locale: an individual missing message falls back to English.
  const key = 'inventory.receiveForm.title',
    saved = catalogs.ne[key];
  try {
    delete catalogs.ne[key];
    assert.equal(translate(key, {}, 'ne'), 'Receive a piece');
  } finally {
    catalogs.ne[key] = saved;
  }
  for (const key of [
    'future.feature.title',
    '__proto__',
    'constructor',
    'common.__proto__.name',
  ]) {
    assert.equal(translate(key, {}, 'ne'), key);
    assert.equal(hasTranslation(key), false);
  }
  assert.equal(
    translate('Gold', {}, 'ne'),
    'Gold',
    'UI lookup must not translate English copy as a key',
  );
});

test('named interpolation preserves names, codes, decimals and Unicode literally', () => {
  const name = 'Gold {amount} $& <b>सीता</b>';
  assert.equal(
    translate('staff.notices.sessionsRevoked', { name }, 'ne'),
    `${name} लाई सबै उपकरणबाट बाहिर निकालियो।`,
  );
  assert.equal(
    translate('common.money.perTola', { amount: '123456789.01' }, 'ne'),
    'रु. 123456789.01 / तोला',
  );
  assert.equal(
    translate('common.actions.viewRecord', { code: 'GLD-001' }, 'ne'),
    'GLD-001 हेर्नुहोस्',
  );
  assert.equal(
    interpolate(' {weight} {unit} ', { weight: '11.664', unit: 'ग्रा.' }),
    ' 11.664 ग्रा. ',
  );
  assert.equal(
    translate('common.actions.viewRecord', {}, 'ne'),
    '{code} हेर्नुहोस्',
  );
});

test('the API/validation compatibility boundary translates known English messages independently of UI lookup', () => {
  const english =
    'Enter a customer name.\nEnter NPR with up to 2 decimal places.';
  assert.equal(translateMessage(english, 'en'), english);
  assert.equal(
    translateMessage(english, 'ne'),
    'ग्राहकको नाम राख्नुहोस्।\nरकम बढीमा 2 दशमलव अङ्कमा राख्नुहोस्।',
  );
  assert.equal(
    translateMessage(
      'Too small: expected string to have >=15 characters',
      'ne',
    ),
    'कम्तीमा 15 अक्षर प्रयोग गर्नुहोस्।',
  );
  assert.equal(
    translateMessage('Too big: expected string to have <=128 characters', 'ne'),
    'बढीमा 128 अक्षर प्रयोग गर्नुहोस्।',
  );
  assert.equal(
    translateMessage('name: Enter a customer name.', 'ne'),
    'ग्राहकको नाम: ग्राहकको नाम राख्नुहोस्।',
  );
  assert.equal(
    translateMessage('Signed Gold out on all devices.', 'ne'),
    'Gold लाई सबै उपकरणबाट बाहिर निकालियो।',
  );
  assert.equal(
    translateMessage('Failed to fetch', 'ne'),
    'जडान हुन सकेन। कृपया फेरि प्रयास गर्नुहोस्।',
  );
  assert.equal(
    translateMessage('Choose a purchase date on or after 2026-10-20.', 'ne'),
    'खरिद मिति 2026-10-20 वा त्यसपछि छान्नुहोस्।',
  );
  assert.equal(
    translateMessage('Unexpected response from a future API.', 'ne'),
    'Unexpected response from a future API.',
  );
});

async function files(path) {
  return (
    await Promise.all(
      (await readdir(path, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? files(new URL(`${entry.name}/`, path))
          : [new URL(entry.name, path)],
      ),
    )
  ).flat();
}
test('every UI translation uses a registered semantic key and no visible JSX copy is left untranslated', async () => {
  const missing = [];
  for (const path of await files(new URL('../src/', import.meta.url))) {
    if (!/\.tsx?$/.test(path.pathname)) continue;
    const text = await readFile(path, 'utf8'),
      source = ts.createSourceFile(
        path.pathname,
        text,
        ts.ScriptTarget.Latest,
        true,
        path.pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
    function visit(node) {
      if (ts.isJsxText(node) && /\p{L}/u.test(node.text))
        missing.push(
          `${fileURLToPath(path)}: untranslated JSX ${node.text.trim()}`,
        );
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 't' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        !hasTranslation(node.arguments[0].text)
      )
        missing.push(`${fileURLToPath(path)}: ${node.arguments[0].text}`);
      if (
        ts.isVariableDeclaration(node) &&
        [
          'statusTitle',
          'entryTitle',
          'methodTitle',
          'actions',
          'resources',
          'roleDescriptions',
          'roleKeys',
          'navigationKeys',
        ].includes(node.name.getText(source))
      ) {
        const initializer = node.initializer;
        if (initializer) {
          const visitLabel = (child) => {
            if (
              ts.isPropertyAssignment(child) &&
              ts.isStringLiteral(child.initializer) &&
              !hasTranslation(child.initializer.text)
            )
              missing.push(
                `${fileURLToPath(path)}: label ${child.initializer.text}`,
              );
            ts.forEachChild(child, visitLabel);
          };
          visitLabel(initializer);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
  // Catalog English copy is a value: changing it does not require changing component IDs.
  assert.equal(
    flattenCatalog({ title: 'Changed English copy' }, 'example')[
      'example.title'
    ],
    'Changed English copy',
  );
});

test('translated options keep backend values and business text bindings remain literal', async () => {
  const missing = [];
  for (const path of await files(new URL('../src/', import.meta.url))) {
    if (!path.pathname.endsWith('.tsx')) continue;
    const source = ts.createSourceFile(
      path.pathname,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (
        ts.isJsxOpeningElement(node) &&
        node.tagName.getText(source) === 'option' &&
        !node.attributes.properties.some(
          (prop) =>
            ts.isJsxAttribute(prop) && prop.name.getText(source) === 'value',
        )
      )
        missing.push(path.pathname);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
  const stock = await readFile(
    new URL('../src/inventory/Inventory.tsx', import.meta.url),
    'utf8',
  );
  assert(stock.includes('{item.name}'));
  assert(stock.includes('{item.itemCode}'));
  const dialog = await readFile(
    new URL('../src/shared/ui.tsx', import.meta.url),
    'utf8',
  );
  assert(
    dialog.includes('{title}'),
    'User-entered dialog titles must remain literal.',
  );
});
