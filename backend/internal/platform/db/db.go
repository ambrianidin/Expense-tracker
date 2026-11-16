package db

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var schemaRe = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

func Connect(ctx context.Context, databaseURL string, maxConns int32, schema string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is empty")
	}
	if !schemaRe.MatchString(schema) {
		return nil, fmt.Errorf("DB_SCHEMA %q must be lowercase letters, digits or underscores", schema)
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	if usesTransactionPooler(databaseURL) {
		if schema != "public" {
			return nil, fmt.Errorf("DB_SCHEMA=%q needs a session connection: use the Supabase Session pooler (port 5432), not the transaction pooler (port 6543)", schema)
		}
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	}
	searchPath := "SET search_path TO " + pgx.Identifier{schema}.Sanitize()
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, searchPath)
		return err
	}
	cfg.MaxConns = maxConns
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

func usesTransactionPooler(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return u.Port() == "6543"
}

func Migrate(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS, schema string) ([]string, error) {
	if _, err := pool.Exec(ctx, `CREATE SCHEMA IF NOT EXISTS `+pgx.Identifier{schema}.Sanitize()); err != nil {
		return nil, fmt.Errorf("create schema %s: %w", schema, err)
	}
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version text PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return nil, err
	}

	if _, err := pool.Exec(ctx, `ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY`); err != nil {
		return nil, err
	}

	names, err := fs.Glob(fsys, "*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	var applied []string
	for _, name := range names {
		version := strings.TrimSuffix(name, ".sql")
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&exists); err != nil {
			return applied, err
		}
		if exists {
			continue
		}
		sqlBytes, err := fs.ReadFile(fsys, name)
		if err != nil {
			return applied, err
		}
		err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {

			if _, err := tx.Exec(ctx, string(sqlBytes)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version)
			return err
		})
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		applied = append(applied, version)
	}
	return applied, nil
}

func LockUser(ctx context.Context, tx pgx.Tx, userID string) error {
	var one int
	return tx.QueryRow(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&one)
}

func pgCode(err error) (string, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code, pgErr.ConstraintName
	}
	return "", ""
}

func IsUniqueViolation(err error, constraint string) bool {
	code, name := pgCode(err)
	return code == "23505" && (constraint == "" || name == constraint)
}

func IsForeignKeyViolation(err error) bool {
	code, _ := pgCode(err)
	return code == "23503"
}

func IsCheckViolation(err error) bool {
	code, _ := pgCode(err)
	return code == "23514"
}

func IsNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
