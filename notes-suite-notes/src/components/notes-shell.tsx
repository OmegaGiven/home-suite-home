import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNotesApp } from '../lib/app-context'
import { screenColors } from '../theme/tokens'
import { HamburgerIcon, LinkIcon, SaveStateIcon, TocIcon, VisibilityIcon } from './notes-icons'
import { NotesRichEditor, type RichEditorCommand } from './notes-rich-editor'

type NotesShellProps = {
  onOpenServers: () => void
  onOpenAppearance: () => void
}

type ToolbarActionKey =
  | 'header'
  | 'undo'
  | 'redo'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'quote'
  | 'link'
  | 'table'
  | 'code'
  | 'list'

type TextSelection = {
  start: number
  end: number
}

const TOOLBAR_ITEMS: Array<{ key: ToolbarActionKey; label: string; content: React.ReactNode }> = [
  { key: 'header', label: 'Header', content: 'H' },
  { key: 'undo', label: 'Undo', content: '↶' },
  { key: 'redo', label: 'Redo', content: '↷' },
  { key: 'bold', label: 'Bold', content: 'B' },
  { key: 'italic', label: 'Italic', content: 'I' },
  { key: 'underline', label: 'Underline', content: 'U' },
  { key: 'strike', label: 'Strike', content: 'S' },
  { key: 'quote', label: 'Quote', content: '❞' },
  { key: 'link', label: 'Link', content: <LinkIcon color={screenColors.text} size={18} /> },
  { key: 'table', label: 'Table', content: '⊞' },
  { key: 'code', label: 'Code', content: '[ ]' },
  { key: 'list', label: 'List', content: '••' },
]

