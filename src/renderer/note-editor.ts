import { Crepe } from '@milkdown/crepe';
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import '@milkdown/crepe/theme/common/style.css';

export interface NoteEditorOptions {
  root: HTMLElement;
  defaultValue: string;
  courseId: number | null;
  latexPreviewOnlyByDefault?: boolean;
  saveImage: (file: File) => Promise<string>;
  onMarkdownUpdated: () => void;
}

export interface AtlasNoteEditor {
  destroy(): Promise<unknown>;
  getMarkdown(): string;
}

// Headings should read as bold by default. This primes ProseMirror's stored
// marks only while an empty heading is active, so a later manual Ctrl+B still
// works normally.
const autoboldHeadingPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('atlas-autobold-heading'),
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;

        const headingType = newState.schema.nodes.heading;
        const strongType = newState.schema.marks.strong;
        if (!headingType || !strongType) return null;

        const parent = newState.selection.$from.parent;
        if (parent.type !== headingType || parent.content.size !== 0) return null;

        const stored = newState.storedMarks ?? newState.selection.$from.marks();
        if (strongType.isInSet(stored)) return null;

        return newState.tr.setStoredMarks([strongType.create()]);
      },
    })
);

// Crepe keeps the code block's preview/edit choice inside each Vue node view.
// ProseMirror can tear that view down and recreate it when another block is
// edited or when an off-screen block comes back into view, which otherwise
// makes a manually hidden LaTeX source unexpectedly reappear. Track the
// choice at the note-editor level for agent notes and reapply the default only
// to newly created LaTeX blocks. A deliberate click on Edit is respected for
// the lifetime of that block instance.
function installLatexPreviewDefaults(root: HTMLElement): () => void {
  const manuallyExpanded = new WeakSet<HTMLElement>();

  const isLatexBlock = (block: HTMLElement): boolean => {
    const language = block.querySelector<HTMLButtonElement>('.language-button');
    return language?.textContent?.trim().toLowerCase().startsWith('latex') ?? false;
  };

  const applyDefaults = (): void => {
    root.querySelectorAll('.milkdown-code-block').forEach((element) => {
      const block = element as HTMLElement;
      if (!isLatexBlock(block)) return;
      block.classList.add('atlas-latex-block');
      if (manuallyExpanded.has(block)) return;

      const toggle = block.querySelector('.preview-toggle-button') as HTMLButtonElement | null;
      if (toggle?.textContent?.trim().toLowerCase().includes('hide')) toggle.click();
    });
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest('.preview-toggle-button') as HTMLButtonElement | null;
    const block = toggle?.closest('.milkdown-code-block') as HTMLElement | null;
    if (!toggle || !block || !isLatexBlock(block)) return;

    // Before the click, Edit means the source is hidden and the user is
    // deliberately opening it. Hide means the source is visible and the user
    // is deliberately closing it again.
    if (toggle.textContent?.trim().toLowerCase().includes('edit')) {
      manuallyExpanded.add(block);
    } else {
      manuallyExpanded.delete(block);
    }
  };

  const observer = new MutationObserver(applyDefaults);
  root.addEventListener('click', onClick, true);
  observer.observe(root, { childList: true, subtree: true });
  applyDefaults();

  return () => {
    observer.disconnect();
    root.removeEventListener('click', onClick, true);
  };
}

// Chromium only checks editable content when the element explicitly opts in.
// Crepe may recreate the ProseMirror surface while editing, so keep the
// attribute on the prose editor and deliberately leave LaTeX/code editors
// unchecked: academic words should be checked, source syntax should not.
function installNoteSpellcheck(root: HTMLElement): () => void {
  const apply = (): void => {
    root.querySelectorAll<HTMLElement>('.milkdown [contenteditable="true"]').forEach((editor) => {
      const insideCodeBlock = Boolean(editor.closest('.milkdown-code-block'));
      editor.setAttribute('spellcheck', insideCodeBlock ? 'false' : 'true');
      if (!insideCodeBlock) editor.setAttribute('lang', 'en-GB');
    });
  };

  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true });
  apply();

  return () => observer.disconnect();
}

async function createNoteEditor(options: NoteEditorOptions): Promise<AtlasNoteEditor> {
  const crepe = new Crepe({
    root: options.root,
    defaultValue: options.defaultValue,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: options.saveImage,
        inlineOnUpload: options.saveImage,
        blockOnUpload: options.saveImage,
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          h1: { label: 'H1' },
          h2: { label: 'H2' },
          h3: { label: 'H3' },
          h4: { label: 'H4' },
          h5: { label: 'H5' },
          h6: { label: 'H6' },
        },
      },
    },
  });
  crepe.editor.use(autoboldHeadingPlugin);
  crepe.on((listener) => {
    listener.markdownUpdated(options.onMarkdownUpdated);
  });
  await crepe.create();
  const removeNoteSpellcheck = installNoteSpellcheck(options.root);
  const removeLatexPreviewDefaults = options.latexPreviewOnlyByDefault
    ? installLatexPreviewDefaults(options.root)
    : null;

  return {
    getMarkdown: () => crepe.getMarkdown(),
    destroy: async () => {
      removeNoteSpellcheck();
      removeLatexPreviewDefaults?.();
      return crepe.destroy();
    },
  };
}

(window as any).atlasNoteEditor = { create: createNoteEditor };
