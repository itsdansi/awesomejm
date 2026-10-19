import { useState, type ChangeEvent, type FormEvent } from 'react';
import { inventoryWeights } from '@awesomejm/calculations';
import { inventoryItemSchema, receiveItemSchema } from '@awesomejm/contracts';
import { errorMessage, request } from './api';
import { Dialog, Icon } from './ui';

export function ReceiveForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState({
    itemCode: '',
    name: '',
    category: '',
    metal: 'GOLD',
    fineness: '916.667',
    grossWeightGrams: '',
    nonMetalWeightGrams: '0',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let preview: ReturnType<typeof inventoryWeights> | null = null;
  try {
    preview = inventoryWeights(
      fields.grossWeightGrams,
      fields.nonMetalWeightGrams,
      fields.fineness,
    );
  } catch {
    /* Incomplete form has no weight preview. */
  }
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
    const parsed = receiveItemSchema.safeParse(fields);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(' ')}: ${issue.message}`)
          .join(' '),
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request('/items', inventoryItemSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Receive a piece" onClose={onClose} busy={busy}>
      <p className="dialog-description">
        Create one stock record per physical piece. All weights are entered in
        grams.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="form-grid">
          <label>
            Item code
            <input
              autoFocus
              required
              maxLength={40}
              placeholder="e.g. GLD-001"
              {...field('itemCode')}
            />
          </label>
          <label>
            Category
            <input
              required
              maxLength={60}
              placeholder="e.g. Ring"
              {...field('category')}
              list="categories"
            />
          </label>
          <datalist id="categories">
            <option>Ring</option>
            <option>Necklace</option>
            <option>Earrings</option>
            <option>Bangle</option>
            <option>Chain</option>
            <option>Coin</option>
          </datalist>
          <label className="full-width">
            Item name
            <input
              required
              maxLength={120}
              placeholder="e.g. Traditional gold ring"
              {...field('name')}
            />
          </label>
          <label>
            Metal
            <select {...field('metal')}>
              <option value="GOLD">Gold · सुन</option>
              <option value="SILVER">Silver · चाँदी</option>
            </select>
          </label>
          <label>
            Purity / fineness (‰)
            <input
              required
              inputMode="decimal"
              placeholder="e.g. 916.667"
              {...field('fineness')}
            />
            <span className="field-hint">
              22K ≈ 916.667‰. Use the piece’s actual purity.
            </span>
          </label>
          <label>
            Gross weight (g)
            <input
              required
              inputMode="decimal"
              placeholder="0.000"
              {...field('grossWeightGrams')}
            />
          </label>
          <label>
            Stone / other weight (g)
            <input
              required
              inputMode="decimal"
              {...field('nonMetalWeightGrams')}
            />
          </label>
          <div className="weight-preview full-width">
            <div>
              <span>Net metal weight</span>
              <strong>{preview ? `${preview.netWeightGrams} g` : '—'}</strong>
            </div>
            <div>
              <span>Fine-metal equivalent</span>
              <strong>{preview ? `${preview.fineWeightGrams} g` : '—'}</strong>
            </div>
          </div>
          <label className="full-width">
            Notes (optional)
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="Design, size or receipt reference"
              {...field('notes')}
            />
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Receive piece'}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
