"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

/**
 * FAQ accordion.
 *
 * Radix handles the keyboard interaction and aria wiring. Answers are in the
 * DOM whether open or closed, so search engines index them and Ctrl+F finds
 * them — a details/summary pattern that renders nothing until clicked hides
 * content from both.
 */
export function FaqAccordion({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  if (faqs.length === 0) return null;

  return (
    <Accordion.Root
      type="multiple"
      className="divide-y divide-[--color-hairline] border-y border-[--color-hairline]"
    >
      {faqs.map((faq, index) => (
        <Accordion.Item key={index} value={`faq-${index}`}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-start justify-between gap-4 py-5 text-left">
              <span className="text-base font-semibold text-[--color-primary]">{faq.question}</span>
              <ChevronDown
                className="mt-0.5 size-5 shrink-0 text-[--color-ink-subtle] transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-[accordion-up_150ms_ease-out] data-[state=open]:animate-[accordion-down_150ms_ease-out]">
            <p className="pb-5 text-[15px] leading-relaxed text-[--color-ink-muted]">
              {faq.answer}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
