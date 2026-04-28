import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useNotesApp } from '../src/lib/app-context'
import { screenColors } from '../src/theme/tokens'

const ACCENTS = ['#f97316', '#0ea5e9', '#22c55e', '#eab308', '#f43f5e']

type AppearanceScreenProps = {
  onBack?: () => void
}

export default function AppearanceScreen({ onBack }: AppearanceScreenProps) {
  const { appearance, setAppearance } = useNotesApp()

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack ? (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to note</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.title}>Appearance</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Mode</Text>
        <View style={styles.row}>
          {(['system', 'custom'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.pill, appearance.mode === mode ? styles.pillActive : null]}
              onPress={() => setAppearance((current) => ({ ...current, mode }))}
            >
              <Text style={styles.pillText}>{mode}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Accent</Text>
        <View style={styles.row}>
          {ACCENTS.map((accent) => (
            <TouchableOpacity
              key={accent}
              style={[styles.swatch, { backgroundColor: accent }, appearance.accent === accent ? styles.swatchActive : null]}
              onPress={() => setAppearance((current) => ({ ...current, accent }))}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenColors.background,
  },
  content: {
    gap: 16,
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
  card: {
    gap: 14,
    borderRadius: 18,
    backgroundColor: screenColors.card,
    padding: 16,
  },
  label: {
    color: screenColors.muted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    borderRadius: 999,
    backgroundColor: '#172534',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillActive: {
    backgroundColor: screenColors.accent,
  },
  pillText: {
    color: '#f7f9fc',
    fontWeight: '700',
  },
  swatch: {
    height: 34,
    width: 34,
    borderRadius: 17,
  },
  swatchActive: {
    borderColor: '#fff',
    borderWidth: 2,
  },
})
