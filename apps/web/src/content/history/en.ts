import type { HistoryContent } from './types';

export const historyEn: HistoryContent = {
  metadataTitle: 'Saved results',
  title: 'Saved results',
  description: 'Results you chose to keep on this device.',
  privacy: {
    title: 'Stored only in this browser',
    body: 'Saved results stay in this browser on this device, with the entries and answers you saved. They are never sent to us or to anyone else. Anyone who uses this browser can see them, including your entries. Clearing your browser data also removes them.',
  },
  loading: 'Loading saved results…',
  empty: {
    title: 'No saved results',
    body: 'After a calculation with verified rules you can choose to save the result on this device.',
    start: 'Start an assessment',
  },
  unavailable: {
    title: 'Saved results are not available in this browser',
    body: 'This browser does not allow the site to store data (for example in private browsing), so nothing can be saved or shown here.',
  },
  discarded:
    'Some saved data in this browser could not be read (it may come from another version of the calculator or be damaged), so it is not shown. It cannot be recovered here: it is removed the next time you save, rename or delete a saved calculation, or now with “Delete all”. Every saved calculation that can be read is kept.',
  unreadableCount: 'Saved items that could not be read: {count}.',
  listHeading: 'Your saved results',
  count: '{count} saved',
  savedOn: 'Saved on',
  marja: 'Marja',
  unknownMarja: 'Unknown Marja ({id})',
  assessment: 'Assessment type',
  workflows: {
    annual: 'Regular annual assessment',
    'first-time': 'First-time assessment',
    'missed-year': 'Missed-year assessment',
  },
  pack: 'Rule pack',
  version: 'Version',
  digest: 'Content digest',
  figures: 'Figures',
  total: 'Across all years',
  period: '{start} to {end}',
  notCalculated: 'Not calculated',
  openItems: 'Open items remained: these figures were not the complete amount due.',
  legacyLabel: 'Saved result (figures only)',
  legacyNote:
    'This result was saved by an earlier version of the calculator, which kept only the figures, so it cannot be edited or copied.',
  open: 'Open',
  openLabel: 'Open {label}',
  back: 'Back to saved results',
  historical: {
    title: 'Figures as saved',
    body: 'Saved on {date} with rule pack {packId} version {version}. These are the figures as they were saved; they are not recalculated.',
  },
  dates: 'Assessment dates',
  assessmentDate: 'Assessment date',
  entries: 'Entries',
  entryCount: '{count} saved',
  edit: {
    button: 'Edit and recalculate',
    description:
      'Opens the entries and answers in the calculator. New figures use the current verified rules; this saved calculation stays as it is.',
  },
  copy: {
    button: 'Copy to a new year',
    description:
      'Opens a copy of the entries with empty assessment dates for you to fill in. Answers are not copied: the questions are asked again. Nothing is saved until you choose Save.',
  },
  rename: {
    button: 'Rename',
    label: 'New name',
    save: 'Save name',
    cancel: 'Cancel',
    required: 'Enter a name of up to 100 characters.',
    done: 'The name was changed.',
  },
  deleteOne: 'Delete',
  deleteOneLabel: 'Delete {label}',
  deleteConfirm: {
    title: 'Delete this saved result?',
    body: 'It is removed from this browser. This cannot be undone.',
    confirm: 'Delete',
    cancel: 'Cancel',
  },
  clearAll: 'Delete all',
  clearConfirm: {
    title: 'Delete all saved results?',
    body: 'Every saved result is removed from this browser. This cannot be undone.',
    confirm: 'Delete all',
    cancel: 'Cancel',
  },
  deleted: 'The saved result was deleted.',
  cleared: 'All saved results were deleted.',
  failed: 'This browser did not allow the change.',
};
