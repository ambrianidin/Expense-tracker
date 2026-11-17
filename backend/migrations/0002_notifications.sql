CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source_key text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('budget_warning', 'budget_exceeded', 'bill_due')),
    title text NOT NULL,
    body text NOT NULL,
    href text NOT NULL,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, source_key)
);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC, id);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE bill_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    amount_idr bigint CHECK (amount_idr > 0 AND amount_idr <= 1000000000000),
    due_date date NOT NULL CHECK (due_date BETWEEN '2000-01-01' AND '2100-12-31'),
    remind_days_before integer NOT NULL DEFAULT 3 CHECK (remind_days_before BETWEEN 0 AND 30),
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bill_reminders_user_due_idx ON bill_reminders (user_id, due_date);
ALTER TABLE bill_reminders ENABLE ROW LEVEL SECURITY;
