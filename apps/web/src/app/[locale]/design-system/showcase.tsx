import { Inbox, Info } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@khums/ui/components/alert';
import { Badge } from '@khums/ui/components/badge';
import { Button } from '@khums/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@khums/ui/components/card';
import { Container } from '@khums/ui/components/container';
import { EmptyState } from '@khums/ui/components/empty-state';
import { Field } from '@khums/ui/components/field';
import { Input } from '@khums/ui/components/input';
import { MockCalculationNotice } from '@khums/ui/components/mock-calculation-notice';
import { NativeSelect } from '@khums/ui/components/native-select';
import { PageHeader } from '@khums/ui/components/page-header';
import { Textarea } from '@khums/ui/components/textarea';

const swatches = [
  'bg-background',
  'bg-card',
  'bg-muted',
  'bg-primary',
  'bg-primary-soft',
  'bg-secondary',
  'bg-accent',
  'bg-success',
  'bg-warning',
  'bg-destructive',
  'bg-info',
  'bg-mock',
  'bg-provisional',
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  return (
    <Container className="flex flex-col gap-12 py-10">
      <PageHeader
        eyebrow="Internal"
        title="Design system"
        description="Tokens and shared components (M4.1)."
      />

      <Section title="Colour roles">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map((swatch) => (
            <li key={swatch} className="flex flex-col gap-2 text-xs">
              <div className={`${swatch} h-14 rounded-md border`} />
              <code>{swatch}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Delete</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success">Approved</Badge>
          <Badge variant="warning">Needs review</Badge>
          <Badge variant="destructive">Blocked</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section title="Mock calculation notice">
        <MockCalculationNotice>
          Figures on this screen come from a mock rule pack.
        </MockCalculationNotice>
        <p className="text-sm">
          Inline: <MockCalculationNotice variant="inline" />
        </p>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>Neutral, helpful context.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Consultation required</AlertTitle>
            <AlertDescription>
              This case needs individual guidance from your Marja&apos;s office.
            </AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Your assessment is stored on this device.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Invalid input</AlertTitle>
            <AlertDescription>Enter amounts as plain numbers, e.g. 1234.56.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Form fields">
        <Card>
          <CardHeader>
            <CardTitle>Example entry</CardTitle>
            <CardDescription>
              Labels, descriptions and errors are wired for assistive technology.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <Field label="Amount" description="Use a decimal such as 1234.56" required>
              <Input inputMode="decimal" className="tabular-nums" placeholder="0.00" />
            </Field>
            <Field label="Amount (with error)" error="Enter a valid amount, e.g. 1234.56">
              <Input inputMode="decimal" defaultValue="12,34" />
            </Field>
            <Field label="Currency">
              <NativeSelect defaultValue="USD">
                <option value="USD">US dollar (USD)</option>
                <option value="GBP">Pound sterling (GBP)</option>
                <option value="KWD">Kuwaiti dinar (KWD)</option>
              </NativeSelect>
            </Field>
            <Field label="Description" description="Optional">
              <Textarea placeholder="e.g. Savings account" />
            </Field>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="outline">Cancel</Button>
            <Button>Save entry</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Empty state">
        <EmptyState
          headingLevel={3}
          icon={<Inbox />}
          title="No assessments yet"
          description="Start your first assessment to see it here."
          action={<Button>Start assessment</Button>}
        />
      </Section>
    </Container>
  );
}
