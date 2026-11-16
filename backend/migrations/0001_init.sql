CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
    token_hash bytea PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name                text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    type                text NOT NULL CHECK (type IN ('cash', 'bank', 'ewallet')),
    opening_balance_idr bigint NOT NULL DEFAULT 0 CHECK (opening_balance_idr >= 0),
    opening_date        date NOT NULL DEFAULT CURRENT_DATE,
    is_archived         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT accounts_id_user_key UNIQUE (id, user_id)
);
CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    type        text NOT NULL CHECK (type IN ('income', 'expense')),
    icon        text NOT NULL DEFAULT 'tag' CHECK (icon ~ '^[a-z0-9-]{1,32}$'),
    color       text NOT NULL DEFAULT 'lavender',
    is_archived boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT categories_id_user_key UNIQUE (id, user_id),
    CONSTRAINT categories_id_user_type_key UNIQUE (id, user_id, type)
);
CREATE INDEX categories_user_id_idx ON categories (user_id);
CREATE UNIQUE INDEX categories_active_name_key
    ON categories (user_id, type, lower(name)) WHERE NOT is_archived;

CREATE TABLE transactions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id  uuid NOT NULL,
    category_id uuid NOT NULL,
    type        text NOT NULL CHECK (type IN ('income', 'expense')),
    amount_idr  bigint NOT NULL CHECK (amount_idr > 0),
    occurred_at timestamptz NOT NULL,
    note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
    deleted_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transactions_account_fk FOREIGN KEY (account_id, user_id)
        REFERENCES accounts (id, user_id),
    CONSTRAINT transactions_category_fk FOREIGN KEY (category_id, user_id, type)
        REFERENCES categories (id, user_id, type)
);
CREATE INDEX transactions_user_occurred_idx ON transactions (user_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX transactions_account_idx ON transactions (account_id) WHERE deleted_at IS NULL;
CREATE INDEX transactions_category_idx ON transactions (category_id, occurred_at) WHERE deleted_at IS NULL;

CREATE TABLE transfers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    from_account_id uuid NOT NULL,
    to_account_id   uuid NOT NULL,
    amount_idr      bigint NOT NULL CHECK (amount_idr > 0),
    occurred_at     timestamptz NOT NULL,
    note            text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
    deleted_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT transfers_distinct_accounts CHECK (from_account_id <> to_account_id),
    CONSTRAINT transfers_from_fk FOREIGN KEY (from_account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT transfers_to_fk FOREIGN KEY (to_account_id, user_id) REFERENCES accounts (id, user_id)
);
CREATE INDEX transfers_user_occurred_idx ON transfers (user_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX transfers_from_idx ON transfers (from_account_id) WHERE deleted_at IS NULL;
CREATE INDEX transfers_to_idx ON transfers (to_account_id) WHERE deleted_at IS NULL;

CREATE TABLE budgets (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    category_id   uuid NOT NULL,
    
    category_type text NOT NULL DEFAULT 'expense' CHECK (category_type = 'expense'),
    month_start   date NOT NULL CHECK (EXTRACT(DAY FROM month_start) = 1),
    limit_idr     bigint NOT NULL CHECK (limit_idr > 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT budgets_user_category_month_key UNIQUE (user_id, category_id, month_start),
    CONSTRAINT budgets_category_fk FOREIGN KEY (category_id, user_id, category_type)
        REFERENCES categories (id, user_id, type)
);
CREATE INDEX budgets_user_month_idx ON budgets (user_id, month_start);

CREATE TABLE savings_goals (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title             text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
    target_amount_idr bigint NOT NULL CHECK (target_amount_idr > 0),
    target_date       date,
    icon              text NOT NULL DEFAULT 'piggy-bank' CHECK (icon ~ '^[a-z0-9-]{1,32}$'),
    color             text NOT NULL DEFAULT 'mint',
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT savings_goals_id_user_key UNIQUE (id, user_id)
);
CREATE INDEX savings_goals_user_idx ON savings_goals (user_id, status);


CREATE TABLE goal_allocations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    goal_id     uuid NOT NULL,
    type        text NOT NULL CHECK (type IN ('allocate', 'release')),
    amount_idr  bigint NOT NULL CHECK (amount_idr > 0),
    note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT goal_allocations_goal_fk FOREIGN KEY (goal_id, user_id)
        REFERENCES savings_goals (id, user_id) ON DELETE CASCADE
);
CREATE INDEX goal_allocations_goal_idx ON goal_allocations (goal_id, occurred_at DESC);
CREATE INDEX goal_allocations_user_idx ON goal_allocations (user_id);

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_allocations ENABLE ROW LEVEL SECURITY;
