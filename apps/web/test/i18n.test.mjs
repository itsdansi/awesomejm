import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  translate,
  translateMessage,
  translationCatalog,
  resolveLanguage,
  hasTranslation,
} from '../src/i18n/core.mjs';
const params = (text) =>
  [...text.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]).sort();
test('the complete Nepali catalog preserves all interpolation parameters', () => {
  assert(Object.keys(translationCatalog).length > 1000);
  for (const [key, value] of Object.entries(translationCatalog)) {
    assert.equal(typeof value, 'string', key);
    assert(value.trim(), key);
    assert.deepEqual(params(value), params(key), key);
  }
});
test('languages resolve safely and labels have English fallbacks', () => {
  assert.equal(resolveLanguage('ne', 'en-US'), 'ne');
  assert.equal(resolveLanguage('en', 'ne-NP'), 'en');
  assert.equal(resolveLanguage('invalid', 'ne-NP'), 'ne');
  assert.equal(resolveLanguage(null, 'fr-FR'), 'en');
  assert.equal(translate('Gold', {}, 'ne'), 'सुन');
  assert.equal(translate('Gold', {}, 'en'), 'Gold');
  assert.equal(translate('OWNER', {}, 'en'), 'Owner');
  assert.equal(translate('OWNER', {}, 'ne'), 'सञ्चालक');
  assert.equal(translate('Future label', {}, 'ne'), 'Future label');
  assert.equal(translate('__proto__', {}, 'ne'), '__proto__');
  assert.equal(translate('constructor', {}, 'en'), 'constructor');
});
test('interpolation preserves customer text, codes, exact decimals and Unicode literally', () => {
  const name = 'Gold {value0} $& <b>सीता</b>';
  assert.equal(
    translate('Signed {name} out on all devices.', { name }, 'ne'),
    `${name} लाई सबै उपकरणबाट बाहिर निकालियो।`,
  );
  assert.equal(
    translate('NPR {value0} / tola', { value0: '123456789.01' }, 'ne'),
    'रु. 123456789.01 / तोला',
  );
  assert.equal(
    translate('View {value0}', { value0: 'GLD-001' }, 'ne'),
    'GLD-001 हेर्नुहोस्',
  );
  assert.equal(translate(' g ', {}, 'ne'), ' ग्रा. ');
});
test('validation, network and staff notices follow the selected language', () => {
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
test('every explicit UI translation and dynamic label has a Nepali catalog entry', async () => {
  const missing = [];
  for (const path of await files(new URL('../src/', import.meta.url))) {
    if (!/\.tsx?$/.test(path.pathname) || path.pathname.includes('/i18n/'))
      continue;
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
          `${fileURLToPath(path)}: unlocalized JSX text ${node.text.trim()}`,
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
        ].includes(node.name.getText(source)) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const property of node.initializer.properties)
          if (
            ts.isPropertyAssignment(property) &&
            ts.isStringLiteral(property.initializer) &&
            !hasTranslation(property.initializer.text)
          )
            missing.push(
              `${fileURLToPath(path)}: ${property.initializer.text}`,
            );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const label of [
    'Dashboard',
    'Inventory',
    'Metal rates',
    'Customers',
    'Sales',
    'Orders',
    'Purchases',
    'Reports',
    'Staff & recovery',
    'OWNER',
    'MANAGER',
    'CASHIER',
    'VIEWER',
  ])
    if (!hasTranslation(label)) missing.push(label);
  assert.deepEqual(missing, []);
});
test('translated select labels retain explicit backend values and customer data bindings stay literal', async () => {
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
    'A user-entered item name supplied as a dialog title must remain literal.',
  );
});
