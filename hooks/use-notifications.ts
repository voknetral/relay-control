import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function useNotifications() {
    // Helper to check for unsupported Expo Go environment on Android (SDK 53+)
    const isUnsupportedExpoGoAndroid = () => {
        return Platform.OS === 'android' && Constants.appOwnership === 'expo';
    };

    const sendScheduleNotification = async (deviceName: string, isOn: boolean) => {
        if (Platform.OS === 'web') return;

        // Skip on Expo Go Android to avoid SDK 54 error
        if (isUnsupportedExpoGoAndroid()) {
            console.log('Skipping notification: Not supported in Expo Go on Android.');
            return;
        }

        try {
            const Notifications = await import('expo-notifications');
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: "Schedule Triggered",
                    body: `${deviceName} has been turned ${isOn ? 'ON' : 'OFF'} by schedule.`,
                    data: { deviceName, isOn },
                },
                trigger: null,
            });
        } catch (err) {
            console.warn('Failed to send notification:', err);
        }
    };

    const requestPermissions = async () => {
        if (Platform.OS === 'web') return;

        // Skip on Expo Go Android to avoid SDK 54 error
        if (isUnsupportedExpoGoAndroid()) {
            console.log('Notifications permissions skipped: Use a development build for Android notifications.');
            return;
        }

        try {
            const Notifications = await import('expo-notifications');

            // Setup channel for Android so notifications can heads-up / popup
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#8B5CF6',
                });
            }

            const { status } = await Notifications.getPermissionsAsync();
            if (status !== 'granted') {
                await Notifications.requestPermissionsAsync();
            }
        } catch (err) {
            console.warn('Notification permissions error:', err);
        }
    };

    return {
        sendScheduleNotification,
        requestPermissions,
    };
}
