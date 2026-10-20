// These calls are checked by tsc, never executed or bundled into the application.
import { t } from '../src/i18n/language';
import { roleKeys } from '../src/i18n/labels';

t('inventory.receiveForm.title');
t('common.money.perTola', { amount: '150000.00' });
t('staff.notices.sessionsRevoked', { name: 'सीता' });
t(roleKeys.OWNER);
// @ts-expect-error English copy is not a translation key.
t('Receive a piece');
// @ts-expect-error Misspelled semantic keys must be caught before deployment.
t('inventory.receiveForm.titel');
// @ts-expect-error Required interpolation parameters cannot be omitted.
t('common.money.perTola');
// @ts-expect-error Parameter names are part of the contract.
t('common.money.perTola', { value0: '150000.00' });
// @ts-expect-error Interpolation parameters cannot include arbitrary extra values.
t('common.money.perTola', { amount: '150000.00', unused: 'x' });
// @ts-expect-error Parameter-free labels do not accept interpolation objects.
t('inventory.receiveForm.title', { unused: 'x' });
