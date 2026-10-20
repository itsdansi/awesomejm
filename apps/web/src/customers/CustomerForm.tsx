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
      title={customer ? t('Edit customer') : t('Add a customer')}
      eyebrow={t('Customer accounts')}
      busy={busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        {customer
          ? t(
              'Changes are recorded in profile history. Earlier account entries keep their original customer details.',
            )
          : t(
              'Create a customer record and bring forward an existing balance if needed. Search by phone or PAN first to avoid duplicate records.',
            )}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label className="full-width">
            {t('Customer name')}
            <input
              autoComplete="name"
              required
              maxLength={120}
              placeholder={t('नाम / Customer name')}
              {...field('name')}
            />
          </label>
          <label>
            {t('Phone (optional)')}
            <input
              type="tel"
              autoComplete="tel"
              maxLength={30}
              placeholder={t('98XXXXXXXX or +977…')}
              {...field('phone')}
            />
          </label>
          <label>
            {t('PAN (optional)')}
            <input
              inputMode="numeric"
              maxLength={9}
              placeholder={t('9 digits')}
              {...field('pan')}
            />
          </label>
          <label className="full-width">
            {t('Address (optional)')}
            <input
              autoComplete="street-address"
              maxLength={300}
              placeholder={t('City, ward or address')}
              {...field('address')}
            />
          </label>
          <label className="full-width">
            {t('Notes (optional)')}
            <textarea rows={2} maxLength={1000} {...field('notes')} />
          </label>
          {!customer && (
            <>
              <div className="form-section full-width">
                <h3>{t('Opening account balance')}</h3>
                <p>
                  {t(
                    'Use the balance from the shop’s existing records. This is recorded once when the account is created.',
                  )}
                </p>
              </div>
              <label>
                {t('Opening date (AD)')}
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max={nepalToday()}
                  {...field('openedOn')}
                />
              </label>
              <label>
                {t('Balance type')}
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
                  <option value="NONE">{t('Settled · No balance')}</option>
                  <Permission name="records.correct">
                    <option value="DUE">{t('Customer owes the shop')}</option>
                  </Permission>
                  <Permission name="records.correct">
                    <option value="ADVANCE">
                      {t('Shop holds an advance')}
                    </option>
                  </Permission>
                </select>
              </label>
              {fields.openingType !== 'NONE' && (
                <>
                  <label>
                    {t('Opening amount (NPR)')}
                    <input
                      required
                      inputMode="decimal"
                      placeholder="0.00"
                      {...field('openingAmountNpr')}
                    />
                  </label>
                  <label>
                    {t('Opening balance source')}
                    <input
                      required
                      minLength={5}
                      maxLength={160}
                      placeholder={t('e.g. Paper ledger balance')}
                      {...field('openingReference')}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {customer && (
            <label className="full-width">
              {t('Reason for profile change')}
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
            {t('Cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('Saving…')
              : customer
                ? t('Save profile')
                : t('Create customer')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
