import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import { DESTINATIONS } from './ExplorePage';

/**
 * Behind a door on the Explore screen that is not open yet.
 *
 * It says what the thing will do and nothing else. No mocked-up charts, no sample data: a
 * screen that looks finished and does nothing is worse than an empty one, because you cannot
 * tell it apart from a broken one.
 *
 * It reads the same list the Explore screen is built from, so the name on the door and the
 * name on this page can never drift apart.
 */
export default function ExploreSoonPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const destination = DESTINATIONS.find((d) => d.to === pathname);

  if (!destination || destination.ready) return <Navigate to="/explore" replace />;
  const { title, Icon, tint, plan } = destination;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate('/explore')}>
        <ChevronLeftIcon className="h-5 w-5" />
        Explore
      </Button>
      <PageTitle title={title} />

      <div className={`rounded-2xl p-5 ${tint}`}>
        <Icon className="h-9 w-9 text-ink/55" />
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink/80">{plan}</p>
      </div>

      <p className="px-1 text-[0.8125rem] text-subtle">Not built yet. This is where it will go.</p>
    </div>
  );
}
