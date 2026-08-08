import { Crepe } from '@milkdown/crepe';
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import '@milkdown/crepe/theme/common/style.css';

export interface NoteEditorOptions {
  root: HTMLElement;
  defaultValue: string;
  courseId: number | null;
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
  return crepe;
}

(window as any).atlasNoteEditor = { create: createNoteEditor };
