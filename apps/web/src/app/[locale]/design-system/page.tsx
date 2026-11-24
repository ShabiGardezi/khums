import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DesignSystemShowcase } from './showcase';

export const metadata: Metadata = { title: 'Design system' };

/** Internal component preview. Available in development only (404 in production builds). */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignSystemShowcase />;
}
