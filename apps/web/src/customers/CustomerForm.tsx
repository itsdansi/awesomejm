import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  createCustomerSchema,
  customerProfileSchema,
  customerSchema,
  nepalToday,
  updateCustomerSchema,
  type Customer,
} from '@awesomejm/contracts';
import { Dialog, Icon } from '../shared/ui';
import { request, errorMessage } from '../shared/api';

export function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}) {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [fields, setFields] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    pan: customer?.pan ?? '',
    notes: customer?.notes ?? '',
    openedOn: nepalToday(),
    openingType: 'NONE',
    openingAmountNpr: '0',
    openingReference: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (name: keyof typeof fields) => ({
    value: fields[name],
    onChange: (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setFields({ ...fields, [name]: event.target.value }),
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    const profile = customerProfileSchema.safeParse(fields);
    if (!profile.success) {
      setError(profile.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    const parsed = customer
      ? updateCustomerSchema.safeParse({
          ...profile.data,
          expectedVersion: customer.version,
          reason: fields.reason,
        })
      : createCustomerSchema.safeParse({
          ...profile.data,
          requestId,
          openedOn: fields.openedOn,
          openingType: fields.openingType,
          openingAmountNpr: fields.openingAmountNpr,
          openingReference: fields.openingReference,
        });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await request(
        `/customers${customer ? `/${customer.id}` : ''}`,
        customerSchema,
        {
          method: customer ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      onSaved(saved);
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        customer
          ? t('customers.customerForm.editCustomer')
          : t('customers.labels.addACustomer')
      }
      busy={busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        {customer
          ? t('customers.customerForm.profileHistoryHelp')
          : t('customers.customerForm.createACustomerRecordAndBringForwardAn')}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label className="full-width">
            {t('customers.fields.name')}
            <input
              autoComplete="name"
              required
              maxLength={120}
              placeholder={t('customers.customerForm.customerName')}
              {...field('name')}
            />
          </label>
          <label>
            {t('customers.customerForm.phoneOptional')}
            <input
              type="tel"
              autoComplete="tel"
              maxLength={30}
              placeholder={t('customers.customerForm.phonePlaceholder')}
              {...field('phone')}
            />
          </label>
          <label>
            {t('customers.customerForm.panOptional')}
            <input
              inputMode="numeric"
              maxLength={9}
              placeholder={t('customers.customerForm.panPlaceholder')}
              {...field('pan')}
            />
          </label>
          <label className="full-width">
            {t('customers.customerForm.addressOptional')}
            <input
              autoComplete="street-address"
              maxLength={300}
              placeholder={t('customers.customerForm.cityWardOrAddress')}
              {...field('address')}
            />
          </label>
          <label className="full-width">
            {t('common.labels.notesOptional')}
            <textarea rows={2} maxLength={1000} {...field('notes')} />
          </label>
          {!customer && (
            <>
              <div className="form-section full-width">
                <h3>{t('customers.customerForm.openingAccountBalance')}</h3>
                <p>
                  {t(
                    'customers.customerForm.useTheBalanceFromTheShopSExisting',
                  )}
                </p>
              </div>
              <label>
                {t('customers.customerForm.openingDateAd')}
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max={nepalToday()}
                  {...field('openedOn')}
                />
              </label>
              <label>
                {t('customers.customerForm.balanceType')}
                <select
                  {...field('openingType')}
                  onChange={(event) =>
                    setFields({
                      ...fields,
                      openingType: event.target.value,
                      openingAmountNpr:
                        event.target.value === 'NONE'
                          ? '0'
                          : fields.openingAmountNpr,
                    })
                  }
                >
                  <option value="NONE">
                    {t('customers.customerForm.settledNoBalance')}
                  </option>
                  <Permission name="records.correct">
                    <option value="DUE">
                      {t('customers.customerForm.customerOwesTheShop')}
                    </option>
                  </Permission>
                  <Permission name="records.correct">
                    <option value="ADVANCE">
                      {t('customers.customerForm.shopHoldsAnAdvance')}
                    </option>
                  </Permission>
                </select>
              </label>
              {fields.openingType !== 'NONE' && (
                <>
                  <label>
                    {t('customers.fields.openingAmount')}
                    <input
                      required
                      inputMode="decimal"
                      placeholder="0.00"
                      {...field('openingAmountNpr')}
                    />
                  </label>
                  <label>
                    {t('customers.customerForm.openingBalanceSource')}
                    <input
                      required
                      minLength={5}
                      maxLength={160}
                      placeholder={t(
                        'customers.customerForm.eGPaperLedgerBalance',
                      )}
                      {...field('openingReference')}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {customer && (
            <label className="full-width">
              {t('customers.customerForm.reasonForProfileChange')}
              <textarea
                required
                minLength={5}
                maxLength={500}
                rows={2}
                {...field('reason')}
              />
            </label>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {message(error)}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('common.actions.cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : customer
                ? t('customers.customerForm.saveProfile')
                : t('customers.customerForm.createCustomer')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
