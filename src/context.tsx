import { createContext, useContext } from 'react';
import type { Banner, StoreInfo, ThemeView } from './api';

export interface Ctx {
  store: StoreInfo;
  theme: ThemeView;
  banners: Banner[];
  user: { role: 'buyer' | 'owner'; name?: string; phone?: string; email?: string } | null;
  signedIn: (role: 'buyer' | 'owner', token: string) => Promise<void>;
  signOut: () => void;
  reload: () => Promise<void>;
}
export const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => useContext(StoreCtx)!;
