import { useEffect, useRef, type ReactNode } from 'react';

export function Icon({
  name,
  size = 20,
}: {
  name:
    | 'box'
    | 'plus'
    | 'search'
    | 'arrow'
    | 'close'
    | 'diamond'
    | 'history'
    | 'users'
    | 'receipt';
  size?: number;
}) {
  const paths = {
    receipt: (
      <>
        <path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM8 8h8M8 12h8M8 16h4" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M17 4a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 4v2" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    diamond: (
      <>
        <path d="m3 8 5-5h8l5 5-9 13L3 8Zm0 0h18M8 3l4 18 4-18" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Dialog({
  title,
  onClose,
  busy = false,
  eyebrow = 'Jewellery inventory',
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  eyebrow?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
