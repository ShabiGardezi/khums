import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { Alert, AlertDescription } from '@khums/ui/components/alert';
import { buttonVariants } from '@khums/ui/components/button';
import { Container } from '@khums/ui/components/container';
import { PageHeader } from '@khums/ui/components/page-header';

import { SignOutButton } from '@/components/admin/sign-out-button';
import { visibleSections } from '@/components/console/console-nav';
import { formatMessage } from '@/i18n/format';
import { getI18n } from '@/i18n/server';
import { lookupStaffSession, serverStaffApi } from '@/server/staff-api';

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getI18n();
  return { title: admin.title, robots: { index: false, follow: false } };
}

/**
 * Staff console entry (M4.6.2b). Server Component only: it forwards the staff session cookie to
 * the API and shows what the API returns for the verified principal. It makes no authorization
 * decision of its own; every action is authorized by the API.
 */
export default async function AdminPage() {
  await connection();
  const { admin, console: c, rules: r, definition, href } = await getI18n();
  const current = await lookupStaffSession();
  if (current.kind === 'SIGNED_OUT') redirect(href('/admin/sign-in'));
  if (current.kind === 'SIGNED_IN' && current.session.mustChangePassword) {
    redirect(href('/admin/password'));
  }

  const signOut = (
    <SignOutButton
      label={admin.signOut}
      busyLabel={admin.signingOut}
      signInHref={href('/admin/sign-in')}
    />
  );
  const layout = (body: React.ReactNode) => (
    <Container size="prose" className="flex flex-col gap-8 py-10 sm:py-14">
      <PageHeader title={admin.title} description={admin.description} />
      {body}
    </Container>
  );

  if (current.kind !== 'SIGNED_IN') {
    return layout(
      <>
        <Alert variant="warning">
          <AlertDescription>
            {current.kind === 'NOT_ACTIVE' ? admin.accountNotActive : admin.unavailable}
          </AlertDescription>
        </Alert>
        <div>{signOut}</div>
      </>,
    );
  }

  const me = current.session;
  const when = new Intl.DateTimeFormat(definition.tag, { dateStyle: 'medium', timeStyle: 'short' });
  // Phase 2 step 5: each Marja's active (public) builder version, for staff who may read rules.
  const publications = me.permissions.includes('builder.rule.read')
    ? await (async () => {
        const staff = await serverStaffApi();
        if (staff.kind !== 'READY') return null;
        const listed = await staff.api.rules.publications();
        return listed.ok ? listed.value.marjas : null;
      })()
    : undefined;
  return layout(
    <>
      <nav aria-labelledby="console-sections-heading" className="flex flex-col gap-3">
        <h2 id="console-sections-heading" className="text-lg font-semibold">
          {c.overview.heading}
        </h2>
        <p className="text-muted-foreground text-sm">{c.overview.description}</p>
        {/* Informational: the API authorizes every read and command (M4.6.5). */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {visibleSections(me.permissions).map((section) => (
            <li key={section.key}>
              <Link
                href={href(section.path)}
                className={buttonVariants({
                  variant: section.key === 'rules' ? 'primary' : 'outline',
                  className: 'w-full justify-start',
                })}
              >
                {c.nav[section.key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {publications !== undefined && (
        <section aria-labelledby="publications-heading" className="flex flex-col gap-3">
          <h2 id="publications-heading" className="text-lg font-semibold">
            {r.publications.heading}
          </h2>
          <p className="text-muted-foreground text-sm">{r.publications.description}</p>
          {publications === null ? (
            <Alert variant="warning">
              <AlertDescription>{r.publications.loadError}</AlertDescription>
            </Alert>
          ) : (
            <dl
              className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"
              data-testid="builder-publications"
            >
              {publications.map((m) => (
                <div key={m.marjaId} className="contents">
                  <dt className="font-medium">
                    {m.marjaId === 'sistani' || m.marjaId === 'khamenei'
                      ? r.marja.names[m.marjaId]
                      : m.marjaId}
                  </dt>
                  <dd data-testid={`builder-publication-${m.marjaId}`}>
                    {m.active === null
                      ? r.publications.none
                      : formatMessage(r.publications.activeVersion, {
                          version: m.active.version,
                          date: m.active.activatedAt,
                          count: String(m.active.ruleIds.length),
                        })}
                    {m.active?.suspended === true && (
                      // BLD-01: research changed; the version is not served to the public.
                      <span className="text-warning-strong block font-medium">
                        {formatMessage(r.publications.suspended, {
                          rules: m.active.suspendedRules.map((x) => x.ruleId).join(', '),
                        })}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
      <section aria-labelledby="principal-heading" className="flex flex-col gap-3">
        <h2 id="principal-heading" className="text-lg font-semibold">
          {admin.principalHeading}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{admin.username}</dt>
          <dd dir="ltr" className="text-start">
            {me.username}
          </dd>
          <dt className="text-muted-foreground">{admin.signedInAt}</dt>
          <dd>{when.format(new Date(me.authentication.authenticatedAt))}</dd>
          <dt className="text-muted-foreground">{admin.sessionExpiresAt}</dt>
          <dd>{when.format(new Date(me.sessionExpiresAt))}</dd>
        </dl>
      </section>
      <section aria-labelledby="roles-heading" className="flex flex-col gap-3">
        <h2 id="roles-heading" className="text-lg font-semibold">
          {admin.rolesHeading}
        </h2>
        {me.roles.length === 0 ? (
          <p>{admin.noRoles}</p>
        ) : (
          <ul className="list-disc space-y-1 ps-6">
            {me.roles.map((r) => (
              <li key={`${r.role}-${r.scope.marjaIds.join(',')}`}>
                <span dir="ltr">{r.role}</span> —{' '}
                {r.scope.kind === 'ALL'
                  ? admin.allScopes
                  : formatMessage(admin.marjaScope, { ids: r.scope.marjaIds.join(', ') })}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="permissions-heading" className="flex flex-col gap-3">
        <h2 id="permissions-heading" className="text-lg font-semibold">
          {admin.permissionsHeading}
        </h2>
        <ul dir="ltr" className="list-disc space-y-1 ps-6 text-start font-mono text-sm">
          {me.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">{admin.informationalNote}</p>
      </section>
      <section className="flex flex-wrap gap-3">
        <Link href={href('/admin/password')} className={buttonVariants({ variant: 'outline' })}>
          {admin.passwordPage.changeLink}
        </Link>
        {signOut}
      </section>
    </>,
  );
}
