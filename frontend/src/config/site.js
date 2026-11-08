import { letterCopy } from './copy.js';
import { musicConfig } from './music.js';

export const site = Object.freeze({
  name: '王若溪大王的生日奇幻之旅',
  account: '宝宝',
  ceremonyCode: '1002', // A public ceremonial unlock, not authentication.
  age: 20,
  relationshipStartDate: '2026-06-27',
  birthday: '2026-11-10',
  lunarBirthday: '十月初二',
  letter: letterCopy.text,
  letterIsPlaceholder: letterCopy.isPlaceholder,
  music: musicConfig,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
  wishesProvider: import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
    ? 'supabase' : 'api',
  wishesEnabled: Boolean(
    (import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim())
    || import.meta.env.VITE_API_BASE_URL?.trim(),
  ),
});
