import type {
  ConversationDetail,
  ConversationSummary,
  FeedQuery,
  Listing,
  Message,
  Photo,
  Profile,
  Prompt,
  User,
} from './types';

const BASE = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: string[];
  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (form) {
    payload = form; // the browser/native layer sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), form ? 60000 : 20000);
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload, signal: controller.signal });
  } catch (e) {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your internet and try again.');
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch (e) {
    /* empty or not JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(
      res.status,
      (data && data.error) || 'error',
      (data && data.message) || 'Something went wrong. Try again.',
      data && data.details
    );
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export type ListingInput = {
  type: 'flat' | 'flatmate';
  role: string;
  locality: string;
  addressLine: string;
  lat: number;
  lng: number;
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
};

export const api = {
  baseUrl: BASE,

  register: (b: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => request<{ token: string; user: User }>('POST', '/auth/login', b),
  me: () => request<{ user: User }>('GET', '/me'),
  updateMe: (b: { name?: string; profile?: Profile }) => request<{ user: User }>('PUT', '/me', b),
  verifyId: () => request<{ user: User }>('POST', '/me/verify-id', { docType: 'aadhaar' }),
  deleteMe: () => request<{ ok: true }>('DELETE', '/me'),

  feed: (q: FeedQuery) =>
    request<{ listings: Listing[]; remaining: number }>('GET', `/feed${qs({ ...q, limit: 8 })}`),
  pass: (id: string) => request<{ ok: true }>('POST', `/listings/${id}/pass`),
  like: (id: string, b: { targetType?: 'photo' | 'prompt'; targetIndex?: number; comment?: string }) =>
    request<{ conversationId: string; status: string }>('POST', `/listings/${id}/like`, b),

  conversations: () => request<{ conversations: ConversationSummary[] }>('GET', '/conversations'),
  conversation: (id: string) => request<{ conversation: ConversationDetail }>('GET', `/conversations/${id}`),
  messages: (id: string, after: number) =>
    request<{ status: ConversationDetail['status']; messages: Message[] }>('GET', `/conversations/${id}/messages?after=${after}`),
  sendMessage: (id: string, body: string) =>
    request<{ message: Message; status: ConversationDetail['status'] }>('POST', `/conversations/${id}/messages`, { body }),
  acceptChat: (id: string) => request<{ status: string }>('POST', `/conversations/${id}/accept`),
  declineChat: (id: string) => request<{ status: string }>('POST', `/conversations/${id}/decline`),

  myListings: () => request<{ listings: Listing[] }>('GET', '/listings/mine'),
  createListing: (b: ListingInput) => request<{ listing: Listing }>('POST', '/listings', b),
  patchListing: (id: string, b: Partial<Omit<ListingInput, 'type'>>) =>
    request<{ listing: Listing }>('PATCH', `/listings/${id}`, b),
  photoNonce: (id: string) =>
    request<{ nonce: string; expiresAt: number; maxDistanceM: number }>('POST', `/listings/${id}/photos/nonce`),
  uploadPhoto: (id: string, form: FormData) =>
    request<{ photo: Photo; count: number; needed: number }>('POST', `/listings/${id}/photos`, undefined, form),
  deletePhoto: (id: string, photoId: string) =>
    request<{ ok: true; count: number }>('DELETE', `/listings/${id}/photos/${photoId}`),
  publish: (id: string) => request<{ listing: Listing }>('POST', `/listings/${id}/publish`),
  takedown: (id: string) => request<{ listing: Listing }>('POST', `/listings/${id}/takedown`),
  relist: (id: string) => request<{ listing: Listing }>('POST', `/listings/${id}/relist`),

  report: (b: { conversationId?: string; listingId?: string; reason: string; details?: string; block: boolean }) =>
    request<{ ok: true; blocked: boolean }>('POST', '/reports', b),
};
