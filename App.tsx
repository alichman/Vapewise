/**
 * Vapewise
 * Simple UI for the Vapewise BLE device: inhale status, lock/unlock.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import bleHandler, { BreathState, LockState } from './src/ble/BleHandler';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent isDarkMode={isDarkMode} />
    </SafeAreaProvider>
  );
}

function AppContent({ isDarkMode }: { isDarkMode: boolean }) {
  const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState(false);
  const [breathState, setBreathState] = useState<BreathState>('idle');
  const [lockState, setLockState] = useState<LockState>('locked');
  const [debugOn, setDebugOn] = useState(false);

  useEffect(() => {
    bleHandler.setCallbacks({
      onConnectionChange: setConnected,
      onBreathStateChange: setBreathState,
      onLockStateChange: setLockState,
    });
  }, []);

  const handleConnectPress = () => {
    if (connected) {
      bleHandler.disconnect();
    } else {
      bleHandler.connect();
    }
  };

  const handleLockPress = () => {
    if (lockState === 'locked') {
      bleHandler.unlock();
    } else {
      bleHandler.lock();
    }
  };

  const handleDebugPress = () => {
    const next = !debugOn;
    bleHandler.setDebug(next);
    setDebugOn(next);
  };

  const textColor = isDarkMode ? '#fff' : '#000';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <Text style={[styles.title, { color: textColor }]}>Vapewise</Text>

      <View style={styles.section}>
        <Text style={[styles.label, { color: textColor }]}>Device</Text>
        <Text style={[styles.value, { color: textColor }]}>
          {connected ? 'Connected' : 'Disconnected'}
        </Text>
        <Pressable style={styles.button} onPress={handleConnectPress}>
          <Text style={styles.buttonText}>
            {connected ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: textColor }]}>Breath</Text>
        <Text
          style={[
            styles.value,
            {
              color:
                breathState === 'inhaling'
                  ? '#2ecc71'
                  : breathState === 'blinker'
                  ? '#f1c40f'
                  : textColor,
            },
          ]}>
          {breathState === 'inhaling'
            ? 'Inhaling…'
            : breathState === 'blinker'
            ? 'Blinker'
            : 'Idle'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: textColor }]}>Lock</Text>
        <Text style={[styles.value, { color: textColor }]}>
          {lockState === 'locked' ? 'Locked' : 'Unlocked'}
        </Text>
        <Pressable style={styles.button} onPress={handleLockPress}>
          <Text style={styles.buttonText}>
            {lockState === 'locked' ? 'Unlock' : 'Lock'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, { color: textColor }]}>Debug</Text>
        <Text style={[styles.value, { color: textColor }]}>
          {debugOn ? 'On' : 'Off'}
        </Text>
        <Pressable style={styles.button} onPress={handleDebugPress}>
          <Text style={styles.buttonText}>
            {debugOn ? 'Turn Off' : 'Turn On'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 32,
    marginBottom: 48,
  },
  section: {
    alignItems: 'center',
    marginBottom: 40,
  },
  label: {
    fontSize: 14,
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3498db',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
