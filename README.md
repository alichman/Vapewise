**VAPEWISE**

Below is an explanation of the BLE API.
There are two characteristics to Vapewise, UUIDs listed below:

```
export const BLE_CONFIG = {
  DEVICE_NAME: 'Vapewise',
  SERVICE_UUID: 'c13386b7-07e7-4695-b20d-dc2ce7594d5a',
  CMD_CHARACTERISTIC_UUID: '0x181A',
  STATE_CHARACTERISTIC_UUID: '0x181B',
};
```
```
API

CMD (Write):
Byte 0
0 - refresh device state - forces STATE to notify an update
1 - Write lock
  Byte 1 - 0: unlock / 1: lock
(Writing lock causes an automatic notify)
2 - Write debug
  Byte 1 - 0: No heat / 1: Heat

STATE (Read with notification):
Byte 0: Breathing state:
  0 - idle | 1 - breathing | 2 - blinker
Byte 1: Lock - 0 (unlocked) / 1 (locked)
```
