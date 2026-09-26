import type { SVGProps } from 'react';

/**
 * Hand-rolled so the app pulls in no icon library. All 24x24, stroked with
 * currentColor, so they inherit text colour and size like a glyph would.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
    <path d="M4 16.5h15" />
  </Icon>
);

export const CartIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.1a2 2 0 0 0 2-1.5L20 8H6" />
    <circle cx="10" cy="20" r="1.2" />
    <circle cx="17" cy="20" r="1.2" />
  </Icon>
);

export const CupboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M12 3v18" />
    <path d="M9.5 10.5v3M14.5 10.5v3" />
  </Icon>
);

/** A compass: the conventional mark for a place you go to find things you do not have yet. */
export const CompassIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
  </Icon>
);

/** Somebody else's kitchen, somewhere else. */
export const GlobeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
  </Icon>
);

/** What is actually in the food, rather than what it is called. */
export const LeafIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20c0-8 5-13 16-13 0 9-5 13-11 13H4z" />
    <path d="M9 15c2-3 4.5-5 8-6.5" />
  </Icon>
);

/** A week of meals aimed at something — the vitamins you are short of. */
export const TargetIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </Icon>
);

/** Bars of a barcode inside a viewfinder's corners — the scan control, not a barcode itself. */
export const BarcodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" />
    <path d="M7.5 8v8M11 8v8M14 8v8M17 8v8" />
  </Icon>
);

export const HouseholdIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M18 15.4c2 .7 3 2.2 3 4.6" />
  </Icon>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Icon>
);

export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M14.5 5 8 12l6.5 7" />
  </Icon>
);

export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9.5 5 16 12l-6.5 7" />
  </Icon>
);

export const ChevronUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 14.5 12 8l7 6.5" />
  </Icon>
);

export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 9.5 12 16l7-6.5" />
  </Icon>
);

export const StoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M3 9l1.5-4.5A1 1 0 0 1 5.5 4h13a1 1 0 0 1 1 .5L21 9" />
    <path d="M9.5 20v-5h5v5" />
  </Icon>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} strokeWidth={2.5}>
    <path d="M5 12.5 10 17.5 19 7" />
  </Icon>
);

export const BackspaceIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" />
    <path d="M17 9.5 12.5 14.5M12.5 9.5 17 14.5" />
  </Icon>
);

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5 16 12l-6 3.5z" />
  </Icon>
);

export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
  </Icon>
);

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20l.9-4.2L15.4 5.3a1.5 1.5 0 0 1 2.1 0l1.2 1.2a1.5 1.5 0 0 1 0 2.1L8.2 19.1z" />
    <path d="M13.5 7.2l3.3 3.3" />
  </Icon>
);

/** The ••• that holds a thing's less-common actions. Filled dots read better than strokes this small. */
export const MoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
  </Icon>
);

/** "Nothing" — a circle struck through, for choosing no picture at all. */
export const NoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M6.5 17.5l11-11" />
  </Icon>
);

/** A warning triangle, for the one thing on a screen you need to know before using it. */
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M10.3 4.3 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4.5M12 17.2v.1" />
  </Icon>
);
