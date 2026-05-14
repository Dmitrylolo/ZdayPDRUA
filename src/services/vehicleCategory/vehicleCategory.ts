import { createMMKV } from 'react-native-mmkv';

export type VehicleCategoryId = 'A' | 'B' | 'C' | 'D' | 'BE' | 'T' | 'all';

export interface VehicleCategory {
  id: VehicleCategoryId;
  label: string;
  emoji: string;
  description: string;
  specificSectionIds: string[];
}

// Sections common to every category (IDs 1–39, those that exist in the dataset)
const GENERAL_SECTION_IDS: string[] = [
  '1','2','3','4','5','6','7','9','10','11','12','13',
  '15','19','20','21','22','23','24','25','26','27','28',
  '29','30','31','32','33','34','35','36','37','38','39',
];

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  {
    id: 'B',
    label: 'B — Легковий',
    emoji: '🚗',
    description: 'Легкові автомобілі та мікроавтобуси',
    specificSectionIds: ['44', '47'],
  },
  {
    id: 'A',
    label: 'A — Мотоцикл',
    emoji: '🏍️',
    description: 'Мотоцикли, мопеди та квадроцикли',
    specificSectionIds: ['40', '41', '42', '43'],
  },
  {
    id: 'C',
    label: 'C — Вантажний',
    emoji: '🚛',
    description: 'Вантажні автомобілі',
    specificSectionIds: ['48', '49', '50', '51'],
  },
  {
    id: 'D',
    label: 'D — Автобус',
    emoji: '🚌',
    description: 'Автобуси та тролейбуси',
    specificSectionIds: ['52', '53', '54', '55'],
  },
  {
    id: 'BE',
    label: 'BE/CE — З причепом',
    emoji: '🚚',
    description: 'Транспортні засоби з причепом',
    specificSectionIds: ['57', '58', '59'],
  },
  {
    id: 'T',
    label: 'T — Трактор',
    emoji: '🚜',
    description: 'Трактори та самохідні машини',
    specificSectionIds: ['60', '61', '62', '63'],
  },
  {
    id: 'all',
    label: 'Всі категорії',
    emoji: '📚',
    description: 'Повний набір питань усіх категорій',
    specificSectionIds: [],
  },
];

const _storage = createMMKV({ id: 'settings' });
const CATEGORY_KEY = 'vehicleCategory';

export const vehicleCategoryStorage = {
  getSelected(): VehicleCategoryId | null {
    const raw = _storage.getString(CATEGORY_KEY);
    if (!raw) return null;
    return raw as VehicleCategoryId;
  },

  setSelected(id: VehicleCategoryId): void {
    _storage.set(CATEGORY_KEY, id);
  },

  /** Returns section IDs for the given category.
   *  Empty array means "all sections" (used for 'all' category). */
  getSectionIds(id: VehicleCategoryId): string[] {
    if (id === 'all') return [];
    const cat = VEHICLE_CATEGORIES.find(c => c.id === id);
    if (!cat) return [];
    return [...GENERAL_SECTION_IDS, ...cat.specificSectionIds];
  },
};
