import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ServerAccount } from 'notes-suite-contracts'
import { useNotesApp } from '../src/lib/app-context'
import { LinkIcon } from '../src/components/notes-icons'
import { testServerConnection } from '../src/sync/api'
import { screenColors } from '../src/theme/tokens'

type ServersScreenProps = {
  onBack?: () => void
}

type ConnectionState = {
  state: 'idle' | 'testing' | 'connected' | 'disconnected'
  message?: string
}

type ServerEditorState = {
  label: string
  baseUrl: string
  identifier: string
  password: string
}

const EMPTY_EDITOR: ServerEditorState = {
  label: '',
  baseUrl: '',
  identifier: '',
  password: '',
}

function PencilIcon() {
  return <Text style={styles.pencilIcon}>✎</Text>
}

export default function ServersScreen({ onBack }: ServersScreenProps) {
  const insets = useSafeAreaInsets()
  const {
    serverAccounts,
    connectingServer,
    upsertPasswordServer,
    upsertOidcServer,
  } = useNotesApp()
  const [showEditor, setShowEditor] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editor, setEditor] = useState<ServerEditorState>(EMPTY_EDITOR)
  const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({})
  const [savingMode, setSavingMode] = useState<'password' | 'oidc'>('password')
  const activeEditingAccount = useMemo(
    () => serverAccounts.find((account) => account.id === editingAccountId) ?? null,
    [serverAccounts, editingAccountId],
  )

  useEffect(() => {
    for (const account of serverAccounts) {
      if (connectionStates[account.id]?.state && connectionStates[account.id]?.state !== 'idle') continue
      void runConnectionTest(account)
    }
  }, [serverAccounts])

  function openNewServerModal() {
    setEditingAccountId(null)
    setEditor(EMPTY_EDITOR)
    setSavingMode('password')
    setShowEditor(true)
  }

  function openEditServerModal(account: ServerAccount) {
    const identity = account.identities[0]
    setEditingAccountId(account.id)
    setEditor({
      label: account.label,
      baseUrl: account.base_url,
      identifier: identity?.user.email || identity?.user.username || identity?.label || '',
      password: '',
    })
    setSavingMode(identity?.auth_type === 'oidc' ? 'oidc' : 'password')
    setShowEditor(true)
  }

  async function runConnectionTest(account: ServerAccount) {
    setConnectionStates((current) => ({
      ...current,
      [account.id]: { state: 'testing', message: 'Testing connection…' },
    }))
    try {
      await testServerConnection(account.base_url)
      setConnectionStates((current) => ({
        ...current,
        [account.id]: { state: 'connected', message: 'Connected' },
      }))
    } catch (error) {
      setConnectionStates((current) => ({
        ...current,
        [account.id]: {
          state: 'disconnected',
          message: error instanceof Error ? error.message : 'Unable to reach server',
        },
      }))
    }
  }

  async function submitServerEditor(mode: 'password' | 'oidc') {
    const trimmedBaseUrl = editor.baseUrl.trim()
    if (!trimmedBaseUrl) return
    const payload = {
      ...editor,
      baseUrl: trimmedBaseUrl,
      label: editor.label.trim(),
      identifier: editor.identifier.trim(),
    }
    const account =
      mode === 'password'
        ? await upsertPasswordServer(payload, editingAccountId)
        : await upsertOidcServer(payload, editingAccountId)
    setShowEditor(false)
    setEditor(EMPTY_EDITOR)
    setEditingAccountId(null)
    await runConnectionTest(account)
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          {onBack ? (
            <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={12}>
              <Text style={styles.backButtonText}>Back to note</Text>
            </TouchableOpacity>
          ) : <View />}
          <TouchableOpacity style={styles.addServerButton} onPress={openNewServerModal}>
            <Text style={styles.addServerButtonText}>Add server</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Notes Servers</Text>
        <Text style={styles.subtitle}>Manage registered servers, identities, and manual connection checks.</Text>
        {serverAccounts.map((account) => {
          const identity = account.identities[0]
          const connectionState = connectionStates[account.id] ?? { state: 'idle', message: 'Not tested yet' }
          return (
            <View key={account.id} style={styles.serverCard}>
              <View style={styles.serverHeader}>
                <TouchableOpacity style={styles.editButton} onPress={() => openEditServerModal(account)}>
                  <PencilIcon />
                </TouchableOpacity>
                <View style={styles.serverHeading}>
                  <Text style={styles.serverName}>{account.label}</Text>
                  <Text style={styles.serverUrl}>{account.base_url}</Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <PencilIcon />
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>Identity</Text>
                  <Text style={styles.fieldValue}>{identity?.label ?? 'Unknown identity'}</Text>
                </View>
              </View>
              <View style={styles.fieldRow}>
                <PencilIcon />
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>Username / email</Text>
                  <Text style={styles.fieldValue}>{identity?.user.email || identity?.user.username || 'Not available'}</Text>
                </View>
              </View>
              <View style={styles.fieldRow}>
                <PencilIcon />
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>Auth type</Text>
                  <Text style={styles.fieldValue}>{identity?.auth_type.toUpperCase() ?? 'UNKNOWN'}</Text>
                </View>
              </View>

              <View style={styles.connectionPanel}>
                <Text
                  style={[
                    styles.connectionState,
                    connectionState.state === 'connected'
                      ? styles.connectedText
                      : connectionState.state === 'disconnected'
                        ? styles.disconnectedText
                        : styles.pendingText,
                  ]}
                >
                  {connectionState.state === 'connected'
                    ? 'Connected'
                    : connectionState.state === 'testing'
                      ? 'Testing…'
                      : connectionState.state === 'disconnected'
                        ? 'Disconnected'
                        : 'Not tested'}
                </Text>
                <Text style={styles.connectionMessage}>{connectionState.message}</Text>
                <TouchableOpacity
                  style={styles.testButton}
                  onPress={() => void runConnectionTest(account)}
                  disabled={connectionState.state === 'testing'}
                >
                  <Text style={styles.testButtonText}>Test connection</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
        {serverAccounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <LinkIcon color={screenColors.accentSoft} size={22} />
            <Text style={styles.emptyTitle}>No servers yet</Text>
            <Text style={styles.emptyText}>Add a server to start linking notes, testing sync, and inviting collaborators.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={showEditor} transparent animationType="fade" onRequestClose={() => setShowEditor(false)}>
        <Pressable style={styles.modalWrap} onPress={() => setShowEditor(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.modalTitle}>{activeEditingAccount ? 'Edit server' : 'Add server'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Server label"
              placeholderTextColor={screenColors.muted}
              value={editor.label}
              onChangeText={(label) => setEditor((current) => ({ ...current, label }))}
            />
            <TextInput
              style={styles.input}
              placeholder="https://your-server"
              placeholderTextColor={screenColors.muted}
              autoCapitalize="none"
              value={editor.baseUrl}
              onChangeText={(baseUrl) => setEditor((current) => ({ ...current, baseUrl }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Email or username"
              placeholderTextColor={screenColors.muted}
              autoCapitalize="none"
              value={editor.identifier}
              onChangeText={(identifier) => setEditor((current) => ({ ...current, identifier }))}
            />
            <TextInput
              style={styles.input}
              placeholder={savingMode === 'oidc' ? 'Password optional for OIDC' : 'Password'}
              placeholderTextColor={screenColors.muted}
              secureTextEntry
              value={editor.password}
              onChangeText={(password) => setEditor((current) => ({ ...current, password }))}
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => {
                  setSavingMode('oidc')
                  void submitServerEditor('oidc')
                }}
                disabled={connectingServer}
              >
                <Text style={styles.actionButtonText}>{connectingServer && savingMode === 'oidc' ? 'Connecting…' : 'Save via OIDC'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={() => {
                  setSavingMode('password')
                  void submitServerEditor('password')
                }}
                disabled={connectingServer}
              >
                <Text style={styles.actionButtonText}>{connectingServer && savingMode === 'password' ? 'Connecting…' : 'Save via password'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenColors.background,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d41',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    gap: 16,
    padding: 18,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#162536',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  backButtonText: {
    color: screenColors.text,
    fontWeight: '700',
  },
  addServerButton: {
    borderRadius: 999,
    backgroundColor: screenColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addServerButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  title: {
    color: screenColors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: screenColors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  serverCard: {
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#0f1d2c',
    padding: 16,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serverHeading: {
    flex: 1,
    gap: 4,
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#16283a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilIcon: {
    color: screenColors.accentSoft,
    fontSize: 18,
    fontWeight: '700',
  },
  serverName: {
    color: screenColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  serverUrl: {
    color: screenColors.muted,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  fieldCopy: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    color: screenColors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  fieldValue: {
    color: screenColors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  connectionPanel: {
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#13253b',
    padding: 14,
  },
  connectionState: {
    fontSize: 14,
    fontWeight: '700',
  },
  connectedText: {
    color: screenColors.success,
  },
  disconnectedText: {
    color: '#f87171',
  },
  pendingText: {
    color: screenColors.warning,
  },
  connectionMessage: {
    color: screenColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  testButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#1a3045',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  testButtonText: {
    color: screenColors.text,
    fontWeight: '700',
  },
  emptyCard: {
    gap: 10,
    borderRadius: 20,
    backgroundColor: '#102032',
    padding: 18,
  },
  emptyTitle: {
    color: screenColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: screenColors.muted,
    lineHeight: 20,
  },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(4, 10, 18, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#0f1c2d',
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    color: screenColors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  input: {
    borderRadius: 14,
    backgroundColor: '#182c43',
    color: screenColors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: screenColors.accent,
  },
  secondaryButton: {
    backgroundColor: '#1a2e42',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
})
