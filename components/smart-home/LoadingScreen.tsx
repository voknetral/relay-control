import { SmartHomeColors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Image } from 'react-native';

export function LoadingScreen() {
    const loaderAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Continuous loading bar animation
        Animated.loop(
            Animated.timing(loaderAnim, {
                toValue: 1,
                duration: 2000,
                useNativeDriver: false, // Cannot use native driver for width %
            })
        ).start();
    }, [loaderAnim]);

    const barWidth = loaderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            <View style={styles.center}>
                <View style={styles.iconWrapper}>
                    <Image 
                        source={require('../../assets/images/smarthouse.png')} 
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </View>

                <Text style={styles.title}>Anomali</Text>
                <Text style={styles.subtitle}>Smart Home Intelligence</Text>

                <View style={styles.loaderContainer}>
                    <Animated.View style={[styles.loaderBar, { width: barWidth }]} />
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Secure Connection Established</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC', 
        justifyContent: 'center',
        alignItems: 'center',
    },
    center: {
        alignItems: 'center',
    },
    iconWrapper: {
        width: 130,
        height: 130,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    logo: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 34,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    loaderContainer: {
        marginTop: 48,
        height: 4,
        width: 140,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        overflow: 'hidden',
    },
    loaderBar: {
        height: '100%',
        backgroundColor: SmartHomeColors.purple,
        borderRadius: 2,
    },
    footer: {
        position: 'absolute',
        bottom: 50,
    },
    footerText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#94A3B8',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
});
