package catalog

import (
	"regexp"
	"slices"
)

var Colors = []string{"lavender", "mint", "peach", "butter", "sky", "rose", "sage", "sand"}

var iconRe = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

func ValidColor(c string) bool { return slices.Contains(Colors, c) }

func ValidIcon(i string) bool { return iconRe.MatchString(i) }
