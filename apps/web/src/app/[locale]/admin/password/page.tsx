import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import { PasswordForm } from '@/components/admin/password-form';
import { getI18n } from '@/i18n/server';
import { lookupStaffSession } from '@/server/staff-api';

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getI18n();
  return { title: admin.passwordPage.title, robots: { index: false, follow: false } };
}

/** Password change (M4.6.2b), required after signing in with a temporary password. */
export default async function StaffPasswordPage() {
  await connection();
  const { admin, href } = await getI18n();
  const current = await lookupStaffSession();
  if (current.kind === 'SIGNED_OUT') redirect(href('/admin/sign-in'));
  const page = admin.passwordPage;
  return (
    <Container size="prose" className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={page.title} description={page.description} />
      {current.kind === 'SIGNED_IN' ? (
        <>
          {current.session.mustChangePassword && (
            <Alert variant="warning">
              <AlertDescription>{page.temporaryNotice}</AlertDescription>
            </Alert>
          )}
          <PasswordForm
            content={page}
            consoleHref={href('/admin')}
            signInHref={href('/admin/sign-in')}
          />
        </>
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            {current.kind === 'NOT_ACTIVE' ? admin.accountNotActive : admin.unavailable}
          </AlertDescription>
        </Alert>
      )}
    </Container>
  );
}
