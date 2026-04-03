import { DeviceCard, DeviceIconName } from '@/components/smart-home/DeviceCard';
import { DeviceEditModal } from '@/components/smart-home/DeviceEditModal';
import { LoadingScreen } from '@/components/smart-home/LoadingScreen';
import { NotificationItem, NotificationModal } from '@/components/smart-home/NotificationModal';
import { Schedule, ScheduleModal } from '@/components/smart-home/ScheduleModal';
import { SetupScreen } from '@/components/smart-home/SetupScreen';
import { WeatherCard } from '@/components/smart-home/WeatherCard';
import { WeatherStats } from '@/components/smart-home/WeatherStats';
import { APP_DEFAULTS } from '@/constants/Config';
import { SmartHomeColors } from '@/constants/theme';
import { TXT } from '@/constants/translations';
import { useMqttContext } from '@/contexts/MqttContext';
import { useNotifications } from '@/hooks/use-notifications';
import { useWeather } from '@/hooks/use-weather';
import { AppConfig, Storage } from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import * as KeepAwake from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  iconType: DeviceIconName;
  accentColor: string;
  accentColorLight?: string;
  isOn: boolean;
  schedules?: Schedule[];
  mode: 'auto' | 'manual';
  customIconUri?: string;
  isSynced?: boolean;
}

const INITIAL_DEVICES: Device[] = [
  {
    id: '1',
    name: 'Humidifier',
    iconType: 'humidifier',
    accentColor: SmartHomeColors.teal,
    accentColorLight: '#14C5B222',
    isOn: false,
    schedules: [],
    mode: 'auto',
    isSynced: false,
  },
  {
    id: '2',
    name: 'Smart Plug',
    iconType: 'plug',
    accentColor: SmartHomeColors.orange,
    accentColorLight: '#F9731622',
    isOn: false,
    schedules: [],
    mode: 'auto',
    isSynced: false,
  },
  {
    id: '3',
    name: 'Ceiling Light',
    iconType: 'light',
    accentColor: SmartHomeColors.purple,
    accentColorLight: '#8B5CF622',
    isOn: false,
    schedules: [],
    mode: 'auto',
    isSynced: false,
  },
  {
    id: '4',
    name: 'Smart Fan',
    iconType: 'fan',
    accentColor: SmartHomeColors.blue,
    accentColorLight: '#3B82F622',
    isOn: false,
    schedules: [],
    mode: 'auto',
    isSynced: false,
  },
];



const DEVICE_STATUS_INTERVAL = 30000; // 30 seconds

