import type { ReactNode } from 'react';
import type { IconName } from './icons';
import { cx, Tile, type Tone } from './ui';

/*
 The pieces the prompts share (the mockup's section 07): the questions the app asks on its own,
 over whatever page it opened on — add an email, time to restock, stock your cupboard. Each is a
 Sheet with its own `head` (no close button: each ends in its own "Not now" or "Skip").
*/

/**
 * A prompt's heading. `stacked` puts the tile over the title, as the add-an-email prompt does
 * (7.1); otherwise it sits beside the title and the line under it, as on Time to restock? (7.2).
 * With no icon it is just the title and the line (Stock your cupboard, 7.3).
 */
export function PromptHead({
  icon,
  tone = 'accent',
  title,
  line,
  stacked = false,
}: {
  icon?: IconName;
  tone?: Tone;
  title: ReactNode;
  line?: ReactNode;
  stacked?: boolean;
}) {
  const words = (
    <div className={cx('min-w-0', stacked ? 'space-y-1.5' : 'space-y-0.5')}>
      <h2 className={cx('serif break-words', stacked || !icon ? 'title-sheet' : 'text-[1.5rem] leading-[1.15]')}>{title}</h2>
      {line && (
        <p className={cx('text-muted', stacked ? 'text-[0.9375rem] leading-[1.45]' : 'text-sm leading-[1.4]')}>{line}</p>
      )}
    </div>
  );
  if (!icon) return <div className="pt-1">{words}</div>;
  return stacked ? (
    <div className="flex flex-col gap-4 pt-1.5">
      <Tile icon={icon} tone={tone} size={52} radius={16} />
      {words}
    </div>
  ) : (
    <div className="flex items-center gap-3 pt-1.5">
      <Tile icon={icon} tone={tone} size={48} radius={14} />
      {words}
    </div>
  );
}

/** The quiet way out under a prompt's main button: "Not now", "Skip", "Skip all for 3 days". */
export const PROMPT_WAY_OUT = '!h-10 -mt-1';
