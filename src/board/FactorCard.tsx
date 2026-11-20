import type { ReactNode } from 'react';
import {
  Accessibility, Armchair, Bath, BedDouble, Bike, Building2, BusFront, CarFront,
  DoorOpen, Flame, House, Layers3, ListChecks, MapPin, PawPrint, Scan, Snowflake,
  Star, Trees, WashingMachine, Wallet, type LucideIcon,
} from 'lucide-react';
import { FACTOR_BY_ID, type TravelMode, type Value } from '../model';
import './factor-card.css';

const icons: Record<string, LucideIcon> = {
  private_bedroom: BedDouble, apartment_size: Scan, private_bathroom: Bath,
  laundry: WashingMachine, furnished: Armchair, air_conditioning: Snowflake,
  heat_included: Flame, floor_level: Layers3, indoor_bike_storage: Bike,
  parking_space: CarFront, pet_allowed: PawPrint, one_seat_ride_to_my_pin: BusFront,
  short_walk_to_my_bus_stop: BusFront, private_outdoor_space: Trees, private_entrance: DoorOpen,
  'Campus trips': MapPin, 'Space & layout': House, 'Home basics': Armchair,
  'Bills & lease': Wallet, 'Building amenities': Building2, 'Cost, lease & household': Wallet,
  'Access features': Accessibility,
};

type CardProps = {
  factorId: string;
  value?: Value;
  mode?: TravelMode;
  starred?: boolean;
  onOpen?: () => void;
  buttonId?: string;
  detail?: string;
  handle?: ReactNode;
  actions?: ReactNode;
};

export function FactorCard({ factorId, value, mode, starred, onOpen, buttonId, detail, handle, actions }: CardProps) {
  const factor = FACTOR_BY_ID.get(factorId);
  if (!factor) return null;
  const Icon = icons[factor.id] ?? icons[factor.topic] ?? ListChecks;
  const setting = factor.options.find(option => option.value === value)?.label;
  const modeLabel = factorId === 'commute_to_my_pin' && mode
    ? mode.charAt(0).toUpperCase() + mode.slice(1) : null;
  const description = [modeLabel, setting, detail].filter(Boolean).join(' · ');
  const contents = <>
    <span className="factor-card-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.65} /></span>
    <span className="factor-card-text"><span className="factor-card-title">{factor.label}</span>
      {description && <span className="factor-card-detail">{description}</span>}
    </span>
    {starred && <Star className="factor-card-star" size={16} aria-label="Strong preference" role="img" />}
  </>;
  return <div className="factor-card" data-factor={factorId}>
    <div className="factor-card-line">{handle}
      {onOpen
        ? <button type="button" id={buttonId} onClick={onOpen} className="factor-card-body">{contents}</button>
        : <div className="factor-card-body">{contents}</div>}
    </div>
    {actions && <div className="factor-card-actions">{actions}</div>}
  </div>;
}
