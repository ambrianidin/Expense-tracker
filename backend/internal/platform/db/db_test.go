package db

import (
	"context"
	"strings"
	"testing"
)

func TestConnectRejectsUnsafeConfigsBeforeDialing(t *testing.T) {
	ctx := context.Background()

	_, err := Connect(ctx, "postgresql://u:p@example.invalid:6543/postgres", 1, "budgetly")
	if err == nil || !strings.Contains(err.Error(), "Session pooler") {
		t.Fatalf("transaction pooler + schema: err = %v", err)
	}

	for _, bad := range []string{"", "Budgetly", "bud-getly", "1abc", `x"; DROP SCHEMA public; --`} {
		if _, err := Connect(ctx, "postgresql://u:p@example.invalid:5432/postgres", 1, bad); err == nil || !strings.Contains(err.Error(), "DB_SCHEMA") {
			t.Errorf("schema %q should be rejected, err = %v", bad, err)
		}
	}
}
