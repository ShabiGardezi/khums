import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import { SignInForm } from '@/components/admin/sign-in-form';
import { WakeCheck } from '@/components/admin/wake-check';
import { LOCALES } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { CONTINUE_PARAM, safeContinuePath, WAKE_PARAM } from '@/lib/private-access';
import { lookupStaffSession } from '@/server/staff-api';

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getI18n();
  return { title: admin.signInPage.title, robots: { index: false, follow: false } };
}

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);

/**
 * Staff sign-in (M4.6.2b): username and password, sent only to the API. M4.7: also the private
 * gate's only open page, and where a sleeping API is woken (`?wake=1&next=…` from the gate).
 */
export default async function StaffSignInPage(props: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { admin, href } = await getI18n();
  const query = await props.searchParams;
  const waking = single(query[WAKE_PARAM]) === '1';
  // While the API is asleep, do not wait for it here: the browser wakes it (WakeCheck).
  if (!waking) {
    const current = await lookupStaffSession();
    if (current.kind === 'SIGNED_IN') {
      redirect(current.session.mustChangePassword ? href('/admin/password') : href('/admin'));
    }
  }
  const continueTo = waking ? safeContinuePath(single(query[CONTINUE_PARAM]), LOCALES) : null;
  return (
    <Container size="prose" className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={admin.signInPage.title} description={admin.signInPage.description} />
      <WakeCheck content={admin.signInPage} continueTo={continueTo} />
      <SignInForm
        content={admin.signInPage}
        consoleHref={href('/admin')}
        passwordHref={href('/admin/password')}
      />
    </Container>
  );
}
