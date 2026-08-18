<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, ImageIcon, Italic, Link2, List, ListOrdered, Underline } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  invalid?: boolean
}>(), {
  disabled: false,
  invalid: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const linkPanelOpen = ref(false)
const linkUrl = ref('https://')
const selectionVersion = ref(0)

const editor = useEditor({
  content: props.modelValue,
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
  ],
  editorProps: {
    attributes: {
      class: 'min-h-44 px-3 py-3 text-sm leading-7 outline-none',
      'aria-label': '正文富文本编辑器',
    },
  },
  onUpdate: ({ editor: currentEditor }) => emit('update:modelValue', currentEditor.getHTML()),
  onSelectionUpdate: () => { selectionVersion.value += 1 },
  onTransaction: () => { selectionVersion.value += 1 },
})

watch(() => props.modelValue, (value) => {
  if (!editor.value || editor.value.getHTML() === value) return
  editor.value.commands.setContent(value || '<p></p>', { emitUpdate: false })
})

watch(() => props.disabled, (disabled) => editor.value?.setEditable(!disabled))

function isActive(name: string, attributes?: Record<string, unknown>): boolean {
  void selectionVersion.value
  return editor.value?.isActive(name, attributes) ?? false
}

function applyLink(): void {
  const href = linkUrl.value.trim()
  if (!editor.value || !href || href === 'https://') return
  editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run()
  linkPanelOpen.value = false
}

function removeLink(): void {
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  linkPanelOpen.value = false
}

function openLinkPanel(): void {
  const current = editor.value?.getAttributes('link').href
  linkUrl.value = typeof current === 'string' && current ? current : 'https://'
  linkPanelOpen.value = !linkPanelOpen.value
}

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
    :class="invalid ? 'border-destructive' : ''"
  >
    <div class="flex flex-wrap items-center gap-1 border-b bg-muted/45 p-2" role="toolbar" aria-label="正文格式工具栏">
      <Button type="button" size="icon-sm" :variant="isActive('bold') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="加粗" @click="editor?.chain().focus().toggleBold().run()">
        <Bold aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" :variant="isActive('italic') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="斜体" @click="editor?.chain().focus().toggleItalic().run()">
        <Italic aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" :variant="isActive('underline') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="下划线" @click="editor?.chain().focus().toggleUnderline().run()">
        <Underline aria-hidden="true" />
      </Button>
      <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button type="button" size="icon-sm" :variant="isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="二级标题" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">
        <Heading2 aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" :variant="isActive('bulletList') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="无序列表" @click="editor?.chain().focus().toggleBulletList().run()">
        <List aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" :variant="isActive('orderedList') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="有序列表" @click="editor?.chain().focus().toggleOrderedList().run()">
        <ListOrdered aria-hidden="true" />
      </Button>
      <span class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Button type="button" size="icon-sm" :variant="isActive('link') ? 'secondary' : 'ghost'" :disabled="disabled" aria-label="插入或编辑链接" :aria-expanded="linkPanelOpen" @click="openLinkPanel">
        <Link2 aria-hidden="true" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" disabled aria-label="插入图片需要接入上传服务" title="需接入上传服务后启用">
        <ImageIcon aria-hidden="true" />
      </Button>
      <span class="ml-auto text-[11px] text-muted-foreground">图片插入需上传服务</span>
    </div>

    <div v-if="linkPanelOpen" class="flex items-center gap-2 border-b bg-muted/20 p-2">
      <Input v-model="linkUrl" type="url" class="h-9 flex-1" aria-label="链接地址" placeholder="https://example.com" @keydown.enter.prevent="applyLink" />
      <Button type="button" size="sm" @click="applyLink">应用</Button>
      <Button type="button" size="sm" variant="ghost" @click="removeLink">移除</Button>
    </div>

    <EditorContent :editor="editor" />
  </div>
</template>

<style scoped>
:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: var(--muted-foreground);
  content: '请输入正文内容';
  float: left;
  height: 0;
  pointer-events: none;
}

:deep(.ProseMirror h2) {
  margin: 0.75rem 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 700;
}

:deep(.ProseMirror h3) {
  margin: 0.65rem 0 0.3rem;
  font-size: 1.05rem;
  font-weight: 650;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

:deep(.ProseMirror ul) {
  list-style: disc;
}

:deep(.ProseMirror ol) {
  list-style: decimal;
}

:deep(.ProseMirror a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
</style>
