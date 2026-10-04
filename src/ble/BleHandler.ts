/**
 * BLE handler for the Vapewise device, backed by react-native-ble-plx.
 * The device does not require pairing — it is used directly once connected.
 *
 * CMD_CHARACTERISTIC (write):
 *   [0]       -> request a state refresh (STATE_CHARACTERISTIC will notify)
 *   [1, 0|1]  -> set lock state: 0 = unlocked, 1 = locked
 *                (device auto-notifies STATE_CHARACTERISTIC on change)
 *   [2, 0|1]  -> set debug flag: 0 = off, 1 = on
 *                (write-only, not reflected in STATE_CHARACTERISTIC)
 *
 * STATE_CHARACTERISTIC (notify, 2 bytes):
 *   byte[0] -> breathing state: 0 = idle, 1 = inhaling, 2 = blinker
 *   byte[1] -> confirmed lock state: 0 = unlocked, 1 = locked
 */

import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, State as BleState } from 'react-native-ble-plx';

export type LockState = 'locked' | 'unlocked';
export type BreathState = 'idle' | 'inhaling' | 'blinker';

export type BleEventCallbacks = {
  onConnectionChange?: (connected: boolean) => void;
  onBreathStateChange?: (state: BreathState) => void;
  onLockStateChange?: (state: LockState) => void;
};

export const BLE_CONFIG = {
  DEVICE_NAME: 'Vapewise',
  SERVICE_UUID: 'c13386b7-07e7-4695-b20d-dc2ce7594d5a',
  CMD_CHARACTERISTIC_UUID: '0x181A',
  STATE_CHARACTERISTIC_UUID: '0x181B',
};

const SCAN_TIMEOUT_MS = 10000;

// react-native-ble-plx expects a full 128-bit UUID, or a bare 4-hex-digit
// short UUID that it expands itself. Strip the "0x" prefix so either form
// works with the values above.
function normalizeUuid(uuid: string): string {
  return uuid.replace(/^0x/i, '');
}

const SERVICE_UUID = normalizeUuid(BLE_CONFIG.SERVICE_UUID);
const CMD_UUID = normalizeUuid(BLE_CONFIG.CMD_CHARACTERISTIC_UUID);
const STATE_UUID = normalizeUuid(BLE_CONFIG.STATE_CHARACTERISTIC_UUID);

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result +=
      b1 !== undefined
        ? BASE64_CHARS[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)]
        : '=';
    result += b2 !== undefined ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

function base64ToBytes(base64: string): number[] {
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;
  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }
  return bytes;
}

async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return result === 'granted';
}

class BleHandler {
  private manager = new BleManager();
  private device: Device | null = null;
  private callbacks: BleEventCallbacks = {};

  setCallbacks(callbacks: BleEventCallbacks): void {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (this.device) {
      return;
    }

    const granted = await requestAndroidBlePermissions();
    if (!granted) {
      console.warn('BleHandler: BLE permissions not granted');
      return;
    }

    await this.waitForPoweredOn();

    const found = await this.scanForDevice();
    if (!found) {
      console.warn('BleHandler: Vapewise device not found');
      return;
    }

    const connected = await found.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.device = connected;
    this.callbacks.onConnectionChange?.(true);

    connected.onDisconnected(() => {
      this.device = null;
      this.callbacks.onConnectionChange?.(false);
    });

    connected.monitorCharacteristicForService(
      SERVICE_UUID,
      STATE_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) {
          return;
        }
        this.applyStateValue(characteristic.value);
      },
    );

    await this.refreshState();
  }

  async disconnect(): Promise<void> {
    if (!this.device) {
      return;
    }
    await this.device.cancelConnection();
  }

  async lock(): Promise<void> {
    await this.writeCommand([1, 1]);
  }

  async unlock(): Promise<void> {
    await this.writeCommand([1, 0]);
  }

  async setDebug(on: boolean): Promise<void> {
    await this.writeCommand([2, on ? 1 : 0]);
  }

  async refreshState(): Promise<void> {
    await this.writeCommand([0]);
    // STATE_CHARACTERISTIC also supports a direct read; use it as well since
    // the device doesn't reliably push a notification after every refresh.
    if (!this.device) {
      return;
    }
    const characteristic = await this.device.readCharacteristicForService(
      SERVICE_UUID,
      STATE_UUID,
    );
    if (characteristic.value) {
      this.applyStateValue(characteristic.value);
    }
  }

  private applyStateValue(base64Value: string): void {
    const bytes = base64ToBytes(base64Value);
    if (bytes.length >= 1) {
      const breathState: BreathState =
        bytes[0] === 2 ? 'blinker' : bytes[0] === 1 ? 'inhaling' : 'idle';
      this.callbacks.onBreathStateChange?.(breathState);
    }
    if (bytes.length >= 2) {
      this.callbacks.onLockStateChange?.(
        bytes[1] === 1 ? 'locked' : 'unlocked',
      );
    }
  }

  private async writeCommand(bytes: number[]): Promise<void> {
    if (!this.device) {
      console.warn('BleHandler: not connected');
      return;
    }
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      CMD_UUID,
      bytesToBase64(bytes),
    );
  }

  private waitForPoweredOn(): Promise<void> {
    return new Promise(resolve => {
      const subscription = this.manager.onStateChange(state => {
        if (state === BleState.PoweredOn) {
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  private scanForDevice(): Promise<Device | null> {
    return new Promise(resolve => {
      let settled = false;
      const finish = (device: Device | null) => {
        if (settled) {
          return;
        }
        settled = true;
        this.manager.stopDeviceScan();
        resolve(device);
      };

      this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          finish(null);
          return;
        }
        if (device?.name === BLE_CONFIG.DEVICE_NAME) {
          finish(device);
        }
      });

      setTimeout(() => finish(null), SCAN_TIMEOUT_MS);
    });
  }
}

export default new BleHandler();
