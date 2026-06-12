// Shared test fixtures for the UI navigation tools.
//
// Build a synthetic UiNode with sensible defaults. Tests override only the
// fields they care about — typical use:
//
//   node({ text: "OK", clickable: true })
//   node({ resource_id: "com.foo:id/bar", bounds: { x1: 0, ... } })
//
// Defaults: empty strings for all text fields, 100x100 bounds at origin,
// all booleans false except `enabled: true` (matches the most common
// non-interactive Android view).
export function node(overrides = {}) {
  return {
    text: "",
    content_desc: "",
    resource_id: "",
    class: "android.view.View",
    package: "com.example",
    bounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
    center: { x: 50, y: 50 },
    clickable: false,
    long_clickable: false,
    scrollable: false,
    focusable: false,
    focused: false,
    enabled: true,
    selected: false,
    checkable: false,
    checked: false,
    ...overrides,
  };
}
