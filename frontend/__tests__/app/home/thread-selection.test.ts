import { describe, expect, it } from 'vitest';
import { isThreadSelectableMessage } from '@/app/home/components/threadSelection';

describe('isThreadSelectableMessage', () => {
  it('accepts a settled assistant reply', () => {
    expect(
      isThreadSelectableMessage({ role: 'assistant', isError: false, isStreaming: false })
    ).toBe(true);
  });

  it('rejects a reply that is still streaming', () => {
    expect(
      isThreadSelectableMessage({ role: 'assistant', isError: false, isStreaming: true })
    ).toBe(false);
  });

  it('rejects an error reply', () => {
    expect(
      isThreadSelectableMessage({ role: 'assistant', isError: true, isStreaming: false })
    ).toBe(false);
  });

  it('rejects a streaming error reply', () => {
    expect(
      isThreadSelectableMessage({ role: 'assistant', isError: true, isStreaming: true })
    ).toBe(false);
  });

  it('rejects user messages and unresolved roles', () => {
    expect(
      isThreadSelectableMessage({ role: 'user', isError: false, isStreaming: false })
    ).toBe(false);
    expect(isThreadSelectableMessage({ role: null, isError: false, isStreaming: false })).toBe(
      false
    );
  });
});
