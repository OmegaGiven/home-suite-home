import { registerRootComponent } from 'expo'
import { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AppearanceScreen from './app/appearance'
import ServersScreen from './app/servers'
import { NotesShell } from './src/components/notes-shell'
import { NotesAppProvider } from './src/lib/app-context'

type Screen = 'notes' | 'servers' | 'appearance'

function App() {
  const [screen, setScreen] = useState<Screen>('notes')

  return (
    <SafeAreaProvider>
      <NotesAppProvider>
        <StatusBar style="light" />
        {screen === 'notes' ? (
          <NotesShell
            onOpenServers={() => setScreen('servers')}
            onOpenAppearance={() => setScreen('appearance')}
          />
        ) : null}
        {screen === 'servers' ? <ServersScreen onBack={() => setScreen('notes')} /> : null}
        {screen === 'appearance' ? <AppearanceScreen onBack={() => setScreen('notes')} /> : null}
      </NotesAppProvider>
    </SafeAreaProvider>
  )
}

registerRootComponent(App)
