export type ColorKey = "lavender" | "mint" | "peach" | "butter" | "sky" | "rose" | "sage" | "sand";
export type AccountType = "cash" | "bank" | "ewallet";
export type TxType = "income" | "expense";

export type User = { id: string; name: string; email: string; created_at: string };

export type Snapshot = {
  total_balance_idr: number;
  reserved_savings_idr: number;
  available_to_spend_idr: number;
};

export type Warnings = {
  negative_accounts: string[];
  available_negative: boolean;
  total_negative?: boolean;
  available_to_spend_idr?: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  opening_balance_idr: number;
  opening_date: string;
  is_archived: boolean;
  balance_idr: number;
  has_activity: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  type: TxType;
  icon: string;
  color: ColorKey;
  is_archived: boolean;
  usage_count: number;
  created_at: string;
};

export type CategoryRef = { id: string; name: string; icon: string; color: ColorKey; is_archived: boolean };

export type Transaction = {
  id: string;
  type: TxType;
  amount_idr: number;
  occurred_at: string;
  note: string;
  created_at: string;
  updated_at: string;
  account: { id: string; name: string; type: AccountType; is_archived: boolean };
  category: CategoryRef;
};

export type TransactionPage = {
  items: Transaction[];
  page: number;
  page_size: number;
  total: number;
  totals: { income_idr: number; expense_idr: number; net_idr: number };
};

export type Transfer = {
  id: string;
  amount_idr: number;
  occurred_at: string;
  note: string;
  created_at: string;
  from_account: { id: string; name: string; type: AccountType };
  to_account: { id: string; name: string; type: AccountType };
};

export type BudgetStatus = "safe" | "warning" | "over";

export type Budget = {
  id: string;
  month: string;
  category: CategoryRef;
  limit_idr: number;
  spent_idr: number;
  remaining_idr: number;
  usage_pct: number;
  status: BudgetStatus;
  daily_allowance: { amount_idr: number; days_remaining: number; period: "current" | "past" | "future"; as_of_date: string };
  created_at: string;
};

export type AppNotification = {
  id: string;
  kind: "budget_warning" | "budget_exceeded" | "bill_due";
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

export type NotificationPage = { items: AppNotification[]; total: number; unread_count: number; page: number; page_size: number };

export type BillReminder = {
  id: string;
  title: string;
  amount_idr: number | null;
  due_date: string;
  remind_days_before: number;
  completed_at: string | null;
  created_at: string;
};

export type BillReminderInput = Pick<BillReminder, "title" | "amount_idr" | "due_date" | "remind_days_before">;

export type BudgetTotals = { limit_idr: number; spent_idr: number; remaining_idr: number; usage_pct: number };

export type Goal = {
  id: string;
  title: string;
  target_amount_idr: number;
  target_date: string | null;
  status: "active" | "archived";
  icon: string;
  color: ColorKey;
  saved_idr: number;
  remaining_idr: number;
  progress_pct: number;
  is_completed: boolean;
  created_at: string;
};

export type Allocation = {
  id: string;
  type: "allocate" | "release";
  amount_idr: number;
  note: string;
  occurred_at: string;
};

export type CategorySlice = {
  category_id: string;
  name: string;
  icon: string;
  color: ColorKey;
  amount_idr: number;
  count: number;
  pct: number;
};

export type Summary = Snapshot & {
  month: string;
  monthly_income_idr: number;
  monthly_expense_idr: number;
  net_cash_flow_idr: number;
  transaction_count: number;
  accounts: Account[];
  has_accounts: boolean;
  budgets: { items: Budget[]; totals: BudgetTotals };
  goals: Goal[];
  expense_by_category: CategorySlice[];
  recent_transactions: Transaction[];
  warnings: Warnings;
};

export type MonthTotals = { month: string; income_idr: number; expense_idr: number; net_idr: number };

export type MonthlyReport = {
  month: string;
  income_idr: number;
  expense_idr: number;
  net_idr: number;
  transaction_count: number;
  avg_daily_expense_idr: number;
  savings_rate_pct: number | null;
  previous: MonthTotals;
  trend: MonthTotals[];
  expense_by_category: CategorySlice[];
  income_by_category: CategorySlice[];
  daily: { date: string; income_idr: number; expense_idr: number }[];
};
