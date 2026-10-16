export type ListingType = 'flat' | 'flatmate';

export type Prompt = { q: string; a: string };

export type Photo = { id: string; room: string; url: string; capturedAt: number };

export type Listing = {
  id: string;
  type: ListingType;
  role: string;
  status: 'draft' | 'published' | 'taken_down' | 'under_review' | 'removed';
  locality: string;
  areaLat: number;
  areaLng: number;
  bhk: number;
  sqft: number;
  rent: number;
  deposit: string;
  furnishing: string;
  floor: string;
  availableFrom: string;
  roomType: string;
  alreadyLiving: number;
  nearby: string;
  tags: string[];
  prompts: Prompt[];
  photos: Photo[];
  publishedAt: number | null;
  owner?: { name: string; idVerified: boolean };
  distanceKm?: number;
  // Only present on your own listings.
  addressLine?: string;
  lat?: number;
  lng?: number;
};

export type Profile = {
  work?: string;
  budget?: number;
  moveIn?: string;
  about?: string;
  prompts?: Prompt[];
};

export type User = {
  id: string;
  email: string;
  name: string;
  idStatus: string;
  idVerified: boolean;
  profile: Profile;
};

export type Quote = { label: string; text: string } | null;

export type Message = { id: number; mine: boolean; body: string; quote: Quote; createdAt: number };

export type ChatStatus = 'pending' | 'open' | 'declined';

export type ConversationSummary = {
  id: string;
  status: ChatStatus;
  iAm: 'owner' | 'renter';
  other: { name: string; idVerified: boolean };
  listing: { id: string; type: ListingType; locality: string; rent: number; bhk: number; coverUrl: string | null } | null;
  lastMessage: { body: string; mine: boolean; createdAt: number } | null;
  unread: number;
  updatedAt: number;
};

export type ConversationDetail = {
  id: string;
  status: ChatStatus;
  iAm: 'owner' | 'renter';
  other: { name: string; role: string; idVerified: boolean; profile?: Profile };
  listing: {
    id: string;
    type: ListingType;
    status: string;
    locality: string;
    rent: number;
    bhk: number;
    coverUrl: string | null;
    addressLine?: string;
  } | null;
};

export type FeedQuery = {
  type?: ListingType;
  maxRent?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

export const ROOMS: { key: string; label: string }[] = [
  { key: 'living', label: 'Living room' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'bath', label: 'Bathroom' },
  { key: 'desk', label: 'Work nook' },
  { key: 'terrace', label: 'Terrace' },
  { key: 'exterior', label: 'The building' },
];

export const ROOM_LABEL: Record<string, string> = {
  living: 'Living room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  balcony: 'Balcony',
  exterior: 'The building',
  bath: 'Bathroom',
  desk: 'Work nook',
  terrace: 'Terrace',
  other: 'Other',
};

export const PROMPTS: Record<ListingType, string[]> = {
  flat: [
    'The best part of this house is',
    'Sunday mornings here feel like',
    'You will love the area because',
    'Green flag about this flat',
    'Tiny red flag (we are honest)',
    'Rent hack',
    'The neighbours are',
    'Why I am leaving',
  ],
  flatmate: [
    'My living style',
    'Ideal flatmate energy',
    'Dealbreakers',
    'A typical weeknight at ours',
    'Kitchen rules',
    'Green flag about our place',
    'Our group chat is basically',
    'Weekend plan',
  ],
};

export const RENTER_PROMPTS: string[] = [
  'My ideal Sunday at home',
  'I am a good tenant because',
  'Green flag about me',
  'Dealbreakers for me',
];

export const TAGS: Record<ListingType, string[]> = {
  flat: ['Balcony', 'Terrace', 'Parking', 'Pets OK', 'Furnished', 'Gym', 'Power backup', 'Lake view', 'Garden'],
  flatmate: ['Early bird', 'Night owl', 'WFH', 'Gym rat', 'Cooks a lot', 'Plant parent', 'Quiet', 'Social', 'Pets OK'],
};

export const ROLES: Record<ListingType, string[]> = {
  flat: ['Owner', 'Moving-out tenant'],
  flatmate: ['Flatmate host', 'Owner living here', 'Tenant living here'],
};

export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: 'fake_listing', label: 'Fake listing or photos' },
  { key: 'broker', label: 'Broker pretending to be the owner' },
  { key: 'asked_money', label: 'Asked for money before a visit' },
  { key: 'abusive', label: 'Rude or creepy messages' },
  { key: 'discrimination', label: 'Discrimination' },
  { key: 'other', label: 'Something else' },
];
