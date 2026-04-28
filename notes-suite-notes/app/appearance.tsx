import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useNotesApp } from '../src/lib/app-context'
import { screenColors } from '../src/theme/tokens'

const ACCENTS = ['#f97316', '#0ea5e9', '#22c55e', '#eab308', '#f43f5e']
const CORNER_PRESETS = [
  ['#08111d', '#10253d', '#0f1c2c', '#183652'],
  ['#1a1021', '#102742', '#122116', '#3c1a17'],
  ['#101522', '#173025', '#1c1828', '#283f5c'],
] as const
const FONTS = ['system', 'serif', 'mono'] as const
const BACKGROUND_STYLES = ['gradient', 'color', 'image'] as const

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
        <Text style={styles.label}>Background</Text>
        <View style={styles.row}>
          {BACKGROUND_STYLES.map((backgroundStyle) => (
            <TouchableOpacity
              key={backgroundStyle}
              style={[styles.pill, appearance.backgroundStyle === backgroundStyle ? styles.pillActive : null]}
              onPress={() => setAppearance((current) => ({ ...current, backgroundStyle }))}
            >
              <Text style={styles.pillText}>{backgroundStyle}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Font</Text>
        <View style={styles.row}>
          {FONTS.map((font) => (
            <TouchableOpacity
              key={font}
              style={[styles.pill, appearance.font === font ? styles.pillActive : null]}
              onPress={() => setAppearance((current) => ({ ...current, font }))}
            >
              <Text style={styles.pillText}>{font}</Text>
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
        <Text style={styles.label}>Motion</Text>
        <View style={styles.motionRow}>
          <View style={styles.motionCopy}>
            <Text style={styles.motionTitle}>Enable enter animations</Text>
            <Text style={styles.helper}>Off by default. Turn this on if you want sheets and popovers to animate into view.</Text>
          </View>
          <TouchableOpacity
            style={[styles.togglePill, appearance.enableAnimations ? styles.togglePillActive : null]}
            onPress={() => setAppearance((current) => ({ ...current, enableAnimations: !current.enableAnimations }))}
          >
            <Text style={styles.togglePillText}>{appearance.enableAnimations ? 'On' : 'Off'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>Four-corner gradients</Text>
        <View style={styles.gradientList}>
          {CORNER_PRESETS.map((preset, index) => (
            <TouchableOpacity
              key={preset.join('-')}
              style={styles.gradientCard}
              onPress={() =>
                setAppearance((current) => ({
                  ...current,
                  mode: 'custom',
                  backgroundStyle: 'gradient',
                  gradientCorners: [...preset],
                }))
              }
            >
              <View style={[styles.gradientPreview, { backgroundColor: preset[0] }]}>
                <View style={[styles.corner, styles.topRight, { backgroundColor: preset[1] }]} />
                <View style={[styles.corner, styles.bottomLeft, { backgroundColor: preset[2] }]} />
                <View style={[styles.corner, styles.bottomRight, { backgroundColor: preset[3] }]} />
              </View>
              <Text style={styles.gradientLabel}>Scene {index + 1}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.helper}>
          Background image upload is not wired yet, but the custom appearance model now reserves space for it.
        </Text>
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
    flexWrap: 'wrap',
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
  gradientList: {
    gap: 12,
  },
  motionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  motionCopy: {
    flex: 1,
    gap: 4,
  },
  motionTitle: {
    color: screenColors.text,
    fontWeight: '700',
  },
  togglePill: {
    borderRadius: 999,
    backgroundColor: '#172534',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  togglePillActive: {
    backgroundColor: screenColors.accent,
  },
  togglePillText: {
    color: '#f7f9fc',
    fontWeight: '700',
  },
  gradientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#15283d',
    padding: 12,
  },
  gradientPreview: {
    position: 'relative',
    width: 80,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 24,
  },
  topRight: {
    top: 0,
    right: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
  },
  gradientLabel: {
    color: screenColors.text,
    fontWeight: '700',
  },
  helper: {
    color: screenColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
})
