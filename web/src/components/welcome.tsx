import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { Avatar, cx, Input, Label, type Tone } from './ui';

/*
 The pieces the signed-out pages share (the mockup's section 01): the page itself, the app's mark,
 a field with an icon in it, the invite's "who asked" card and the one-message screen a broken
 link gets. Built on ui.tsx and nothing else, so every theme and both modes come for free.
*/

/**
 * A signed-out page: the paper to the edges, one column. On a phone it starts from the top like
 * the mockup; on a wide screen the column stays phone-width and sits in the middle, rather than
 * stretching a form across a desktop.
 */
export function WelcomePage({
  children,
  className,
  center = false,
}: {
  children: ReactNode;
  className?: string;
  /** Centre the column vertically on phones too — a message with nothing else on the page. */
  center?: boolean;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg px-5 pb-safe pt-safe sm:justify-center sm:py-12">
      <main
        className={cx(
          'mx-auto flex w-full max-w-[400px] flex-1 flex-col pb-6 sm:flex-none',
          center && 'justify-center',
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}

/** The app's mark: the chef's hat on a tomato tile, lifted on a glow of its own colour. */
export function AppMark({ size = 64 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center bg-accent text-on-accent"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        boxShadow: '0 8px 20px rgb(var(--accent) / 0.35)',
      }}
    >
      <Icon name="chef" size={Math.round(size * 0.52)} strokeWidth={1.8} />
    </span>
  );
}

/**
 * A text field with an icon at its start (the mockup's `field` with `i:`), and something at its
 * end — the password's eye, a tick once two passwords match. `label` sits above it as on every
 * form; leave it out where the placeholder says it all (the invite's account form).
 */
export function IconField({
  label,
  icon,
  end,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  icon: IconName;
  end?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      {label && <Label htmlFor={props.id}>{label}</Label>}
      <div className="relative">
        <Icon
          name={icon}
          size={19}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input aria-label={props['aria-label'] ?? label} className={cx('pl-[2.6rem]', end ? 'pr-12' : undefined, className)} {...props} />
        {end && <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">{end}</span>}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** A password field with the eye that shows what was typed — easy to get wrong on a phone. */
export function PasswordField(props: Omit<Parameters<typeof IconField>[0], 'icon' | 'type'> & { icon?: IconName }) {
  const [shown, setShown] = useState(false);
  const { end, icon = 'lock', ...rest } = props;
  return (
    <IconField
      {...rest}
      icon={icon}
      type={shown ? 'text' : 'password'}
      end={
        end ?? (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            // Not "Show password": a label search for the field would find this button too.
            aria-label="Show what's typed"
            aria-pressed={shown}
            className={cx('press flex h-10 w-10 items-center justify-center rounded-full', shown ? 'text-accent-ink' : 'text-muted')}
          >
            <Icon name="eye" size={19} />
          </button>
        )
      }
    />
  );
}

/**
 * Who asked and into what — the top of every invite page. The faces are the person who sent the
 * link and a count of everyone else, which is all a link is allowed to say about a house. (The
 * mockup draws two named faces, "J R +2"; a link may name nobody but the owner — anyone holding
 * it could be a stranger — so the second face stays a count, on purpose.)
 *
 * `ownLink` is somebody already in the house opening its link: nobody invited them, so the line
 * over the name says whose link it is instead of "Ryan invited you to join".
 */
export function InviteHeader({
  household,
  invitedBy,
  memberCount,
  recipeCount,
  ownLink = false,
}: {
  household: string;
  invitedBy: string | null;
  memberCount: number | null;
  recipeCount?: number | null;
  ownLink?: boolean;
}) {
  const people = memberCount ?? 0;
  const others = invitedBy ? people - 1 : people;
  const facts = [
    people > 0 ? `${people} ${people === 1 ? 'person' : 'people'}` : null,
    recipeCount != null ? `${recipeCount} ${recipeCount === 1 ? 'recipe' : 'recipes'}` : null,
  ].filter(Boolean);
  const faces: { label: string; tone: Tone }[] = [];
  if (invitedBy) faces.push({ label: invitedBy, tone: 'herb' });
  if (others > 0) faces.push({ label: `+${others}`, tone: invitedBy ? 'mustard' : 'accent' });
  return (
    <section className="card flex flex-col items-center gap-3.5 px-4 py-[22px] text-center">
      {faces.length > 0 && (
        <div className="mb-0.5 flex" aria-hidden="true">
          {faces.map((f, i) =>
            f.label.startsWith('+') ? (
              <span
                key={f.label}
                className={cx(
                  'flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold ring-2 ring-surface',
                  f.tone === 'mustard' ? 'bg-mustard-soft text-mustard' : 'bg-accent-soft text-accent-ink',
                  i > 0 && '-ml-2.5',
                )}
              >
                {f.label}
              </span>
            ) : (
              <Avatar key={f.label} name={f.label} tone={f.tone} size={44} className={cx('ring-2 ring-surface', i > 0 && '-ml-2.5')} />
            ),
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-[0.9375rem] text-muted">
          {ownLink ? (
            'The invite link for'
          ) : invitedBy ? (
            <>
              <b className="font-semibold text-ink">{invitedBy}</b> invited you to join
            </>
          ) : (
            'You’re invited to join'
          )}
        </p>
        <h1 className="serif text-[1.75rem] leading-tight">{household}</h1>
        {facts.length > 0 && <p className="text-[0.8125rem] text-muted">{facts.join(' · ')}</p>}
      </div>
    </section>
  );
}

/**
 * One thing to say and what to do about it: a link that no longer works, a server that cannot be
 * reached. A big quiet tile, a title, the explanation, and the way on.
 */
export function MessageScreen({
  icon,
  tone,
  title,
  children,
  actions,
  footer,
}: {
  icon: IconName;
  /** A tone for the tile; none is the quiet well (a dead link is not an alarm). */
  tone?: Tone;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const toneClass = tone
    ? { accent: 'bg-accent-soft text-accent-ink', herb: 'bg-herb-soft text-herb', mustard: 'bg-mustard-soft text-mustard', plum: 'bg-plum-soft text-plum', sky: 'bg-sky-soft text-sky' }[tone]
    : 'bg-surface2 text-muted';
  return (
    <WelcomePage className="items-center pt-[70px] text-center sm:pt-0">
      <span aria-hidden="true" className={cx('flex h-[84px] w-[84px] items-center justify-center rounded-[28px]', toneClass)}>
        <Icon name={icon} size={38} />
      </span>
      <div className="mt-5 flex flex-col gap-2">
        <h1 className="title-sheet">{title}</h1>
        <div className="mx-auto max-w-[330px] text-[0.9375rem] leading-normal text-muted">{children}</div>
      </div>
      {actions && <div className="mt-5 flex w-full flex-col gap-2.5">{actions}</div>}
      {footer && <div className="mt-auto w-full pt-8 text-left sm:mt-8">{footer}</div>}
    </WelcomePage>
  );
}
