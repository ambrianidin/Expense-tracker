package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Env            string
	Port           string
	DatabaseURL    string
	AllowedOrigins []string
	CookieSecure   bool
	TrustProxy     bool
	MigrateOnStart bool
	DBMaxConns     int32

	DBSchema      string
	AuthRateLimit int
}

func (c Config) IsProduction() bool { return c.Env == "production" }

func (c Config) OriginAllowed(origin string) bool {
	origin = strings.TrimRight(origin, "/")
	for _, o := range c.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	if c.IsProduction() {
		return false
	}
	host, ok := strings.CutPrefix(origin, "http://")
	if !ok {
		return false
	}
	name, port, hasPort := strings.Cut(host, ":")
	if name != "localhost" && name != "127.0.0.1" {
		return false
	}
	if !hasPort {
		return true
	}
	n, err := strconv.Atoi(port)
	return err == nil && n > 0 && n < 65536
}

func Load() Config {
	loadDotEnv(".env")
	env := get("APP_ENV", "development")
	return Config{
		Env:            env,
		Port:           get("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		AllowedOrigins: splitList(get("ALLOWED_ORIGINS", "http://localhost:3000")),
		CookieSecure:   getBool("COOKIE_SECURE", env == "production"),
		TrustProxy:     getBool("TRUST_PROXY", true),
		MigrateOnStart: getBool("MIGRATE_ON_START", true),
		DBMaxConns:     int32(getInt("DB_MAX_CONNS", 5)),
		DBSchema:       get("DB_SCHEMA", "budgetly"),
		AuthRateLimit:  getInt("AUTH_RATE_LIMIT", 20),
	}
}

func get(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func getBool(key string, def bool) bool {
	v, err := strconv.ParseBool(get(key, strconv.FormatBool(def)))
	if err != nil {
		return def
	}
	return v
}

func getInt(key string, def int) int {
	v, err := strconv.Atoi(get(key, strconv.Itoa(def)))
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimRight(strings.TrimSpace(p), "/"); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		line := sc.Text()
		if first {

			line = strings.TrimPrefix(line, string(rune(0xFEFF)))
			first = false
		}
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
		val = strings.TrimSpace(val)
		if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
			val = val[1 : len(val)-1]
		}
		if _, exists := os.LookupEnv(key); !exists {
			os.Setenv(key, val)
		}
	}
}
