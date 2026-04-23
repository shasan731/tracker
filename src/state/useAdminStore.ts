import { create } from 'zustand';
import type { Account, AccountStatus, ID, PlatformSettings } from '../domain/models';
import { apiFetch, postApi } from '../lib/api';

export interface AdminAccountSummary {
  account: Account;
  counts: {
    contacts: number;
    expenses: number;
    sharedGroups: number;
    sharedExpenses: number;
    loans: number;
    items: number;
    subscriptions: number;
  };
}

export interface AdminStats {
  totalAccounts: number;
  totalUsers: number;
  superadmins: number;
  activeUsers: number;
  heldUsers: number;
}

interface AdminState {
  accounts: AdminAccountSummary[];
  stats?: AdminStats;
  settings?: PlatformSettings;
  loading: boolean;
  error?: string;
  load: (actorAccountId: ID) => Promise<void>;
  toggleAccountCreation: (actorAccountId: ID, enabled: boolean) => Promise<void>;
  updateAccountStatus: (actorAccountId: ID, targetAccountId: ID, status: AccountStatus, reason?: string) => Promise<void>;
  clearAccountData: (actorAccountId: ID, targetAccountId: ID) => Promise<void>;
  resetUserPassword: (actorAccountId: ID, targetAccountId: ID, password: string) => Promise<void>;
  deleteAccount: (actorAccountId: ID, targetAccountId: ID) => Promise<void>;
}

interface AdminOverview {
  accounts: AdminAccountSummary[];
  stats: AdminStats;
  settings: PlatformSettings;
}

export const useAdminStore = create<AdminState>((set) => ({
  accounts: [],
  stats: undefined,
  settings: undefined,
  loading: false,
  error: undefined,

  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const overview = await apiFetch<AdminOverview>('/api/admin?action=overview');
      set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to load admin data', loading: false });
    }
  },

  toggleAccountCreation: async (_actorAccountId, enabled) => {
    const overview = await postApi<AdminOverview>('/api/admin?action=toggleRegistration', { payload: { enabled } });
    set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings });
  },

  updateAccountStatus: async (_actorAccountId, targetAccountId, status, reason) => {
    const action = status === 'held' ? 'holdAccount' : 'releaseAccount';
    const overview = await postApi<AdminOverview>(`/api/admin?action=${action}`, {
      payload: { accountId: targetAccountId, reason },
    });
    set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings });
  },

  clearAccountData: async (_actorAccountId, targetAccountId) => {
    const overview = await postApi<AdminOverview>('/api/admin?action=clearAccountData', {
      payload: { accountId: targetAccountId },
    });
    set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings });
  },

  resetUserPassword: async (_actorAccountId, targetAccountId, password) => {
    const overview = await postApi<AdminOverview>('/api/admin?action=resetPassword', {
      payload: { accountId: targetAccountId, password },
    });
    set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings });
  },

  deleteAccount: async (_actorAccountId, targetAccountId) => {
    const overview = await postApi<AdminOverview>('/api/admin?action=deleteAccount', {
      payload: { accountId: targetAccountId },
    });
    set({ accounts: overview.accounts, stats: overview.stats, settings: overview.settings });
  },
}));