function headingItems(markdown: string) {
  return markdown
    .split('\n')
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^#{1,6}\s/.test(line))
    .map(({ line, index }) => ({
      id: `${index}`,
      level: line.match(/^#{1,6}/)?.[0].length ?? 1,
      label: line.replace(/^#{1,6}\s/, ''),
    }))
}

function formatLastSyncedAt(value: string | null) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not synced yet'
  return `Last synced ${parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

function shareSummary(visibility: 'private' | 'org' | 'users', userCount: number) {
  if (visibility === 'org') return 'Visible to everyone on this server'
  if (visibility === 'users') return userCount > 0 ? `${userCount} invited` : 'Invite-only'
  return 'Private on this server'
}

function mergeConcurrentMarkdown(baseMarkdown: string, localMarkdown: string, remoteMarkdown: string) {
  if (localMarkdown === remoteMarkdown) {
    return localMarkdown
  }
  if (localMarkdown === baseMarkdown) {
    return remoteMarkdown
  }
  if (remoteMarkdown === baseMarkdown) {
    return localMarkdown
  }

  const baseLines = baseMarkdown.split('\n')
  const localLines = localMarkdown.split('\n')
  const remoteLines = remoteMarkdown.split('\n')
  const maxLength = Math.max(baseLines.length, localLines.length, remoteLines.length)
  const merged: string[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const baseLine = baseLines[index]
    const localLine = localLines[index]
    const remoteLine = remoteLines[index]

    if (localLine === remoteLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }
    if (localLine === baseLine) {
      if (remoteLine !== undefined) merged.push(remoteLine)
      continue
    }
    if (remoteLine === baseLine) {
      if (localLine !== undefined) merged.push(localLine)
      continue
    }

    if (remoteLine !== undefined) merged.push(remoteLine)
    if (localLine !== undefined) merged.push(localLine)
  }

  return merged.join('\n')
}

function normalizeSelection(selection: TextSelection | null, text: string) {
  if (!selection) return { start: text.length, end: text.length }
  return selection
}

function lineStart(text: string, index: number) {
  return text.lastIndexOf('\n', Math.max(0, index - 1)) + 1
}

function wrapSelection(text: string, selection: TextSelection, before: string, after = before) {
  const selected = text.slice(selection.start, selection.end) || 'text'
  const nextText = `${text.slice(0, selection.start)}${before}${selected}${after}${text.slice(selection.end)}`
  return {
    text: nextText,
    selection: {
      start: selection.start + before.length,
      end: selection.start + before.length + selected.length,
    },
  }
}

function prefixCurrentLine(text: string, selection: TextSelection, prefix: string) {
  const start = lineStart(text, selection.start)
  const nextText = `${text.slice(0, start)}${prefix}${text.slice(start)}`
  return {
    text: nextText,
    selection: {
      start: selection.start + prefix.length,
      end: selection.end + prefix.length,
    },
  }
}

function surroundCurrentLine(text: string, selection: TextSelection, before: string, after: string) {
  const start = lineStart(text, selection.start)
  const endIndex = text.indexOf('\n', selection.end)
  const end = endIndex === -1 ? text.length : endIndex
  const line = text.slice(start, end)
  const nextText = `${text.slice(0, start)}${before}\n${line}\n${after}${text.slice(end)}`
  return {
    text: nextText,
    selection: {
      start: start + before.length + 1,
      end: start + before.length + 1 + line.length,
    },
  }
}

export function NotesShell({ onOpenServers, onOpenAppearance }: NotesShellProps) {
  const {
    ready,
    notes,
    selectedNote,
    setSelectedNoteId,
    createNoteWithPreferences,
    updateNoteTitle,
    saveSelectedNoteVisibilitySettings,
    listSelectedNoteBindings,
    setSelectedNoteServerSync,
    loadSelectedNoteShare,
    listUsersForServerIdentity,
    updateMarkdown,
    sendCursor,
    editorMode,
    setEditorMode,
    presenceSessions,
    remoteCursors,
    conflicts,
    saveStatus,
    serverAccounts,
    appearance,
  } = useNotesApp()
  const [showToc, setShowToc] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showOpenManager, setShowOpenManager] = useState(false)
  const [showVisibility, setShowVisibility] = useState(false)
  const [showInvitePicker, setShowInvitePicker] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [showTitleEditor, setShowTitleEditor] = useState(false)
  const [showHeaderPicker, setShowHeaderPicker] = useState(false)
  const [showListPicker, setShowListPicker] = useState(false)
  const [showLinkEditor, setShowLinkEditor] = useState(false)
  const [openSearch, setOpenSearch] = useState('')
  const [selectedOpenNoteId, setSelectedOpenNoteId] = useState<string | null>(null)
  const [inviteDraft, setInviteDraft] = useState('')
  const [inviteServerIdentityId, setInviteServerIdentityId] = useState<string | null>(null)
  const [visibilityDraft, setVisibilityDraft] = useState<'private' | 'org' | 'users'>('private')
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([])
  const [visibilityLoading, setVisibilityLoading] = useState(false)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [serverRows, setServerRows] = useState<
    Array<{
      accountId: string
      accountLabel: string
      baseUrl: string
      identityId: string
      label: string
      enabled: boolean
      lastSyncedAt: string | null
      visibility: 'private' | 'org' | 'users'
      userIds: string[]
    }>
  >([])
  const [serverUsers, setServerUsers] = useState<Array<{
    id: string
    username: string
    email: string
    display_name: string
    avatar_path?: string | null
  }>>([])
  const [linkDraft, setLinkDraft] = useState('https://')
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [markdownUndoStack, setMarkdownUndoStack] = useState<string[]>([])
  const [markdownRedoStack, setMarkdownRedoStack] = useState<string[]>([])
  const [editorDraft, setEditorDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [richEditorCommand, setRichEditorCommand] = useState<RichEditorCommand | null>(null)
  const insets = useSafeAreaInsets()
  const draftSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDraftRef = useRef('')
  const latestServerMarkdownRef = useRef('')
  const previousServerMarkdownRef = useRef('')
  const pendingDraftRef = useRef(false)
  const lastSubmittedDraftRef = useRef<string | null>(null)

  const toc = useMemo(() => headingItems(editorDraft), [editorDraft])
  const filteredNotes = useMemo(() => {
    const query = openSearch.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) => `${note.title} ${note.folder}`.toLowerCase().includes(query))
  }, [notes, openSearch])
  const serverOptions = useMemo(
    () =>
      serverAccounts.flatMap((account) =>
        account.identities.map((identity) => ({
          accountId: account.id,
          accountLabel: account.label,
          baseUrl: account.base_url,
          identityId: identity.id,
          label: identity.label || identity.user.display_name || account.label,
        })),
      ),
    [serverAccounts],
  )
  const inviteServerOption = useMemo(
    () => serverOptions.find((option) => option.identityId === inviteServerIdentityId) ?? null,
    [serverOptions, inviteServerIdentityId],
  )
  const inviteableUsers = useMemo(() => {
    const query = inviteDraft.trim().toLowerCase()
    return serverUsers.filter((user) => {
      const haystack = `${user.display_name} ${user.username} ${user.email}`.toLowerCase()
      return !query || haystack.includes(query)
    })
  }, [inviteDraft, serverUsers])
  const selectedInviteUsers = useMemo(
    () => serverUsers.filter((user) => visibilityUserIds.includes(user.id)),
    [serverUsers, visibilityUserIds],
  )

  useEffect(() => {
    latestDraftRef.current = editorDraft
  }, [editorDraft])

  useEffect(() => {
    if (!showVisibility || !selectedNote) return
    let cancelled = false
    setVisibilityLoading(true)
    void (async () => {
      try {
        const bindings = await listSelectedNoteBindings()
        const bindingByIdentity = new Map(bindings.map((binding) => [binding.server_identity_id ?? '', binding]))
        const sharePairs = await Promise.all(
          serverOptions.map(async (option) => {
            if (!bindingByIdentity.has(option.identityId)) {
              return [option.identityId, null] as const
            }
            return [option.identityId, await loadSelectedNoteShare(option.identityId)] as const
          }),
        )
        if (cancelled) return
        const shareByIdentity = new Map(sharePairs)
        setServerRows(
          serverOptions.map((option) => {
            const binding = bindingByIdentity.get(option.identityId)
            const share = shareByIdentity.get(option.identityId)
            return {
              accountId: option.accountId,
              accountLabel: option.accountLabel,
              baseUrl: option.baseUrl,
              identityId: option.identityId,
              label: option.label,
              enabled: Boolean(binding?.remote_note_id),
              lastSyncedAt: binding?.last_pushed_at ?? binding?.last_pulled_at ?? null,
              visibility: share?.visibility ?? selectedNote.visibility,
              userIds: share?.user_ids ?? [],
            }
          }),
        )
      } finally {
        if (!cancelled) setVisibilityLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    showVisibility,
    selectedNote?.id,
    selectedNote?.visibility,
    serverOptions,
  ])

  useEffect(() => {
    const nextMarkdown = selectedNote?.markdown ?? ''
    previousServerMarkdownRef.current = latestServerMarkdownRef.current
    latestServerMarkdownRef.current = nextMarkdown
  }, [selectedNote?.markdown, selectedNote?.id])

  useEffect(() => {
    return () => {
      if (draftSyncTimeoutRef.current) {
        clearTimeout(draftSyncTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const nextMarkdown = selectedNote?.markdown ?? ''
    if (draftSyncTimeoutRef.current) {
      clearTimeout(draftSyncTimeoutRef.current)
      draftSyncTimeoutRef.current = null
    }
    pendingDraftRef.current = false
    lastSubmittedDraftRef.current = nextMarkdown
    setEditorDraft(nextMarkdown)
    setTitleDraft(selectedNote?.title ?? '')
    setSelection(null)
    setMarkdownUndoStack([])
    setMarkdownRedoStack([])
  }, [selectedNote?.id])

  useEffect(() => {
    if (!selectedNote) return
    if (showTitleEditor) return
    setTitleDraft(selectedNote.title)
  }, [selectedNote?.title, showTitleEditor])

  useEffect(() => {
    if (!selectedNote) return
    const remoteMarkdown = selectedNote.markdown
    const localDraft = latestDraftRef.current
    const matchesSubmitted = remoteMarkdown === lastSubmittedDraftRef.current
    const previousRemote = previousServerMarkdownRef.current
    if (!pendingDraftRef.current) {
      setEditorDraft(remoteMarkdown)
      pendingDraftRef.current = false
      return
    }
    if (remoteMarkdown === localDraft) {
      setEditorDraft(remoteMarkdown)
      pendingDraftRef.current = false
      lastSubmittedDraftRef.current = remoteMarkdown
      return
    }
    if (matchesSubmitted) {
      // Ignore acknowledgements for an older submitted draft while the user
      // already has newer local text in flight.
      if (localDraft !== remoteMarkdown) {
        return
      }
      setEditorDraft(remoteMarkdown)
      pendingDraftRef.current = false
      return
    }
    const mergedDraft = mergeConcurrentMarkdown(previousRemote, localDraft, remoteMarkdown)
    setEditorDraft(mergedDraft)
  }, [selectedNote?.markdown, selectedNote?.updated_at])

  if (!ready || !selectedNote) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading Notes Suite Notes…</Text>
      </View>
    )
  }

  const note = selectedNote
  const isMarkdownMode = editorMode === 'rich'
  const activeOpenNote = filteredNotes.find((entry) => entry.id === selectedOpenNoteId) ?? null
  const saveIconColor = saveStatus === 'saved' ? screenColors.success : saveStatus === 'saving' ? screenColors.accent : screenColors.warning
  const animationType = appearance.enableAnimations ? 'fade' : 'none'
  const sheetAnimationType = appearance.enableAnimations ? 'slide' : 'none'

  function queueDraftSync(nextText: string, immediate = false) {
    latestDraftRef.current = nextText
    pendingDraftRef.current = true
    if (draftSyncTimeoutRef.current) {
      clearTimeout(draftSyncTimeoutRef.current)
    }
    const run = () => {
      draftSyncTimeoutRef.current = null
      const draft = latestDraftRef.current
      if (draft === latestServerMarkdownRef.current) {
        pendingDraftRef.current = false
        lastSubmittedDraftRef.current = draft
        return
      }
      lastSubmittedDraftRef.current = draft
      void updateMarkdown(draft).finally(() => {
        if (latestDraftRef.current !== draft) {
          queueDraftSync(latestDraftRef.current, true)
          return
        }
        pendingDraftRef.current = false
      })
    }
    if (immediate) {
      run()
      return
    }
    draftSyncTimeoutRef.current = setTimeout(run, 250)
  }

  function commitEditorText(nextText: string, nextSelection?: TextSelection) {
    const currentDraft = latestDraftRef.current
    if (nextText !== currentDraft) {
      setMarkdownUndoStack((current) => [...current, currentDraft])
      setMarkdownRedoStack([])
    }
    setEditorDraft(nextText)
    queueDraftSync(nextText)
    if (nextSelection) {
      setSelection(nextSelection)
    }
  }

  async function flushEditorDraft() {
    queueDraftSync(latestDraftRef.current, true)
  }

  function handleSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    const nextSelection = event.nativeEvent.selection
    setSelection({ start: nextSelection.start, end: nextSelection.end })
    sendCursor({ offset: nextSelection.end })
  }

  function handleRichEditorChange(nextMarkdown: string) {
    commitEditorText(nextMarkdown)
  }

  function handleRichCursorChange(offset: number | null) {
    sendCursor({ offset })
  }

  async function runMarkdownTransform(transform: (text: string, nextSelection: TextSelection) => { text: string; selection?: TextSelection }) {
    const currentSelection = normalizeSelection(selection, editorDraft)
    const result = transform(editorDraft, currentSelection)
    commitEditorText(result.text, result.selection)
  }

  async function applyHeaderLevel(level: '1' | '2' | '3') {
    if (isMarkdownMode) {
      setRichEditorCommand({ id: `heading-${Date.now()}`, type: 'heading', level })
      setShowHeaderPicker(false)
      return
    }
    await runMarkdownTransform((text, currentSelection) =>
      prefixCurrentLine(text, currentSelection, `${'#'.repeat(Number(level))} `),
    )
    setShowHeaderPicker(false)
  }

  async function applyListStyle(style: 'bullet' | 'dash' | 'checkbox') {
    if (isMarkdownMode) {
      setRichEditorCommand({ id: `list-${Date.now()}`, type: 'list', style })
      setShowListPicker(false)
      return
    }
    const prefix = style === 'bullet' ? '* ' : style === 'dash' ? '- ' : '- [ ] '
    await runMarkdownTransform((text, currentSelection) => prefixCurrentLine(text, currentSelection, prefix))
    setShowListPicker(false)
  }

  async function applyToolbarAction(action: ToolbarActionKey) {
    switch (action) {
      case 'header':
        setShowHeaderPicker(true)
        return
      case 'list':
        setShowListPicker(true)
        return
      case 'undo': {
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `undo-${Date.now()}`, type: 'undo' })
          return
        }
        const previous = markdownUndoStack[markdownUndoStack.length - 1]
        if (!previous) return
        setMarkdownUndoStack((current) => current.slice(0, -1))
        setMarkdownRedoStack((current) => [...current, editorDraft])
        commitEditorText(previous)
        return
      }
      case 'redo': {
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `redo-${Date.now()}`, type: 'redo' })
          return
        }
        const next = markdownRedoStack[markdownRedoStack.length - 1]
        if (!next) return
        setMarkdownRedoStack((current) => current.slice(0, -1))
        setMarkdownUndoStack((current) => [...current, editorDraft])
        commitEditorText(next)
        return
      }
      case 'bold':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `bold-${Date.now()}`, type: 'bold' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => wrapSelection(text, currentSelection, '**'))
        return
      case 'italic':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `italic-${Date.now()}`, type: 'italic' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => wrapSelection(text, currentSelection, '*'))
        return
      case 'underline':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `underline-${Date.now()}`, type: 'underline' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => wrapSelection(text, currentSelection, '<u>', '</u>'))
        return
      case 'strike':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `strike-${Date.now()}`, type: 'strike' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => wrapSelection(text, currentSelection, '~~'))
        return
      case 'quote':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `quote-${Date.now()}`, type: 'quote' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => prefixCurrentLine(text, currentSelection, '> '))
        return
      case 'link':
        setShowLinkEditor(true)
        return
      case 'table':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `table-${Date.now()}`, type: 'table' })
          return
        }
        await runMarkdownTransform((text, currentSelection) => ({
          text: `${text.slice(0, currentSelection.start)}| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |${text.slice(currentSelection.end)}`,
        }))
        return
      case 'code':
        if (isMarkdownMode) {
          setRichEditorCommand({ id: `code-${Date.now()}`, type: 'code' })
          return
        }
        await runMarkdownTransform((text, currentSelection) =>
          surroundCurrentLine(text, currentSelection, '```', '```'),
        )
        return
    }
  }

  function chooseVisibility(value: 'private' | 'org' | 'users') {
    setVisibilityDraft(value)
    if (value !== 'users') {
      setVisibilityUserIds([])
    }
  }

  function toggleInviteUser(userId: string) {
    setVisibilityDraft('users')
    setVisibilityUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  async function toggleServerRow(identityId: string, enabled: boolean) {
    setServerRows((current) => current.map((row) => (row.identityId === identityId ? { ...row, enabled } : row)))
    await setSelectedNoteServerSync({ serverIdentityId: identityId, enabled })
    const bindings = await listSelectedNoteBindings()
    const bindingByIdentity = new Map(bindings.map((binding) => [binding.server_identity_id ?? '', binding]))
    setServerRows((current) =>
      current.map((row) => {
        const binding = bindingByIdentity.get(row.identityId)
        return {
          ...row,
          enabled: Boolean(binding?.remote_note_id),
          lastSyncedAt: binding?.last_pushed_at ?? binding?.last_pulled_at ?? row.lastSyncedAt,
        }
      }),
    )
  }

  async function openInviteEditor(identityId: string) {
    setInviteServerIdentityId(identityId)
    setShowInvitePicker(true)
    setInviteDraft('')
    setVisibilityLoading(true)
    try {
      const [users, share] = await Promise.all([
        listUsersForServerIdentity(identityId),
        loadSelectedNoteShare(identityId),
      ])
      setServerUsers(users)
      setVisibilityDraft(share?.visibility ?? 'private')
      setVisibilityUserIds(share?.user_ids ?? [])
    } finally {
      setVisibilityLoading(false)
    }
  }

  async function saveInviteSettings() {
    if (!inviteServerIdentityId) {
      setShowInvitePicker(false)
      return
    }
    setVisibilitySaving(true)
    try {
      await saveSelectedNoteVisibilitySettings({
        serverIdentityId: inviteServerIdentityId,
        visibility: visibilityDraft,
        userIds: visibilityDraft === 'users' ? visibilityUserIds : [],
      })
      const share = await loadSelectedNoteShare(inviteServerIdentityId)
      setServerRows((current) =>
        current.map((row) =>
          row.identityId === inviteServerIdentityId
            ? {
                ...row,
                visibility: share?.visibility ?? visibilityDraft,
                userIds: share?.user_ids ?? (visibilityDraft === 'users' ? visibilityUserIds : []),
              }
            : row,
        ),
      )
      setShowInvitePicker(false)
    } finally {
      setVisibilitySaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.titleButton} onPress={() => setShowTitleEditor(true)}>
          <Text style={styles.titleButtonText} numberOfLines={1}>
            {note.title || 'Untitled note'}
          </Text>
        </TouchableOpacity>
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.iconButton}>
            <SaveStateIcon color={saveIconColor} size={20} />
          </TouchableOpacity>
          <View style={styles.modeToggle}>
            {([
              ['markdown', 'TXT'],
              ['rich', 'MD'],
            ] as const).map(([mode, label]) => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeToggleButton, editorMode === mode ? styles.modeToggleButtonActive : null]}
                onPress={() => {
                  if (mode === 'rich') {
                    sendCursor({ offset: null, blockId: null })
                    void flushEditorDraft()
                  }
                  setEditorMode(mode)
                }}
              >
                <Text style={styles.modeToggleText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowToc(true)}>
            <TocIcon color={screenColors.text} size={19} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowVisibility(true)}>
            <VisibilityIcon color={screenColors.text} size={19} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowMenu(true)}>
            <HamburgerIcon color={screenColors.text} size={19} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.toolbarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
          {TOOLBAR_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.toolbarButton}
              onPress={() => void applyToolbarAction(item.key)}
            >
              {typeof item.content === 'string' ? (
                <Text
                  style={[
                    styles.toolbarGlyph,
                    item.key === 'bold' ? styles.boldText : null,
                    item.key === 'italic' ? styles.italicText : null,
                    item.key === 'underline' ? styles.underlineText : null,
                    item.key === 'strike' ? styles.strikeText : null,
                  ]}
                >
                  {item.content}
                </Text>
              ) : (
                item.content
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {presenceSessions.length > 0 ? (
        <View style={[styles.presenceOverlay, { top: insets.top + 112 }]} pointerEvents="box-none">
          {presenceSessions.slice(0, 8).map((session) => (
            <View key={session.session_id} style={styles.avatar}>
              <Text style={styles.avatarText}>{session.user_label.slice(0, 2).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {remoteCursors.length > 0 ? (
        <View style={[styles.remoteCursorOverlay, { top: insets.top + 112 }]} pointerEvents="none">
          {remoteCursors.slice(0, 8).map((cursor) => (
            <View key={`${cursor.client_id}-${cursor.note_id}`} style={styles.remoteCursorBadge}>
              <View style={styles.remoteCursorBar} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.editorStage}>
        {isMarkdownMode ? (
          <NotesRichEditor
            markdown={editorDraft}
            onMarkdownChange={handleRichEditorChange}
            onCursorChange={handleRichCursorChange}
            command={richEditorCommand}
            style={styles.richEditorWrap}
          />
        ) : (
          <TextInput
            multiline
            autoFocus
            style={[styles.editor, styles.txtEditor]}
            value={editorDraft}
            onChangeText={commitEditorText}
            onSelectionChange={handleSelectionChange}
            onBlur={() => {
              sendCursor({ offset: null, blockId: null })
              void flushEditorDraft()
            }}
            textAlignVertical="top"
            placeholder="Edit plain text markdown"
            placeholderTextColor={screenColors.muted}
          />
        )}
      </View>

      <Modal visible={showHeaderPicker} transparent animationType={animationType} onRequestClose={() => setShowHeaderPicker(false)}>
        <Pressable style={styles.popoverWrap} onPress={() => setShowHeaderPicker(false)}>
          <Pressable style={styles.popover} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.popoverTitle}>Header size</Text>
            {(['1', '2', '3'] as const).map((level) => (
              <TouchableOpacity key={level} style={styles.popoverOption} onPress={() => void applyHeaderLevel(level)}>
                <Text style={styles.popoverOptionText}>Heading {level}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showTitleEditor} transparent animationType={animationType} onRequestClose={() => setShowTitleEditor(false)}>
        <Pressable style={styles.popoverWrap} onPress={() => setShowTitleEditor(false)}>
          <Pressable style={styles.popover} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.popoverTitle}>Note title</Text>
            <TextInput
              style={styles.popoverInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="Untitled note"
              placeholderTextColor={screenColors.muted}
              autoFocus
            />
            <TouchableOpacity
              style={styles.popoverPrimary}
              onPress={() => {
                void updateNoteTitle(titleDraft.trim() || 'Untitled note')
                setShowTitleEditor(false)
              }}
            >
              <Text style={styles.popoverPrimaryText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showListPicker} transparent animationType={animationType} onRequestClose={() => setShowListPicker(false)}>
        <Pressable style={styles.popoverWrap} onPress={() => setShowListPicker(false)}>
          <Pressable style={styles.popover} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.popoverTitle}>List style</Text>
            {([
              ['bullet', '•', 'Bullet list'],
              ['dash', '—', 'Dash list'],
              ['checkbox', '☐', 'Checkbox list'],
            ] as const).map(([value, icon, label]) => (
              <TouchableOpacity key={value} style={styles.listOption} onPress={() => void applyListStyle(value)}>
                <Text style={styles.listOptionIcon}>{icon}</Text>
                <Text style={styles.popoverOptionText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showLinkEditor} transparent animationType={animationType} onRequestClose={() => setShowLinkEditor(false)}>
        <Pressable style={styles.popoverWrap} onPress={() => setShowLinkEditor(false)}>
          <Pressable style={styles.popover} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.popoverTitle}>Insert link</Text>
            <TextInput
              style={styles.popoverInput}
              value={linkDraft}
              onChangeText={setLinkDraft}
              autoCapitalize="none"
              placeholder="https://"
              placeholderTextColor={screenColors.muted}
            />
            <TouchableOpacity
              style={styles.popoverPrimary}
              onPress={() => {
                const url = linkDraft.trim() || 'https://'
                if (isMarkdownMode) {
                  setRichEditorCommand({ id: `link-${Date.now()}`, type: 'link', url })
                } else {
                  void runMarkdownTransform((text, currentSelection) => wrapSelection(text, currentSelection, '[', `](${url})`))
                }
                setShowLinkEditor(false)
              }}
            >
              <Text style={styles.popoverPrimaryText}>Apply link</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showToc} transparent animationType={sheetAnimationType} onRequestClose={() => setShowToc(false)}>
        <Pressable style={styles.sheetWrap} onPress={() => setShowToc(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>Table of contents</Text>
            <ScrollView>
              {toc.length > 0 ? (
                toc.map((item) => (
                  <Text key={item.id} style={[styles.tocItem, { marginLeft: (item.level - 1) * 16 }]}>
                    {item.label}
                  </Text>
                ))
              ) : (
                <Text style={styles.emptyStateText}>No headings yet.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.sheetAction} onPress={() => setShowToc(false)}>
              <Text style={styles.sheetActionText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showVisibility} transparent animationType={sheetAnimationType} onRequestClose={() => setShowVisibility(false)}>
        <Pressable style={styles.sheetWrap} onPress={() => setShowVisibility(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>Storage & Sharing</Text>
            <View style={styles.sectionCard}>
              <Text style={styles.preferenceTitle}>Connected servers</Text>
              <Text style={styles.preferenceText}>Turn on the places where this note should auto-save and sync.</Text>
              {visibilityLoading ? <Text style={styles.preferenceText}>Loading connected servers…</Text> : null}
              {serverRows.length > 0 ? (
                serverRows.map((row) => (
                  <View key={row.identityId} style={styles.serverSyncRow}>
                    <View style={styles.serverSyncCopy}>
                      <Text style={styles.serverSyncTitle}>{row.accountLabel}</Text>
                      <Text style={styles.serverSyncMeta}>{shareSummary(row.visibility, row.userIds.length)}</Text>
                      <Text style={styles.serverSyncMeta}>{formatLastSyncedAt(row.lastSyncedAt)}</Text>
                    </View>
                    <View style={styles.serverSyncActions}>
                      <TouchableOpacity
                        style={[styles.inviteButton, !row.enabled ? styles.disabledAction : null]}
                        disabled={!row.enabled}
                        onPress={() => void openInviteEditor(row.identityId)}
                      >
                        <Text style={styles.inviteButtonText}>Invite</Text>
                      </TouchableOpacity>
                      <Switch
                        value={row.enabled}
                        onValueChange={(value) => void toggleServerRow(row.identityId, value)}
                        trackColor={{ false: '#223649', true: screenColors.accent }}
                        thumbColor="#f8fbff"
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.preferenceText}>No connected servers yet.</Text>
              )}
            </View>
            <View style={styles.sectionCard}>
              <Text style={styles.preferenceTitle}>Local device</Text>
              <View style={styles.localRow}>
                <View style={styles.localIndicator} />
                <View style={styles.preferenceCopy}>
                  <Text style={styles.serverSyncTitle}>Saved on this device</Text>
                  <Text style={styles.preferenceText}>Local saving stays on automatically, even when you are offline.</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.sheetAction} onPress={() => setShowVisibility(false)}>
              <Text style={styles.sheetActionText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showInvitePicker} transparent animationType={animationType} onRequestClose={() => setShowInvitePicker(false)}>
        <Pressable style={styles.popoverWrap} onPress={() => setShowInvitePicker(false)}>
          <Pressable style={styles.popover} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.popoverTitle}>{inviteServerOption ? `Share on ${inviteServerOption.accountLabel}` : 'Share note'}</Text>
            <View style={styles.visibilityPillRow}>
              {([
                ['private', 'Private'],
                ['org', 'Server'],
                ['users', 'Invite'],
              ] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.pill, visibilityDraft === value ? styles.pillActive : null]}
                  onPress={() => chooseVisibility(value)}
                >
                  <Text style={styles.pillText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.popoverInput}
              value={inviteDraft}
              onChangeText={setInviteDraft}
              placeholder="Search users on this server"
              placeholderTextColor={screenColors.muted}
            />
            {selectedInviteUsers.length > 0 ? (
              <View style={styles.selectedInviteWrap}>
                {selectedInviteUsers.map((user) => (
                  <TouchableOpacity key={user.id} style={styles.selectedInviteChip} onPress={() => toggleInviteUser(user.id)}>
                    <Text style={styles.selectedInviteChipText}>{user.display_name || user.username}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <ScrollView style={styles.inviteList} contentContainerStyle={styles.inviteListContent}>
              {inviteableUsers.length > 0 ? (
                inviteableUsers.map((user) => {
                  const selected = visibilityUserIds.includes(user.id)
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[styles.inviteRow, selected ? styles.inviteRowActive : null]}
                      onPress={() => toggleInviteUser(user.id)}
                    >
                      <View style={styles.inviteCopy}>
                        <Text style={styles.inviteName}>{user.display_name || user.username}</Text>
                        <Text style={styles.inviteMeta}>{user.email || user.username}</Text>
                      </View>
                      <Text style={styles.inviteActionText}>{selected ? 'Added' : 'Add'}</Text>
                    </TouchableOpacity>
                  )
                })
              ) : (
                <Text style={styles.preferenceText}>
                  {inviteServerIdentityId ? 'No users found on this server.' : 'Choose a server first.'}
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.popoverPrimary} onPress={() => void saveInviteSettings()}>
              <Text style={styles.popoverPrimaryText}>{visibilitySaving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showMenu} animationType={sheetAnimationType} onRequestClose={() => setShowMenu(false)}>
        <View style={styles.menuScreen}>
          <Text style={styles.menuHeading}>Menu</Text>
          <TouchableOpacity
            style={styles.menuTile}
            onPress={() => {
              setShowMenu(false)
              setShowOpenManager(true)
            }}
          >
            <Text style={styles.menuTileTitle}>Open</Text>
            <Text style={styles.menuTileText}>Browse local and linked notes, search, and open one.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuTile}
            onPress={() => {
              setShowMenu(false)
              onOpenServers()
            }}
          >
            <Text style={styles.menuTileTitle}>Servers</Text>
            <Text style={styles.menuTileText}>Manage registered servers and linked identities.</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuTile}
            onPress={() => {
              setShowMenu(false)
              onOpenAppearance()
            }}
          >
            <Text style={styles.menuTileTitle}>Appearance</Text>
            <Text style={styles.menuTileText}>Adjust accent, background mode, gradients, font, and motion settings.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetAction} onPress={() => setShowMenu(false)}>
            <Text style={styles.sheetActionText}>Close menu</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showOpenManager} animationType={sheetAnimationType} onRequestClose={() => setShowOpenManager(false)}>
        <View style={styles.managerScreen}>
          <View style={[styles.managerHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.managerTitle}>Open</Text>
            <TextInput
              style={styles.managerSearch}
              placeholder="Search local and server notes"
              placeholderTextColor={screenColors.muted}
              value={openSearch}
              onChangeText={setOpenSearch}
            />
          </View>

          <View style={styles.managerDefaultsCard}>
            <TouchableOpacity style={styles.createNoteButton} onPress={() => void createNoteWithPreferences()}>
              <Text style={styles.createNoteButtonText}>Create new local note</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            style={styles.managerList}
            data={filteredNotes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.managerRow, selectedOpenNoteId === item.id ? styles.managerRowActive : null]}
                onPress={() => setSelectedOpenNoteId(item.id)}
              >
                <View>
                  <Text style={styles.managerRowTitle}>{item.title}</Text>
                  <Text style={styles.managerRowMeta}>
                    {item.folder} · {item.storage_mode === 'synced' ? 'server + local' : 'local'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyStateText}>No notes match that search.</Text>}
          />

          <View style={styles.managerFooter}>
            <TouchableOpacity style={styles.footerGhostButton} onPress={() => setShowOpenManager(false)}>
              <Text style={styles.footerGhostButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerPrimaryButton, !activeOpenNote ? styles.disabledAction : null]}
              onPress={() => {
                if (!activeOpenNote) return
                setSelectedNoteId(activeOpenNote.id)
                setShowOpenManager(false)
              }}
              disabled={!activeOpenNote}
            >
              <Text style={styles.footerPrimaryButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showConflicts} transparent animationType={sheetAnimationType} onRequestClose={() => setShowConflicts(false)}>
        <Pressable style={styles.sheetWrap} onPress={() => setShowConflicts(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>Conflicts</Text>
            <ScrollView>
              {conflicts.map((conflict) => (
                <View key={conflict.id} style={styles.conflictItem}>
                  <Text style={styles.conflictItemTitle}>{conflict.reason}</Text>
                  <Text style={styles.conflictItemMeta}>{conflict.operation_id}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.sheetAction} onPress={() => setShowConflicts(false)}>
              <Text style={styles.sheetActionText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: screenColors.background,
  },
  loadingText: {
    color: screenColors.text,
    fontSize: 18,
  },
  screen: {
    flex: 1,
    backgroundColor: screenColors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d41',
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  titleButtonText: {
    color: screenColors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#122338',
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#122338',
    padding: 3,
  },
  modeToggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  modeToggleButtonActive: {
    backgroundColor: screenColors.accent,
  },
  modeToggleText: {
    color: screenColors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  presenceOverlay: {
    position: 'absolute',
    right: 14,
    zIndex: 20,
    alignItems: 'center',
    gap: 8,
  },
  remoteCursorOverlay: {
    position: 'absolute',
    right: 18,
    zIndex: 19,
    alignItems: 'center',
    gap: 6,
  },
  remoteCursorBadge: {
    paddingHorizontal: 2,
  },
  remoteCursorBar: {
    width: 2,
    height: 18,
    borderRadius: 999,
    backgroundColor: screenColors.accent,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#274765',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  toolbarWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d41',
  },
  toolbar: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#122338',
    paddingHorizontal: 10,
  },
  toolbarButtonDisabled: {
    opacity: 0.45,
  },
  toolbarLetter: {
    color: screenColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  toolbarGlyph: {
    color: screenColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  boldText: {
    fontWeight: '900',
  },
  italicText: {
    fontStyle: 'italic',
  },
  underlineText: {
    textDecorationLine: 'underline',
  },
  strikeText: {
    textDecorationLine: 'line-through',
  },
  editorStage: {
    flex: 1,
  },
  richEditorWrap: {
    flex: 1,
  },
  editor: {
    flex: 1,
    color: screenColors.text,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  txtEditor: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 15,
    lineHeight: 25,
  },
  popoverWrap: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 18, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  popover: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#0f1c2d',
    padding: 18,
    gap: 12,
  },
  popoverTitle: {
    color: screenColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  popoverOption: {
    borderRadius: 14,
    backgroundColor: '#16283a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  popoverOptionText: {
    color: screenColors.text,
    fontWeight: '700',
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: '#16283a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listOptionIcon: {
    color: screenColors.accentSoft,
    fontSize: 18,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  popoverInput: {
    borderRadius: 14,
    backgroundColor: '#16283a',
    color: screenColors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  popoverPrimary: {
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: screenColors.accent,
    paddingVertical: 12,
  },
  popoverPrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  sheetWrap: {
    flex: 1,
    backgroundColor: 'rgba(2, 8, 15, 0.66)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#0d1b2d',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 14,
  },
  sheetTitle: {
    color: screenColors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  sheetAction: {
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: screenColors.accent,
    paddingVertical: 14,
  },
  sheetActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  sheetSecondaryAction: {
    borderRadius: 999,
    backgroundColor: screenColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sheetSecondaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  sectionCard: {
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#112338',
    padding: 16,
  },
  serverSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    backgroundColor: '#182c43',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  serverSyncCopy: {
    flex: 1,
    gap: 4,
  },
  serverSyncTitle: {
    color: screenColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  serverSyncMeta: {
    color: screenColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  serverSyncActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  inviteButton: {
    borderRadius: 999,
    backgroundColor: '#214160',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  localRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#182c43',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  localIndicator: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: screenColors.success,
  },
  visibilityRow: {
    gap: 12,
  },
  serverSelectorButton: {
    borderRadius: 16,
    backgroundColor: '#182c43',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  serverSelectorText: {
    color: screenColors.text,
    fontWeight: '700',
  },
  visibilityPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serverPickerRow: {
    gap: 10,
  },
  serverChip: {
    borderRadius: 999,
    backgroundColor: '#1a3045',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  serverChipActive: {
    backgroundColor: '#335b79',
  },
  serverChipText: {
    color: '#f6f9ff',
    fontWeight: '700',
    fontSize: 13,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    borderRadius: 999,
    backgroundColor: '#1a3045',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillActive: {
    backgroundColor: screenColors.accent,
  },
  pillText: {
    color: '#f6f9ff',
    fontWeight: '700',
    fontSize: 13,
  },
  sheetInput: {
    borderRadius: 16,
    backgroundColor: '#182c43',
    color: screenColors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  preferenceCopy: {
    flex: 1,
    gap: 4,
  },
  preferenceTitle: {
    color: screenColors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  preferenceText: {
    color: screenColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  menuScreen: {
    flex: 1,
    backgroundColor: '#07111d',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 24,
    gap: 16,
  },
  menuHeading: {
    color: screenColors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  menuTile: {
    gap: 8,
    borderRadius: 24,
    backgroundColor: '#102032',
    padding: 18,
    borderWidth: 1,
    borderColor: '#1c3248',
  },
  menuTileTitle: {
    color: screenColors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  menuTileText: {
    color: screenColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  selectedInviteWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedInviteChip: {
    borderRadius: 999,
    backgroundColor: '#1d3550',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedInviteChipText: {
    color: screenColors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  inviteList: {
    maxHeight: 260,
  },
  inviteListContent: {
    gap: 8,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: '#16283a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inviteRowActive: {
    backgroundColor: '#214160',
  },
  inviteCopy: {
    flex: 1,
    gap: 3,
  },
  inviteName: {
    color: screenColors.text,
    fontWeight: '700',
  },
  inviteMeta: {
    color: screenColors.muted,
    fontSize: 12,
  },
  inviteActionText: {
    color: screenColors.accentSoft,
    fontWeight: '700',
    fontSize: 12,
  },
  managerScreen: {
    flex: 1,
    backgroundColor: '#07111d',
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  managerHeader: {
    gap: 14,
    paddingBottom: 18,
  },
  managerTitle: {
    color: screenColors.text,
    fontSize: 30,
    fontWeight: '700',
  },
  managerSearch: {
    borderRadius: 18,
    backgroundColor: '#112338',
    color: screenColors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  managerDefaultsCard: {
    gap: 14,
    borderRadius: 22,
    backgroundColor: '#102032',
    padding: 16,
    marginBottom: 18,
  },
  createNoteButton: {
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: screenColors.accent,
    paddingVertical: 13,
  },
  createNoteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  managerList: {
    flex: 1,
  },
  managerRow: {
    borderRadius: 18,
    backgroundColor: '#0f1d2c',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  managerRowActive: {
    backgroundColor: '#183049',
    borderWidth: 1,
    borderColor: '#35567a',
  },
  managerRowTitle: {
    color: screenColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  managerRowMeta: {
    color: screenColors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  managerFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  footerGhostButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#13253b',
    paddingVertical: 14,
  },
  footerGhostButtonText: {
    color: screenColors.text,
    fontWeight: '700',
  },
  footerPrimaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: screenColors.accent,
    paddingVertical: 14,
  },
  footerPrimaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  disabledAction: {
    backgroundColor: '#36546f',
  },
  tocItem: {
    color: screenColors.text,
    paddingVertical: 8,
    fontSize: 15,
  },
  emptyStateText: {
    color: screenColors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 8,
  },
  conflictItem: {
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: screenColors.border,
    paddingVertical: 12,
  },
  conflictItemTitle: {
    color: screenColors.warning,
    fontWeight: '700',
  },
  conflictItemMeta: {
    color: screenColors.muted,
    fontSize: 12,
  },
})