// Removed top-level Notification handler and helper for web compatibility.
// These are now handled in useNotifications hook.

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  // Defensive: Handle "Unable to activate keep awake" promise rejection from Expo dev tools
  useEffect(() => {
    if (__DEV__) {
      KeepAwake.activateKeepAwakeAsync().catch(() => {
        /* Silently ignore: this error is common in some Android environments and is usually non-fatal */
      });
    }
  }, []);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width > 560;

  // Setup state
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isReady, setIsReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const initSetup = async () => {
        const savedConfig = await Storage.loadConfig();
        if (savedConfig) {
          setConfig(savedConfig);

          if (savedConfig.customDevices && savedConfig.customDevices.length > 0) {
            setDevices(savedConfig.customDevices.map(c => ({
              id: c.id,
              name: c.name,
              iconType: c.iconType as any,
              customIconUri: c.customIconUri,
              accentColor: c.accentColor || SmartHomeColors.purple,
              isOn: false,
              schedules: [],
              mode: 'auto',
              isSynced: false,
            })));
          } else if (savedConfig.deviceSettings) {
            setDevices(prev => prev.map(d => {
              const settings = savedConfig.deviceSettings?.[d.id];
              if (settings) {
                return {
                  ...d,
                  name: settings.name,
                  iconType: settings.iconType as any,
                  customIconUri: settings.customIconUri
                };
              }
              return d;
            }));
          }
        }
        setIsReady(true);
      };
      initSetup();
    }, [])
  );

  const handleSetupComplete = (username: string) => {
    const newConfig = { username, isSetupComplete: true };
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const weather = useWeather(config?.city);
  const { connected: mqttConnected, subscribe, publish, onMessage, mcuOnline } = useMqttContext();

  const { requestPermissions, sendScheduleNotification } = useNotifications();
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);

  // Modal states
  const [isNotifModalVisible, setIsNotifModalVisible] = useState(false);
  const [scheduledDeviceId, setScheduledDeviceId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [isGlobalVerifying, setIsGlobalVerifying] = useState(false);
  const verifyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup no-op timers if komponen unmount
  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current) {
        clearTimeout(verifyTimeoutRef.current);
      }
    };
  }, []);

  // Notification History State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const addNotification = (title: string, message: string, type: NotificationItem['type'] = 'info') => {
    const newItem: NotificationItem = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      timestamp: new Date(),
      type,
    };
    setNotifications(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
  };

  useEffect(() => {
    requestPermissions();
  }, []);



  // Sync MCU status with MQTT status
  useEffect(() => {
    if (!mqttConnected) {
      setDevices(prev => prev.map(d => ({ ...d, isSynced: false })));
    }
  }, [mqttConnected]);

  useEffect(() => {
    if (mqttConnected) {
      const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
      // Subscribe to all device state topics
      devices.forEach((device) => {
        subscribe(`${baseTopic}/${device.id}/state`);
        subscribe(`${baseTopic}/${device.id}/mode/state`);
        subscribe(`${baseTopic}/${device.id}/availability`);
      });

      onMessage((topic, message) => {
        const msgStr = message.toString();
        const parts = topic.split('/');
        const baseParts = baseTopic.split('/');

        // Avoid malformed topics
        if (parts.length <= baseParts.length + 1) return;

        const deviceId = parts[baseParts.length];
        const action = parts[baseParts.length + 1];

        if (action === 'availability') {
          let becameVerified = false;
          setDevices((prev) =>
            prev.map((d) => {
              if (d.id === deviceId && !d.isSynced) {
                if (d.id === verifyingId) becameVerified = true;
                return { ...d, isSynced: true };
              }
              return d;
            }),
          );

          if (becameVerified) {
            if (verifyTimeoutRef.current) {
              clearTimeout(verifyTimeoutRef.current);
              verifyTimeoutRef.current = null;
            }
            setVerifyingId(null);
            addNotification('Verifikasi Berhasil', `ID ${deviceId} terdeteksi di ESP32.`, 'success');
          }
          return;
        }

        if (action === 'state') {
          const newState = msgStr === 'ON';
          let becameVerified = false;

          setDevices((prev) =>
            prev.map((d) => {
              if (d.id === deviceId && (d.isOn !== newState || !d.isSynced)) {
                if (d.id === verifyingId) {
                  becameVerified = true;
                }

                // If it's a state change while in AUTO mode, it's likely a schedule trigger from ESP32
                if (d.isSynced && d.isOn !== newState && d.mode === 'auto') {
                  sendScheduleNotification(d.name, newState);
                  addNotification(
                    TXT.home.scheduleTriggered,
                    `${d.name} ${newState ? TXT.home.turnedBySchedule : TXT.home.turnedOffBySchedule}`,
                    'info'
                  );
                }
                return { ...d, isOn: newState, isSynced: true };
              }
              return d;
            }),
          );

          if (becameVerified) {
            if (verifyTimeoutRef.current) {
              clearTimeout(verifyTimeoutRef.current);
              verifyTimeoutRef.current = null;
            }
            setVerifyingId(null);
            addNotification('Verifikasi Berhasil', `ID ${deviceId} terdeteksi di ESP32.`, 'success');
          }
        } else if (action === 'mode') {
          const newMode = msgStr as 'auto' | 'manual';
          let becameVerified = false;

          setDevices((prev) =>
            prev.map((d) => {
              if (d.id === deviceId && (d.mode !== newMode || !d.isSynced)) {
                if (d.id === verifyingId) {
                  becameVerified = true;
                }
                return { ...d, mode: newMode, isSynced: true };
              }
              return d;
            }),
          );

          if (becameVerified) {
            if (verifyTimeoutRef.current) {
              clearTimeout(verifyTimeoutRef.current);
              verifyTimeoutRef.current = null;
            }
            setVerifyingId(null);
            addNotification('Verifikasi Berhasil', `ID ${deviceId} terdeteksi di ESP32.`, 'success');
          }
        }
      });
    }
  }, [mqttConnected, onMessage, subscribe, config?.mqttTopic, verifyingId]);

  const onDeviceCount = devices.filter((d) => d.isOn).length;

  const toggleDevice = (id: string, newState: boolean) => {
    // Optimistic UI update
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isOn: newState } : d)),
    );

    // Publish to MQTT
    if (mqttConnected) {
      const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
      publish(`${baseTopic}/${id}/set`, newState ? 'ON' : 'OFF');
    }
  };

  const toggleMode = (id: string) => {
    let newMode: 'auto' | 'manual' = 'auto';
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          newMode = d.mode === 'auto' ? 'manual' : 'auto';
          return { ...d, mode: newMode };
        }
        return d;
      }),
    );

    // Publish mode change to MQTT
    if (mqttConnected) {
      const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
      publish(`${baseTopic}/${id}/mode/set`, newMode, { retain: true });
    }
  };

  const updateSchedules = (deviceId: string, newSchedules: Schedule[]) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, schedules: newSchedules } : d))
    );

    // Publish to MQTT for persistent storage on ESP32
    if (mqttConnected) {
      const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
      publish(`${baseTopic}/${deviceId}/schedule`, JSON.stringify(newSchedules), { retain: true });
    }
  };

  // Trigger state sync on initial connection
  useEffect(() => {
    if (mqttConnected) {
      const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
      
      // Start global verification
      setIsGlobalVerifying(true);
      // Reset isSynced for all to clear any false positives from retained messages
      setDevices(prev => prev.map(d => ({ ...d, isSynced: false })));
      
      publish(`${baseTopic}/get`, 'SYNC');

      const timer = setTimeout(() => {
        setIsGlobalVerifying(false);

        setDevices((prev) => {
          const confirmed = prev.filter((d) => d.isSynced !== false);
          if (confirmed.length !== prev.length) {
            const mapped = confirmed.map((d) => ({
              id: d.id,
              name: d.name,
              iconType: d.iconType,
              customIconUri: d.customIconUri,
              accentColor: d.accentColor,
            }));
            Storage.saveCustomDevices(mapped);
            const removed = prev.filter((d) => d.isSynced === false);
            if (removed.length > 0) {
              addNotification(
                'Verifikasi Gagal',
                `Device tidak terverifikasi akan dihapus: ${removed.map((d) => d.name).join(', ')}`,
                'warning'
              );
            }
          }
          return confirmed;
        });
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [mqttConnected, publish, config?.mqttTopic]);

  // RE-SYNC when app comes back from background (Critical for No-Server Setup)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && mqttConnected) {
        console.log('App returned to foreground, triggering re-sync...');
        const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
        
        setIsGlobalVerifying(true);
        setDevices(prev => prev.map(d => ({ ...d, isSynced: false })));
        
        publish(`${baseTopic}/get`, 'SYNC');
        
        setTimeout(() => {
          setIsGlobalVerifying(false);
          setDevices((prev) => {
            const confirmed = prev.filter((d) => d.isSynced !== false);
            if (confirmed.length !== prev.length) {
              const mapped = confirmed.map((d) => ({
                id: d.id,
                name: d.name,
                iconType: d.iconType,
                customIconUri: d.customIconUri,
                accentColor: d.accentColor,
              }));
              Storage.saveCustomDevices(mapped);
              const removed = prev.filter((d) => d.isSynced === false);
              if (removed.length > 0) {
                addNotification(
                  'Verifikasi Gagal',
                  `Device tidak terverifikasi akan dihapus: ${removed.map((d) => d.name).join(', ')}`,
                  'warning'
                );
              }
            }
            return confirmed;
          });
        }, 5000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [mqttConnected, publish, config?.mqttTopic]);

  const handleUpdateDevice = async (id: string, name: string, iconType: DeviceIconName, customIconUri?: string) => {
    // Optimistic state
    setDevices(prev => prev.map(d => d.id === id ? { ...d, name, iconType, customIconUri } : d));
    
    // Convert current devices state into saveable array, updating the target ID
    setDevices(currentDevices => {
       const mapped = currentDevices.map(d => ({
           id: d.id,
           name: d.name,
           iconType: d.iconType,
           customIconUri: d.customIconUri,
           accentColor: d.accentColor
       }));
       Storage.saveCustomDevices(mapped);
       return currentDevices;
    });
  };

  const handleAddDevice = () => {
    if (verifyingId) {
      addNotification(
        "Verifikasi Sedang Berlangsung",
        "Tunggu sampai penambahan device sebelumnya selesai diverifikasi sebelum menambahkan lagi.",
        'warning'
      );
      return;
    }

    const maxId = devices.reduce((max, d) => {
      const num = parseInt(d.id, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = String(maxId + 1);

    const newDevice: Device = {
      id: newId,
      name: `Perangkat ${newId}`,
      iconType: 'plug',
      accentColor: SmartHomeColors.purple,
      isOn: false,
      schedules: [],
      mode: 'auto',
      isSynced: false,
    };

    // Tambahkan sementara lalu verifikasi; status kartu tetap "OFFLINE" sampai verifikasi sukses.
    setDevices(prev => [...prev, newDevice]);
    setVerifyingId(newId);

    if (!mqttConnected) {
      addNotification(
        "MQTT Tidak Terhubung",
        "Tidak bisa memverifikasi device baru tanpa koneksi MQTT. Device akan dihapus.",
        'warning'
      );
      setDevices(prev => prev.filter((d) => d.id !== newId));
      setVerifyingId(null);
      return;
    }

    const baseTopic = config?.mqttTopic || APP_DEFAULTS.mqttTopic;
    subscribe(`${baseTopic}/${newId}/state`);
    subscribe(`${baseTopic}/${newId}/mode/state`);

    publish(`${baseTopic}/get`, 'SYNC');

    // Verification timeout - 5s
    if (verifyTimeoutRef.current) {
      clearTimeout(verifyTimeoutRef.current);
    }
    verifyTimeoutRef.current = setTimeout(() => {
      setVerifyingId(currentVerifying => {
        if (currentVerifying !== newId) return null;

        setDevices(currentDevices => {
          const dev = currentDevices.find(d => d.id === newId);
          if (dev && !dev.isSynced) {
            addNotification(
              "Hardware Tidak Terdeteksi",
              `ID ${newId} belum diprogram di ESP32. Card akan dihapus.`,
              'warning'
            );
            const filtered = currentDevices.filter((d) => d.id !== newId);
            const mapped = filtered.map((d) => ({
              id: d.id,
              name: d.name,
              iconType: d.iconType,
              customIconUri: d.customIconUri,
              accentColor: d.accentColor,
            }));
            Storage.saveCustomDevices(mapped);
            return filtered;
          }
          if (dev) {
            const mapped = currentDevices.map((d) => ({
              id: d.id,
              name: d.name,
              iconType: d.iconType,
              customIconUri: d.customIconUri,
              accentColor: d.accentColor,
            }));
            Storage.saveCustomDevices(mapped);
            addNotification(
              "Verifikasi Berhasil",
              `Perangkat ${dev.name} berhasil diverifikasi.`,
              'success'
            );
          }
          return currentDevices;
        });

        verifyTimeoutRef.current = null;
        return null; // Clear verifying status
      });
    }, 5000);

    setEditingDeviceId(newId);
  };

  const handleDeleteDevice = (id: string) => {
    const proceed = () => {
      setDevices(prev => {
        const newDevices = prev.filter(d => d.id !== id);
        const mapped = newDevices.map(d => ({
           id: d.id,
           name: d.name,
           iconType: d.iconType,
           customIconUri: d.customIconUri,
           accentColor: d.accentColor
        }));
        Storage.saveCustomDevices(mapped);
        return newDevices;
      });
      setEditingDeviceId(null);
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Yakin ingin menghapus perangkat ini?")) proceed();
    } else {
      Alert.alert("Hapus Perangkat", "Tindakan ini tidak bisa dibatalkan.", [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: proceed }
      ]);
    }
  };

  const scheduledDevice = devices.find((d) => d.id === scheduledDeviceId);
  const editingDevice = devices.find((d) => d.id === editingDeviceId);

  const getCellWidth = () => {
    const availableWidth = Math.min(width, 1200) - 40; // 40 is total horizontal padding
    if (width > 1024) return (availableWidth - (3 * 16)) / 4; // 4 columns
    if (width > 700) return (availableWidth - (2 * 16)) / 3;  // 3 columns
    return (availableWidth - 16) / 2;                         // 2 columns
  };

  if (!isReady) return <LoadingScreen />;

  if (!config) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom', 'left', 'right']}>
      <LinearGradient
        colors={['#EDE8FF', '#E4EEFF', '#EAF4FF']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.root}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.webContainer}>
            {/* Header ────────────────────────────────────────────── */}
            <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.headerTitle}>{TXT.common.smartHome}</Text>
              <View style={styles.headerIcons}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => setIsNotifModalVisible(true)}
                >
                  <Ionicons name="notifications-outline" size={23} color={SmartHomeColors.textPrimary} />
                  {notifications.length > 0 && <View style={styles.notifDot} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                  onPress={() => router.push('/settings')}
                >
                  <Ionicons name="settings-outline" size={23} color={SmartHomeColors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.headerSubContainer}>
              <Text style={styles.headerSubText}>
                {TXT.common.welcomeBack} <Text style={styles.nameBold}>{config?.username || 'User'}</Text>
              </Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge, 
                  { backgroundColor: mqttConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)' },
                  !mqttConnected && styles.statusBadgeError
                ]}>
                  <View style={[styles.statusDot, { backgroundColor: mqttConnected ? '#10B981' : '#EF4444' }]} />
                  <Text style={[styles.statusBadgeText, { color: mqttConnected ? '#10B981' : '#EF4444' }]}>
                    {mqttConnected ? TXT.home.mqttStatus : 'MQTT DISCONNECTED'}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge, 
                  { backgroundColor: mcuOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)' },
                  !mcuOnline && mqttConnected && styles.statusBadgeError
                ]}>
                  <View style={[styles.statusDot, { backgroundColor: mcuOnline ? '#10B981' : '#EF4444' }]} />
                  <Text style={[styles.statusBadgeText, { color: mcuOnline ? '#10B981' : '#EF4444' }]}>
                    {mcuOnline ? TXT.home.mcuStatus : 'ESP32 OFFLINE'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Weather Card + Stats (merged) ───────────────────── */}
          <View style={styles.weatherMergedCard}>
            <WeatherCard
              temperature={weather.temperature}
              feelsLike={weather.feelsLike}
              description={weather.info.description}
              iconName={weather.info.icon}
              city={weather.city}
              loading={weather.loading}
            />
            <View style={styles.weatherDivider} />
            <WeatherStats
              feelsLike={weather.feelsLike}
              humidity={weather.humidity}
              windSpeed={weather.windSpeed}
            />
          </View>

          {/* Section: Device Controls ─────────────────────────── */}
          <View style={styles.sectionRow}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionLabel}>{TXT.common.dashboard}</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* Active Summary ────────────────────────────────────── */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Ionicons name="checkmark-circle" size={14} color={SmartHomeColors.purple} />
              <Text style={styles.summaryText}>{onDeviceCount} {TXT.home.deviceActive}</Text>
            </View>
          </View>

          {/* Device Grid ───────────────────────────────────────── */}
          <View style={styles.deviceGrid}>
            {devices.map((device) => (
              <View key={device.id} style={[styles.deviceCell, { width: getCellWidth() }]}>
                <DeviceCard
                  key={device.id}
                  name={device.name}
                  iconType={device.iconType}
                  accentColor={device.accentColor}
                  accentColorLight={device.accentColorLight}
                  isOn={device.isOn}
                  mode={device.mode}
                  onToggle={(newState) => toggleDevice(device.id, newState)}
                  onToggleMode={() => toggleMode(device.id)}
                  onSchedulePress={() => setScheduledDeviceId(device.id)}
                  hasSchedules={device.schedules?.some(s => s.isEnabled)}
                  onLongPress={() => setEditingDeviceId(device.id)}
                  customIconUri={device.customIconUri}
                  isMcuOnline={mcuOnline && device.isSynced !== false}
                  isVerifying={isGlobalVerifying || (device.id === verifyingId)}
                />
              </View>
            ))}
            <TouchableOpacity 
               style={[styles.addDeviceCard, { width: getCellWidth() }]} 
               onPress={handleAddDevice}
               activeOpacity={0.7}
            >
               <Ionicons name="add" size={48} color={SmartHomeColors.purple} />
            </TouchableOpacity>
          </View>

          {/* Modals ──────────────────────────────────────────────── */}
          {editingDevice && (
            <DeviceEditModal
              visible={!!editingDeviceId}
              onClose={() => setEditingDeviceId(null)}
              deviceName={editingDevice.name}
              deviceIcon={editingDevice.iconType}
              customIconUri={editingDevice.customIconUri}
              onSave={(name, icon, customIcon) => handleUpdateDevice(editingDevice.id, name, icon, customIcon)}
              onDelete={() => handleDeleteDevice(editingDevice.id)}
            />
          )}

          {scheduledDevice && (
            <ScheduleModal
              visible={!!scheduledDeviceId}
              onClose={() => setScheduledDeviceId(null)}
              deviceName={scheduledDevice.name}
              schedules={scheduledDevice.schedules || []}
              onUpdateSchedules={(s) => updateSchedules(scheduledDevice.id, s)}
            />
          )}

          {/* Notification Modal ───────────────────────────────── */}
          <NotificationModal
            visible={isNotifModalVisible}
            onClose={() => setIsNotifModalVisible(false)}
            notifications={notifications}
            onClearAll={() => {
              setNotifications([]);
              setIsNotifModalVisible(false);
            }}
          />



          {/* API Attribution ─────────────────────────────────── */}
          <View style={styles.attribution}>
            <Ionicons name="cloud-outline" size={12} color={SmartHomeColors.textMuted} />
            <Text style={styles.attributionText}>{TXT.home.poweredBy}</Text>
          </View>

          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  webContainer: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },

  // Merged weather card wrapper
  weatherMergedCard: {
    backgroundColor: SmartHomeColors.cardBg,
    borderRadius: 28,
    boxShadow: '0 10px 40px rgba(148, 163, 184, 0.12)',
    elevation: 4,
    overflow: 'hidden',
  },
  weatherDivider: {
    height: 1,
    backgroundColor: SmartHomeColors.divider,
    marginHorizontal: 20,
  },

  // Header
  header: {
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: SmartHomeColors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  headerSubContainer: {
    marginTop: 4,
    gap: 6,
  },
  headerSubText: {
    fontSize: 13,
    color: SmartHomeColors.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadgeError: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  nameBold: {
    fontWeight: '700',
    color: SmartHomeColors.purple,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: SmartHomeColors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 15px rgba(148, 163, 184, 0.15)',
    elevation: 2,
  },
  notifDot: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFF',
  },

  // Section
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#E2E8F0',
    opacity: 0.8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: SmartHomeColors.textSecondary,
    letterSpacing: 0.5,
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -4,
    marginBottom: -4,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: SmartHomeColors.purple,
  },
  devicesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: SmartHomeColors.textSecondary,
  },

  // Device grid
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  deviceCell: {
    marginBottom: 14,
  },
  addDeviceCard: {
    marginBottom: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 185,
  },
  addDeviceText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: SmartHomeColors.purple,
    textAlign: 'center',
  },

  // Attribution
  attribution: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
    opacity: 0.5,
  },
  attributionText: {
    fontSize: 11,
    color: SmartHomeColors.textMuted,
  },
});
