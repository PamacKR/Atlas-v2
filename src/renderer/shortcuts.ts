// Configurable keyboard shortcuts (ROADMAP.md, Phase 5) — a single registry
// of named actions instead of scattered `keydown` listeners hardcoding a key
// each. Every app-wide shortcut is listed here; the Ctrl+/ cheat sheet
// (renderer.ts's renderShortcutsCheatSheet) is generated straight from this
// list so it can never drift from what's actually bound.
//
// User overrides are stored as one JSON blob in app_settings
// (key: 'shortcuts_overrides', `{ [actionId]: binding }`) — an action with
// no override just falls back to its defaultBinding, so the stored value
// stays small and an unset action is indistinguishable from a reset one.
// Rebinding UI itself is Phase 6 (lives in the redesigned Settings page);
// this module only needs to support *reading* overrides so a change made
// there (once it exists) takes effect without further changes here.

export interface ShortcutAction {
  id: string;
  label: string;
  group: string;
  // A single binding, or several that all trigger the same action (e.g.
  // "Ctrl+L" and "Ctrl+F" both focus search) — only the first is ever shown
  // as *the* binding (cheat sheet, future rebinding UI); the rest are
  // accepted silently as aliases and can't be individually rebound.
  defaultBinding: string | string[];
  // Optional context guard — the action is invisible to the dispatcher
  // (not just a no-op) when this returns false, so e.g. Alt+1 for the
  // Overview course-detail tab does nothing outside a course's detail view
  // rather than fighting over the key with something else.
  when?: () => boolean;
  run: () => void;
}

// Reserved keys that can never be captured by a shortcut, current or future
// — plain Escape and Ctrl+C/V/X/A/Z would make the note editor (or any text
// field) unusable if a shortcut ever stole them, and a bare letter/number
// with no modifier must stay typeable in a text field. Exported for the
// eventual rebinding UI (Phase 6) to enforce at capture time; the
// dispatcher below never receives these as `resolveActiveBinding` inputs to
// begin with since it skips non-navigation keys while typing.
export const RESERVED_BINDINGS = new Set(['Escape', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z']);

// Canonical string form of a keyboard event — e.g. "Ctrl+Shift+N". Modifier
// order is always fixed (Ctrl, Shift, Alt) so two ways of describing the
// same combination always normalize identically, and the bare key is
// title-cased for single letters, otherwise left as the browser reports it
// (KeyboardEvent.key already gives 'Escape', 'ArrowDown', '/', etc. in a
// sensible form).
export function normalizeBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl'); // metaKey folded into Ctrl — no separate Cmd binding on macOS
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  let key = e.key;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

function bindingsOf(action: ShortcutAction): string[] {
  return Array.isArray(action.defaultBinding) ? action.defaultBinding : [action.defaultBinding];
}

// The first (canonical) binding — what's shown in the cheat sheet and what
// the rebinding UI treats as "this action's shortcut." An override of ''
// (empty string) is a deliberate, explicit "unbound" — set when a rebind
// steals this action's only binding away (see the Settings rebinding UI in
// renderer.ts) — distinct from no override at all (undefined), which still
// falls back to the built-in default.
export function primaryBinding(action: ShortcutAction, overrides: Record<string, string>): string {
  const override = overrides[action.id];
  if (override !== undefined) return override; // '' renders as unbound
  return bindingsOf(action)[0];
}

export class ShortcutRegistry {
  private actions: ShortcutAction[] = [];
  private overrides: Record<string, string> = {};

  register(action: ShortcutAction): void {
    this.actions.push(action);
  }

  setOverrides(overrides: Record<string, string>): void {
    this.overrides = overrides;
  }

  all(): ShortcutAction[] {
    return this.actions;
  }

  primaryBindingFor(action: ShortcutAction): string {
    return primaryBinding(action, this.overrides);
  }

  // Resolves a keydown to the one action it should trigger, if any. An
  // override replaces *all* of an action's default bindings (including
  // aliases) — rebinding "focus search" away from Ctrl+L also gives up the
  // Ctrl+F alias, rather than leaving a half-migrated shortcut behind. An
  // override of '' means explicitly unbound (see primaryBinding above) —
  // that action matches nothing at all until rebound again.
  resolve(binding: string): ShortcutAction | null {
    for (const action of this.actions) {
      const override = this.overrides[action.id];
      const candidates = override !== undefined ? (override ? [override] : []) : bindingsOf(action);
      if (candidates.includes(binding)) return action;
    }
    return null;
  }

  // Single entry point for the app's global keydown listener. Returns true
  // if it handled the event (caller should preventDefault), false otherwise.
  dispatch(e: KeyboardEvent): boolean {
    const binding = normalizeBinding(e);
    const action = this.resolve(binding);
    if (!action) return false;
    if (action.when && !action.when()) return false;
    e.preventDefault();
    action.run();
    return true;
  }
}
