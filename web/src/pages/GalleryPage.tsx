import { useState } from 'react';
import { Icon, ICON_NAMES } from '../components/icons';
import { toast } from '../components/toast';
import {
  ActionMenu,
  Avatar,
  Button,
  Card,
  CheckBox,
  CheckCircle,
  Chip,
  ConfirmAlert,
  Field,
  HUES,
  IconButton,
  Input,
  List,
  NavBar,
  NoteBox,
  Photo,
  Pill,
  Row,
  SearchField,
  SectionHead,
  SectionLabel,
  Segmented,
  Select,
  Sheet,
  StepNumber,
  SwitchKnob,
  Textarea,
  Tile,
} from '../components/ui';
import { PageTitle } from '../components/PageTitle';

/**
 * Every building block in one place, in the theme you are in — for building screens and for
 * checking a change to the design system in light and dark. Development builds only (App.tsx).
 */
export default function GalleryPage() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [on, setOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [alert, setAlert] = useState(false);
  const [chip, setChip] = useState('Top');

  return (
    <div className="space-y-6 pb-10">
      <PageTitle title="Gallery" over="Design system">
        <IconButton label="Search" shape="round">
          <Icon name="search" size={18} />
        </IconButton>
        <ActionMenu
          label="More"
          shape="round"
          items={[
            { label: 'Organise', icon: 'folder', iconTone: 'mustard', detail: 'Drawer and groups', onSelect: () => undefined },
            { label: 'Share', icon: 'share', iconTone: 'herb', onSelect: () => undefined },
            { label: 'Delete', icon: 'trash', tone: 'danger', detail: 'Asks first', onSelect: () => undefined },
          ]}
        />
      </PageTitle>

      <div className="card">
        <NavBar title="Centred nav bar" back={() => undefined} right={<Icon name="plus" size={22} />} className="px-2" />
      </div>

      <SectionHead title="Buttons" action="See all" onAction={() => undefined} />
      <div className="flex flex-wrap gap-2.5">
        <Button size="lg">Primary</Button>
        <Button size="lg" variant="secondary">
          Secondary
        </Button>
        <Button size="lg" variant="soft" icon="cart">
          Soft
        </Button>
        <Button size="lg" variant="ghost">
          Ghost
        </Button>
        <Button size="lg" variant="dark">
          Dark
        </Button>
        <Button size="lg" variant="danger" icon="trash">
          Danger
        </Button>
        <Button size="lg" disabled>
          Disabled
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button>Medium</Button>
        <Button size="sm">Small</Button>
        <Button size="sm" variant="secondary" icon="undo">
          Undo
        </Button>
        <IconButton label="Round" shape="round">
          <Icon name="bulb" size={18} />
        </IconButton>
        <IconButton label="Plain" shape="plain">
          <Icon name="x" size={16} />
        </IconButton>
        <IconButton label="Bare">
          <Icon name="trash" size={20} />
        </IconButton>
        <Avatar name="Ryan" />
        <Avatar name="Gehan house" tone="herb" size={22} />
      </div>

      <SectionHead title="Fields" />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Email" hint="A hint under the field.">
          <Input placeholder="ryan@example.com" />
        </Field>
        <Field label="Section">
          <Select defaultValue="DINNER">
            <option>BREAKFAST</option>
            <option>DINNER</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea rows={3} placeholder="Anything else" />
        </Field>
        <div className="space-y-3.5">
          <SearchField placeholder="Search recipes and saved links" />
          <Segmented
            label="Example"
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'a', label: 'Calendar' },
              { value: 'b', label: 'Upcoming' },
              { value: 'c', label: 'Third' },
            ]}
          />
        </div>
      </div>

      <SectionHead title="Marks" />
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="herb" icon="check">
          On grocery list
        </Pill>
        <Pill tone="mustard" icon="alert">
          Not on list
        </Pill>
        <Pill tone="plum" icon="pin">
          Eating out
        </Pill>
        <Pill tone="sky" icon="cupboard">
          In the cupboard
        </Pill>
        <Pill tone="accent">2 new</Pill>
        <Pill>Neutral</Pill>
        <Pill tone="danger">Danger</Pill>
      </div>
      <div className="flex flex-wrap gap-2">
        {['Top', 'New', 'Planned', 'Done'].map((c) => (
          <Chip key={c} active={chip === c} onClick={() => setChip(c)}>
            {c}
          </Chip>
        ))}
        <Chip icon="leaf">With icon</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle checked={false} />
        <CheckCircle checked />
        <CheckBox checked={false} />
        <CheckBox checked />
        <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)}>
          <SwitchKnob on={on} />
        </button>
        <StepNumber n={1} />
        <Tile icon="coffee" tone="mustard" />
        <Tile icon="sandwich" tone="herb" />
        <Tile icon="soup" tone="accent" />
        <Tile icon="cookie" tone="plum" />
        <Tile icon="cup" tone="sky" />
      </div>
      <NoteBox tone="mustard" icon="alert">
        Tue dinner already has Lemon herb chicken planned. This will be added as a side.
      </NoteBox>
      <NoteBox tone="sky">Cupboard says you have 1.</NoteBox>

      <SectionHead title="Photos" />
      <div className="flex flex-wrap gap-2.5">
        {HUES.map((h) => (
          <Photo key={h} hue={h} className="h-14 w-14 rounded-[14px]" />
        ))}
      </div>
      <Photo hue="mustard" icon="chef" large className="h-40 w-full rounded-card" />

      <Card title="Grouped list">
        <SectionLabel end={4}>Produce</SectionLabel>
        <List inset={52}>
          <Row lead={<CheckCircle checked={false} />} title="3 lemons" subtitle="Lemon herb chicken, Green salad" />
          <Row lead={<CheckCircle checked />} title="bananas" subtitle="Added by Jo" />
          <Row lead={<Tile icon="link" tone="plum" size={34} />} title="Saved links" subtitle="Recipes to try later" detail="27" chevron onClick={() => undefined} />
          <Row title="Sign out" tone="danger" onClick={() => undefined} />
        </List>
      </Card>

      <SectionHead title="Overlays" />
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Sheet
        </Button>
        <Button variant="secondary" onClick={() => setAlert(true)}>
          Alert
        </Button>
        <Button variant="secondary" onClick={() => toast('Added to Tue · Dinner', { icon: 'check', action: { label: 'Undo', onClick: () => undefined } })}>
          Toast
        </Button>
      </div>

      <SectionHead title="Icons" />
      <div className="grid grid-cols-6 gap-3 text-muted sm:grid-cols-10">
        {ICON_NAMES.map((n) => (
          <span key={n} title={n} className="flex flex-col items-center gap-1 text-[0.625rem]">
            <Icon name={n} size={22} className="text-ink" />
            {n}
          </span>
        ))}
      </div>

      {sheet && (
        <Sheet title="Lemon herb chicken" subtitle="Dinner · Tue 29 Sep" onClose={() => setSheet(false)}>
          <div className="space-y-4">
            <Field label="Servings">
              <Input defaultValue="4" />
            </Field>
            <Button size="lg" full>
              Add to plan
            </Button>
          </div>
        </Sheet>
      )}
      {alert && (
        <ConfirmAlert
          icon="trash"
          title="Delete Lemon herb chicken?"
          confirmLabel="Delete recipe"
          cancelLabel="Keep it"
          onConfirm={() => setAlert(false)}
          onCancel={() => setAlert(false)}
        >
          It's planned in <b className="text-ink">Beach crew</b> for Sat 3 Oct. Their plan will keep the name as text.
        </ConfirmAlert>
      )}
    </div>
  );
}
