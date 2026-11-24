import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from './alert';
import { Badge } from './badge';
import { Button, buttonVariants } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Container } from './container';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { Separator } from './separator';

describe('Button', () => {
  it('renders a native button that defaults to type="button" (no accidental form submits)', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
  });

  it('allows submit buttons and disabled state', () => {
    render(
      <Button type="submit" disabled>
        Send
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button.getAttribute('type')).toBe('submit');
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('exposes variant classes for links without changing their semantics', () => {
    render(
      <a href="/start" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        Start
      </a>,
    );
    const link = screen.getByRole('link', { name: 'Start' });
    expect(link.className).toContain('border-input');
    expect(link.className).toContain('h-12');
  });
});

describe('Alert', () => {
  it('is not a live region by default (static content is not re-announced)', () => {
    const { container } = render(
      <Alert variant="warning">
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Details</AlertDescription>
      </Alert>,
    );
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
  });

  it('can be a polite status or an assertive alert', () => {
    render(
      <>
        <Alert live="status">Saved</Alert>
        <Alert live="alert" variant="destructive">
          Failed
        </Alert>
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe('Saved');
    expect(screen.getByRole('alert').textContent).toBe('Failed');
  });
});

describe('layout primitives', () => {
  it('PageHeader renders a single h1 with description and actions', () => {
    render(
      <PageHeader
        title="History"
        description="Your saved assessments"
        actions={<Button>New</Button>}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Your saved assessments')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy();
  });

  it('EmptyState uses a configurable heading level and hides its icon', () => {
    render(<EmptyState headingLevel={3} title="Nothing here" icon={<svg data-testid="icon" />} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing here' })).toBeTruthy();
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Separator is decorative by default and semantic on request', () => {
    const { container } = render(
      <>
        <Separator />
        <Separator decorative={false} orientation="vertical" />
      </>,
    );
    const [decorative, semantic] = Array.from(container.children);
    expect(decorative?.getAttribute('role')).toBe('none');
    expect(semantic?.getAttribute('role')).toBe('separator');
    expect(semantic?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('Container applies width presets', () => {
    const { container } = render(<Container size="prose">x</Container>);
    expect(container.firstElementChild?.className).toContain('max-w-3xl');
  });

  it('Badge and Card render their content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="success">Approved</Badge>
        </CardContent>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('Approved').className).toContain('bg-success-soft');
  });
});
