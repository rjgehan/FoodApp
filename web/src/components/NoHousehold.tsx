import { Link } from 'react-router-dom';
import { useHousehold } from '../household/HouseholdContext';
import { EmptyState } from './ui';

/**
 * What a page says when you are in no household — new, or just taken out of your last one. It
 * points at the one place that fixes it, rather than leaving a blank page to puzzle over.
 */
export default function NoHousehold() {
  const { loading, lostHousehold } = useHousehold();
  if (loading) return <EmptyState>Loading…</EmptyState>;
  return (
    <div className="space-y-3 py-6 text-center">
      {lostHousehold && <p className="font-semibold">You're no longer in “{lostHousehold}”.</p>}
      <p className="text-[0.9375rem] text-muted">
        {lostHousehold ? "You aren't in a household any more." : "You aren't in a household yet."} Open an
        invite link someone sent you, or start your own.
      </p>
      <Link to="/household" className="press inline-flex h-11 items-center rounded-xl bg-accent px-4 font-semibold text-accent-ink">
        Join or start a household
      </Link>
    </div>
  );
}
