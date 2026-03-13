import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface EnergyCardProps {
    kwh?: number;
    deviceCount?: number;
}

export function EnergyCard({ kwh = 15.2, deviceCount = 2 }: EnergyCardProps) {
    return (
        <LinearGradient
            colors={['#B066FF', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
        >
            {/* Decorative circles */}
            <View style={styles.circleL} />
            <View style={styles.circleR} />

            {/* Left: icon + label */}
            <View style={styles.left}>
                <View style={styles.iconWrap}>
                    <Ionicons name="flash" size={26} color="#FFF" />
                </View>
                <View>
                    <Text style={styles.energyLabel}>Energi</Text>
                    <Text style={styles.energySub}>Penggunaan hari ini</Text>
                </View>
            </View>

            {/* Right: kWh stats */}
            <View style={styles.right}>
                <Text style={styles.kwh}>{kwh} <Text style={styles.kwhUnit}>kWh</Text></Text>
                <View style={styles.deviceRow}>
                    <Ionicons name="hardware-chip-outline" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.deviceText}>{deviceCount}x perangkat nyala</Text>
                </View>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 22,
        gap: 16,
        overflow: 'hidden',
    },
    // Decorative circles
    circleL: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.07)',
        top: -30,
        left: -20,
    },
    circleR: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.06)',
        bottom: -25,
        right: 20,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconWrap: {
        width: 50,
        height: 50,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    energyLabel: {
        fontSize: 17,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: -0.3,
    },
    energySub: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.65)',
        marginTop: 1,
    },
    right: {
        alignItems: 'flex-end',
    },
    kwh: {
        fontSize: 22,
        fontWeight: '800',
        color: '#FFF',
        letterSpacing: -0.5,
    },
    kwhUnit: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    deviceText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
    },
});
