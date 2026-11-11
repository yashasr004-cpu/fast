# Fastrack Reflex 3.0 Studio (Web Bluetooth)

A Web Bluetooth + Custom Watchface Studio web app tailored for the **Fastrack Reflex 3.0** (`0.96"` TFT, `80 × 160 px`).

## Accessing the App

1. Start the built-in server:
   ```bash
   node server.mjs
   ```
2. Open **`http://localhost:8017`** in **Google Chrome** or **Microsoft Edge** (desktop or Android).
   - `http://localhost:8017` is treated as a secure context by Chrome/Edge, which is required for Web Bluetooth (`navigator.bluetooth`).

## Features

- **Watchface Studio** (`src/components/WatchfaceEditor.tsx`, `src/studio/renderer.ts`): Live `80 × 160` Fastrack Reflex 3.0 simulator, presets, custom photo upload, solid/gradient backgrounds, 4 clock styles, colors, fonts, and toggleable widgets (date, steps, heart rate, battery, calories, weather).
- **Boot & Band Tools** (`src/components/BandFeaturesPanel.tsx`, `src/ble/protocol.ts`): 4 watchface slots, chunked transfer progress, `FR30` RGB565 + CRC-16 `.bin` and `.json` export, Time Sync, Find My Band vibration test, Notification Alert tester, and live telemetry simulation.
- **BLE Inspector** (`src/components/BleInspectorPanel.tsx`, `src/ble/mockTransport.ts`, `src/ble/webBluetoothTransport.ts`): Switch between **Reflex 3.0 Simulator (Mock BLE)** and **Real Web Bluetooth**, inspect GATT services/characteristics, map custom Service/Write UUIDs + MTU + endianness, and send raw hex packets.

> **Hardware Protocol Note:** Fastrack Reflex 3.0 uses a proprietary, undocumented BLE GATT protocol inside the official *Fastrack Reflex World* app. Use **Simulator** mode to design and test safely, or **Real Web Bluetooth** to inspect GATT UUIDs and map your band's write characteristic once captured (e.g. via Android Bluetooth HCI snoop logs).

