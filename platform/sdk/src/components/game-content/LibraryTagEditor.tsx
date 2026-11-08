import type { ComponentProps } from 'react';
import { TagEditor } from '@rranker/sdk/components/TagEditor';
import { buildTagHistory } from '@rranker/sdk/domain/user-library';
import type { useUserLibrary } from '@rranker/sdk/hooks/use-user-library';

type Library = ReturnType<typeof useUserLibrary>;
type LibraryTagEditorProps = Pick<ComponentProps<typeof TagEditor>, 'testID' | 'disabled' | 'draft' | 'onDraftChange' | 'onBusyChange'> & {
  library: Library;
  target: Parameters<Library['setTags']>[0];
  fixedPresets?: string[];
};

export function LibraryTagEditor({ library, target, fixedPresets, disabled, ...props }: LibraryTagEditorProps) {
  const key = library.key(target);
  const item = library.data?.find(entry => entry.key === key);
  const presets = fixedPresets ?? library.tagPresets ?? [];
  return <TagEditor {...props} disabled={disabled ?? library.isUpdating}
    readState={library.tagReadState} tags={item?.tags ?? []} presets={presets}
    historyTags={() => buildTagHistory(library.data ?? [], key, presets)}
    presetsEditable={fixedPresets === undefined}
    onPresetsChange={fixedPresets === undefined ? library.setTagPresets : undefined}
    onChange={tags => library.setTags(target, tags)} />;
}
