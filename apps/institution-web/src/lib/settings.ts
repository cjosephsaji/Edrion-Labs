'use client';
import { makeCrudHooks } from './admin';

/** Scope-aware CRUD hooks for the institution settings tree (Phase 11). */
export const { useList: useSettingsList, useMutations: useSettingsMutations } = makeCrudHooks('settings');

export type { SettingRow } from './admin-types';
