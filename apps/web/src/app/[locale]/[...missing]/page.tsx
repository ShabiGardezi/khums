import { notFound } from 'next/navigation';

/** Any unmatched path inside a locale renders the localized not-found page (with a 404 status). */
export default function MissingPage() {
  notFound();
}
