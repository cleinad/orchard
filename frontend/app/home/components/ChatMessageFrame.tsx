import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cx } from '@/app/components/buttonStyles';
import { markdownContentClassName } from '@/lib/markdown';

export function chatMessageContentClassName(
  messageRole: 'user' | 'assistant',
  className?: string
) {
  return cx(
    markdownContentClassName,
    messageRole === 'assistant' ? 'mt-2' : null,
    'text-base leading-relaxed text-foreground',
    className
  );
}

interface ChatMessageFrameProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  children: ReactNode;
  messageRole: 'user' | 'assistant';
  surfaceClassName?: string;
}

export default function ChatMessageFrame({
  children,
  className,
  messageRole,
  surfaceClassName,
  ...props
}: ChatMessageFrameProps) {
  return (
    <div
      {...props}
      className={cx('py-4', className)}
      data-message-role={messageRole}
    >
      <span className="sr-only">
        {messageRole === 'user' ? 'Your message' : 'Response'}
      </span>
      <div
        data-message-presentation={messageRole === 'user' ? 'bubble' : 'plain'}
        className={cx(
          'rounded-2xl transition',
          messageRole === 'user'
            ? 'ml-auto w-fit max-w-[85%] bg-foreground/[0.045] px-4 py-3 ring-1 ring-border-subtle sm:max-w-[36rem]'
            : null,
          surfaceClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
