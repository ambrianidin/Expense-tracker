"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, qs } from "./client";
import type {
  Account,
  Allocation,
  Budget,
  BudgetTotals,
  BillReminder,
  NotificationPage,
  Category,
  Goal,
  MonthlyReport,
  Snapshot,
  Summary,
  Transaction,
  TransactionPage,
  Transfer,
  TxType,
  User,
  Warnings,
} from "./types";

export const keys = {
  me: ["me"] as const,
  accounts: (archived: boolean) => ["accounts", archived] as const,
  categories: (archived: boolean) => ["categories", archived] as const,
  transactions: (f: TransactionFilters) => ["transactions", f] as const,
  transfers: ["transfers"] as const,
  budgets: (month: string) => ["budgets", month] as const,
  goals: (status: string) => ["goals", status] as const,
  allocations: (id: string) => ["allocations", id] as const,
  summary: (month: string) => ["summary", month] as const,
  report: (month: string) => ["report", month] as const,
  notifications: (unreadOnly = false, page = 1) => ["notifications", unreadOnly, page] as const,
  reminders: ["bill-reminders"] as const,
};


export function invalidateFinance(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<{ user: User }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: keys.accounts(includeArchived),
    queryFn: () =>
      api<{ items: Account[]; summary: Snapshot }>(`/accounts${qs({ include_archived: includeArchived || undefined })}`),
  });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: keys.categories(includeArchived),
    queryFn: () =>
      api<{ items: Category[] }>(`/categories${qs({ include_archived: includeArchived || undefined })}`).then(
        (r) => r.items,
      ),
    staleTime: 5 * 60_000,
  });
}

export type TransactionFilters = {
  month?: string;
  type?: TxType | "";
  account_id?: string;
  category_id?: string;
  q?: string;
  page?: number;
  page_size?: number;
};

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () => api<TransactionPage>(`/transactions${qs(filters)}`),
    placeholderData: (prev) => prev,
  });
}

export function useTransfers() {
  return useQuery({
    queryKey: keys.transfers,
    queryFn: () => api<{ items: Transfer[]; total: number }>(`/transfers?page_size=50`),
  });
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: keys.budgets(month),
    queryFn: () => api<{ month: string; items: Budget[]; totals: BudgetTotals }>(`/budgets${qs({ month })}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
}

export function useNotifications(unreadOnly = false, page = 1, enabled = true) {
  return useQuery({
    queryKey: keys.notifications(unreadOnly, page),
    queryFn: () => api<NotificationPage>(`/notifications${qs({ unread_only: unreadOnly || undefined, page })}`),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useBillReminders() {
  return useQuery({
    queryKey: keys.reminders,
    queryFn: () => api<{ items: BillReminder[]; total: number }>("/bill-reminders"),
    refetchInterval: 60_000,
  });
}

export function useGoals(status: "active" | "archived" | "all") {
  return useQuery({
    queryKey: keys.goals(status),
    queryFn: () => api<{ items: Goal[]; summary: Snapshot }>(`/savings-goals${qs({ status })}`),
  });
}

export function useAllocations(goalId: string | null) {
  return useQuery({
    queryKey: keys.allocations(goalId ?? ""),
    queryFn: () => api<{ goal: Goal; items: Allocation[] }>(`/savings-goals/${goalId}/allocations`),
    enabled: !!goalId,
  });
}

export function useSummary(month: string) {
  return useQuery({
    queryKey: keys.summary(month),
    queryFn: () => api<Summary>(`/dashboard/summary${qs({ month })}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
}

export function useReport(month: string) {
  return useQuery({
    queryKey: keys.report(month),
    queryFn: () => api<MonthlyReport>(`/reports/monthly${qs({ month })}`),
    placeholderData: (prev) => prev,
  });
}


export function useFinanceMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidateFinance(qc),
  });
}

export type TxWriteResult = { transaction: Transaction; warnings: Warnings };
export type TransferWriteResult = { transfer: Transfer; warnings: Warnings };
