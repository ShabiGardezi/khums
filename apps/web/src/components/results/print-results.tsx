'use client';

import { Printer } from 'lucide-react';
import { useEffect } from 'react';

import { buttonVariants } from '@khums/ui/components/button';

const PRINT_CLASS = 'printing-results';
/** Marks the results panel: what is printed (with the page heading and the site notice). */
export const RESULTS_PRINT_ATTRIBUTE = 'data-results-print';

/**
 * Prepares the page for printing a result (Phase 3 step 4): the body class lets the print
 * stylesheet drop the site navigation, the progress steps, buttons and forms, and every collapsed
 * rule/source list in the results is expanded (browsers never print closed `<details>`). Returns
 * the function that restores the page.
 */
export function prepareResultsPrint(
  doc: Document = document,
  scope: PrintScope = RESULTS_SCOPE,
): () => void {
  const panel = doc.querySelector(scope.root);
  const closed = panel === null ? [] : [...panel.querySelectorAll('details:not([open])')];
  for (const details of closed) details.setAttribute('open', '');
  doc.body.classList.add(scope.bodyClass);
  return () => {
    for (const details of closed) details.removeAttribute('open');
    doc.body.classList.remove(scope.bodyClass);
  };
}

/** What is printed: the root element (its closed lists are expanded) and the body class. */
export interface PrintScope {
  readonly root: string;
  readonly bodyClass: string;
}
const RESULTS_SCOPE: PrintScope = { root: `[${RESULTS_PRINT_ATTRIBUTE}]`, bodyClass: PRINT_CLASS };
/** The rule builder's test result (staff): only `#rule-test-report` is printed. */
export const RULE_TEST_PRINT_SCOPE: PrintScope = {
  root: '#rule-test-report',
  bodyClass: 'printing-rule-test',
};

/**
 * "Print or save as PDF": the browser's own print dialog (keeps Urdu shaping and right-to-left
 * layout exact). Keyboard printing (Ctrl/Cmd+P) while a result is shown uses the same print view.
 * Nothing is sent anywhere.
 */
export function PrintResultsButton(props: {
  readonly label: string;
  readonly hint: string;
  readonly scope?: PrintScope;
}) {
  const scope = props.scope ?? RESULTS_SCOPE;
  useEffect(() => {
    let restore: (() => void) | null = null;
    const before = () => {
      restore ??= prepareResultsPrint(document, scope);
    };
    const after = () => {
      restore?.();
      restore = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      after();
    };
  }, [scope]);

  return (
    <div className="flex flex-col gap-1 print:hidden">
      <div>
        <button
          type="button"
          data-testid="print-results"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          {props.label}
        </button>
      </div>
      <p className="text-muted-foreground text-xs">{props.hint}</p>
    </div>
  );
}
