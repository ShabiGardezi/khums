import { ChevronDown } from 'lucide-react';

import { getI18n } from '@/i18n/server';

import { LandingSection } from './section';

/**
 * Native <details>/<summary> disclosure: keyboard- and screen-reader-accessible without JS,
 * and every answer stays findable with in-page search.
 */
export async function Faq() {
  const {
    landing: { faq },
  } = await getI18n();
  return (
    <LandingSection id={faq.id} eyebrow={faq.eyebrow} title={faq.title} tone="card">
      <div className="bg-background divide-y rounded-lg border">
        {faq.items.map((item) => (
          <details key={item.question} className="group">
            <summary className="hover:bg-muted flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-medium">{item.question}</h3>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="text-muted-foreground flex flex-col gap-3 px-5 pb-5 leading-relaxed">
              {item.answer.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </LandingSection>
  );
}
