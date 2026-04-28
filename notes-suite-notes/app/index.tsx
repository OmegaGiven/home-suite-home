import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { screenColors } from '../src/theme/tokens'

export default function HomeScreen() {
  const router = useRouter()

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Notes Suite Notes</Text>
      <Text style={styles.subtitle}>Native shell is running. The full editor is temporarily isolated while I fix an iOS view-prop crash.</Text>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/servers')}>
        <Text style={styles.buttonText}>Open Servers</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/appearance')}>
        <Text style={styles.buttonText}>Open Appearance</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: screenColors.background,
  },
  title: {
    color: screenColors.text,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: screenColors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  button: {
    borderRadius: 14,
    backgroundColor: screenColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
})
