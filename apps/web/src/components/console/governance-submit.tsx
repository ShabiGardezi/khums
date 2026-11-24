'use client';

import { staffBrowserApi } from '@/components/admin/staff-browser-api';
import type { ConsoleContent } from '@/content/console/types';

import { ActionForm } from './action-form';
import { FileField } from './governance-commands';
import { fileText, invalidFile, parsePackFile } from './pack-file';

/**
 * Submits sealed content as the FIRST submission of a pack version (M4.6.5); the pack id and
 * version come from the file. The API checks the strict schema, integrity, Marja scope, Marja
 * binding and eligibility (mock and scholar-review packs are refused).
 */
export function GovernanceSubmit(props: { readonly content: ConsoleContent }) {
  const g = props.content.governance.commands;
  return (
    <section
      aria-labelledby="gov-submit"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="gov-submit" className="text-lg font-semibold">
        {g.submitHeading}
      </h2>
      <ActionForm
        submitLabel={g.submit}
        content={props.content.common}
        onSubmit={async (data) => {
          const file = parsePackFile(await fileText(data));
          if (file.kind === 'INVALID') return invalidFile();
          return staffBrowserApi().governance.command(file.packId, file.version, 'submit', {
            expectedSequence: 0,
            pack: file.pack,
          });
        }}
      >
        <FileField label={g.file} hint={g.fileHint} />
      </ActionForm>
    </section>
  );
}
