package config

import "testing"

func TestOriginAllowed(t *testing.T) {
	dev := Config{Env: "development", AllowedOrigins: []string{"https://budgetly.example.com"}}
	prod := Config{Env: "production", AllowedOrigins: []string{"https://budgetly.example.com"}}

	cases := []struct {
		origin    string
		dev, prod bool
	}{
		{"https://budgetly.example.com", true, true},
		{"https://budgetly.example.com/", true, true},
		{"http://localhost:3001", true, false},
		{"http://127.0.0.1:3002", true, false},
		{"http://localhost", true, false},
		{"http://localhost.evil.com:3000", false, false},
		{"http://localhost:99999", false, false},
		{"https://localhost:3000", false, false},
		{"https://evil.example.com", false, false},
	}
	for _, c := range cases {
		if got := dev.OriginAllowed(c.origin); got != c.dev {
			t.Errorf("dev %q = %v, want %v", c.origin, got, c.dev)
		}
		if got := prod.OriginAllowed(c.origin); got != c.prod {
			t.Errorf("prod %q = %v, want %v", c.origin, got, c.prod)
		}
	}
}
