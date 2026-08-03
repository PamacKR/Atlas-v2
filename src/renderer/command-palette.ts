// Deterministic command-palette matching. This module deliberately knows
// nothing about Atlas data or DOM state: the renderer supplies commands and
// decides what each selected command does.

export interface PaletteCommandDefinition {
  id: string;
  label: string;
  group: string;
  aliases: string[];
  keywords?: string[];
  shortcut?: string;
}

export interface PaletteCommandMatch {
  command: PaletteCommandDefinition;
  matchedAlias: string;
  argument: string;
  score: number;
}

export function normalizePaletteText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function paletteTokens(value: string): string[] {
  const normalized = normalizePaletteText(value);
  return normalized ? normalized.split(' ') : [];
}

function tokenMatchScore(query: string, candidate: string): number | null {
  const normalizedQuery = normalizePaletteText(query);
  const normalizedCandidate = normalizePaletteText(candidate);
  if (!normalizedQuery) return 0;
  if (!normalizedCandidate) return null;
  if (normalizedCandidate === normalizedQuery) return 1000;

  const queryTokens = paletteTokens(normalizedQuery);
  const candidateTokens = paletteTokens(normalizedCandidate);
  if (queryTokens.every((token) => candidateTokens.includes(token))) {
    return 820 - Math.max(0, candidateTokens.length - queryTokens.length) * 8;
  }

  const candidatePrefix = candidateTokens.every((token, index) => {
    const queryToken = queryTokens[index];
    return queryToken !== undefined && token.startsWith(queryToken);
  });
  if (candidatePrefix && queryTokens.length <= candidateTokens.length) {
    return 700 - (candidateTokens.length - queryTokens.length) * 8;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) return 620;
  if (queryTokens.every((token) => normalizedCandidate.includes(token))) return 420;
  return null;
}

export function scorePaletteText(query: string, candidate: string, aliases: string[] = []): number | null {
  const candidates = [candidate, ...aliases];
  const scores = candidates
    .map((value) => tokenMatchScore(query, value))
    .filter((score): score is number => score !== null);
  return scores.length ? Math.max(...scores) : null;
}

function commandAliases(command: PaletteCommandDefinition): string[] {
  return [command.label, ...command.aliases].sort(
    (a, b) => normalizePaletteText(b).length - normalizePaletteText(a).length
  );
}

// A command prefix is intentionally stricter than the general search score.
// This makes `export for ai dev eco` a command with `dev eco` as its argument,
// while still leaving a partial phrase like `export fo` in command-search mode.
export function matchPaletteCommandPrefix(
  query: string,
  commands: PaletteCommandDefinition[]
): PaletteCommandMatch | null {
  const normalizedQuery = normalizePaletteText(query);
  if (!normalizedQuery) return null;

  let best: PaletteCommandMatch | null = null;
  for (const command of commands) {
    for (const alias of commandAliases(command)) {
      const normalizedAlias = normalizePaletteText(alias);
      if (!normalizedAlias) continue;
      if (normalizedQuery !== normalizedAlias && !normalizedQuery.startsWith(`${normalizedAlias} `)) continue;

      const argument = normalizedQuery.slice(normalizedAlias.length).trim();
      const score = argument ? 1100 + normalizedAlias.length : 1200 + normalizedAlias.length;
      if (!best || score > best.score) {
        best = { command, matchedAlias: normalizedAlias, argument, score };
      }
    }
  }
  return best;
}

export function rankPaletteCommands(
  query: string,
  commands: PaletteCommandDefinition[]
): Array<{ command: PaletteCommandDefinition; score: number }> {
  return commands
    .map((command) => ({
      command,
      score: scorePaletteText(query, command.label, [...command.aliases, ...(command.keywords ?? [])]),
    }))
    .filter((entry): entry is { command: PaletteCommandDefinition; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label));
}
