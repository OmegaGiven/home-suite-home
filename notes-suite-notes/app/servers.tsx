import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useNotesApp } from '../src/lib/app-context'
import { screenColors } from '../src/theme/tokens'

type ServersScreenProps = {
  onBack?: () => void
}

export default function ServersScreen({ onBack }: ServersScreenProps) {
  const {
    serverDraft,
    setServerDraft,
    serverAccounts,
    savePasswordServer,
    startOidcLogin,
    connectingServer,
  } = useNotesApp()

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to note</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.title}>Notes Servers</Text>
      <Text style={styles.subtitle}>Add multiple servers and save multiple identities per server.</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Server label"
          placeholderTextColor={screenColors.muted}
          value={serverDraft.label}
          onChangeText={(label) => setServerDraft((current) => ({ ...current, label }))}
        />
        <TextInput
          style={styles.input}
          placeholder="https://your-server"
          placeholderTextColor={screenColors.muted}
          autoCapitalize="none"
          value={serverDraft.baseUrl}
          onChangeText={(baseUrl) => setServerDraft((current) => ({ ...current, baseUrl }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Email or username"
          placeholderTextColor={screenColors.muted}
          autoCapitalize="none"
          value={serverDraft.identifier}
          onChangeText={(identifier) => setServerDraft((current) => ({ ...current, identifier }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={screenColors.muted}
          secureTextEntry
          value={serverDraft.password}
          onChangeText={(password) => setServerDraft((current) => ({ ...current, password }))}
        />
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.primary]}
            onPress={() => void savePasswordServer()}
            disabled={connectingServer}
          >
            <Text style={styles.buttonText}>{connectingServer ? 'Connecting...' : 'Add via password'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => void startOidcLogin()}
            disabled={connectingServer}
          >
            <Text style={styles.buttonText}>Add via OIDC</Text>
          </TouchableOpacity>
        </View>
      </View>
      {serverAccounts.map((account) => (
        <View key={account.id} style={styles.serverCard}>
          <Text style={styles.serverName}>{account.label}</Text>
          <Text style={styles.serverUrl}>{account.base_url}</Text>
          {account.identities.map((identity) => (
            <View key={identity.id} style={styles.identityRow}>
              <Text style={styles.identityName}>{identity.label}</Text>
              <Text style={styles.identityMeta}>{identity.auth_type.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenColors.background,
  },
  content: {
    gap: 14,
    padding: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#162536',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: screenColors.text,
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
  },
  card: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: screenColors.card,
    padding: 16,
  },
  input: {
    borderRadius: 14,
    backgroundColor: screenColors.input,
    color: screenColors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: screenColors.accent,
  },
  secondary: {
    backgroundColor: '#1a2e42',
  },
  buttonText: {
    color: '#f5f8ff',
    fontWeight: '700',
  },
  serverCard: {
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#0f1d2c',
    padding: 16,
  },
  serverName: {
    color: screenColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  serverUrl: {
    color: screenColors.muted,
  },
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  identityName: {
    color: screenColors.text,
  },
  identityMeta: {
    color: screenColors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
  },
})
