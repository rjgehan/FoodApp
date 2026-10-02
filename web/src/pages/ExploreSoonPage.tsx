import { Navigate, useLocation } from 'react-router-dom';
import { NavBar } from '../components/ui';
import { usePushedScreen } from '../components/Layout';
import { SOON, SoonPanel } from '../components/explore/ExploreParts';

/**
 * Behind a door on the Explore screen that is not open yet: Nutrition facts or Meal plans.
 *
 * It says what the thing will do and nothing else. No mocked-up charts, no sample data: a
 * screen that looks finished and does nothing is worse than an empty one, because you cannot
 * tell it apart from a broken one.
 *
 * It reads the same list the Explore screen's doors are built from, so the name on the door
 * and the name on this page can never drift apart.
 */
export default function ExploreSoonPage() {
  const { pathname } = useLocation();
  usePushedScreen();
  const destination = SOON.find((d) => d.to === pathname);
  if (!destination) return <Navigate to="/explore" replace />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <NavBar back="/explore" backLabel="Explore" title={destination.title} />
      <SoonPanel destination={destination} />
    </div>
  );
}
