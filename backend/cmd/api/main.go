package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"budgetly/internal/config"
	"budgetly/internal/platform/db"
	"budgetly/internal/server"
	"budgetly/migrations"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL, cfg.DBMaxConns, cfg.DBSchema)
	if err != nil {
		return err
	}
	defer pool.Close()

	if cfg.MigrateOnStart || (len(os.Args) > 1 && os.Args[1] == "migrate") {
		applied, err := db.Migrate(ctx, pool, migrations.FS, cfg.DBSchema)
		if err != nil {
			return err
		}
		slog.Info("migrations up to date", "schema", cfg.DBSchema, "applied", applied)
		if len(os.Args) > 1 && os.Args[1] == "migrate" {
			return nil
		}
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.New(pool, cfg),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
