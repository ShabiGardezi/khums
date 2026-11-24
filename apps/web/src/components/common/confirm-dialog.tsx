'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { buttonVariants } from '@khums/ui/components/button';

export interface ConfirmOptions {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

interface Request {
  readonly options: ConfirmOptions;
  readonly resolve: (confirmed: boolean) => void;
}

/**
 * Accessible confirmation using the native modal `<dialog>`: focus is contained, Escape cancels,
 * the rest of the page is inert, and it is announced by its title and body. The safe choice
 * (cancel) receives focus first. On cancel, focus returns to the element that opened it; on
 * confirm the caller decides where focus goes.
 */
export function useConfirmDialog(): {
  readonly dialog: ReactNode;
  readonly confirm: (options: ConfirmOptions) => Promise<boolean>;
} {
  const [request, setRequest] = useState<Request | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const baseId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request === null || dialog === null || dialog.open) return;
    dialog.showModal();
    cancelRef.current?.focus();
  }, [request]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRequest({ options, resolve });
      }),
    [],
  );

  const settle = (confirmed: boolean) => {
    const current = request;
    setRequest(null);
    dialogRef.current?.close();
    if (!confirmed) opener.current?.focus();
    current?.resolve(confirmed);
  };

  const dialog = (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${baseId}-title`}
      aria-describedby={`${baseId}-body`}
      onCancel={(event) => {
        // Escape: treat as "keep" and settle through our own handler.
        event.preventDefault();
        settle(false);
      }}
      className="bg-card text-foreground m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border p-6 shadow-lg backdrop:bg-black/40"
    >
      {request !== null && (
        <div className="flex flex-col gap-4">
          <h2 id={`${baseId}-title`} className="text-lg font-semibold">
            {request.options.title}
          </h2>
          <p id={`${baseId}-body`} className="text-muted-foreground text-sm">
            {request.options.body}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                settle(true);
              }}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {request.options.confirmLabel}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => {
                settle(false);
              }}
              className={buttonVariants({ variant: 'outline' })}
            >
              {request.options.cancelLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );

  return { dialog, confirm };
}
