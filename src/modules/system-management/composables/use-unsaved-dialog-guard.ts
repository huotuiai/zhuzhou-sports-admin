import { useEventListener } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'

export function useUnsavedDialogGuard(
  isOpen: () => boolean,
  isDirty: () => boolean,
  entityLabel: string,
): void {
  function confirmDiscard(): boolean {
    return !isOpen() || !isDirty() || window.confirm(`当前有未保存的${entityLabel}信息，确定放弃吗？`)
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isOpen() || !isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(confirmDiscard)
  useEventListener(window, 'beforeunload', handleBeforeUnload)
}
