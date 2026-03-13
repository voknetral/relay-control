import { DeviceIconName } from '@/components/smart-home/DeviceCard';
import { SmartHomeColors } from '@/constants/theme';
import { TXT } from '@/constants/translations';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ICONS: { type: DeviceIconName; label: string; icon: string }[] = [
    { type: 'humidifier', label: 'Lembap', icon: 'water' },
    { type: 'plug', label: 'Colokan', icon: 'flash' },
    { type: 'light', label: 'Lampu', icon: 'bulb' },
    { type: 'fan', label: 'Kipas', icon: 'aperture' },
    { type: 'ac', label: 'AC', icon: 'snow' },
];

interface DeviceEditModalProps {
    visible: boolean;
    onClose: () => void;
    deviceName: string;
    deviceIcon: DeviceIconName;
    customIconUri?: string;
    onSave: (newName: string, newIcon: DeviceIconName, customIconUri?: string) => void;
}

export function DeviceEditModal({
    visible,
    onClose,
    deviceName,
    deviceIcon,
    customIconUri,
    onSave,
}: DeviceEditModalProps) {
    const insets = useSafeAreaInsets();
    const [name, setName] = useState(deviceName);
    const [selectedIcon, setSelectedIcon] = useState<DeviceIconName>(deviceIcon);
    const [selectedCustomIcon, setSelectedCustomIcon] = useState<string | undefined>(customIconUri);

    // Sync state if props change while visible
    useEffect(() => {
        if (visible) {
            setName(deviceName);
            setSelectedIcon(deviceIcon);
            setSelectedCustomIcon(customIconUri);
        }
    }, [visible, deviceName, deviceIcon, customIconUri]);

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets[0]) {
                setSelectedCustomIcon(result.assets[0].uri);
            }
        } catch (error) {
            console.error('Error picking image:', error);
        }
    };

    const handleSave = () => {
        if (!name.trim()) return;
        onSave(name.trim(), selectedIcon, selectedCustomIcon);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint="dark" style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>{TXT.device.editDevice}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={SmartHomeColors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{TXT.device.deviceName}</Text>
                            <TextInput
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g. Living Room Lamp"
                                placeholderTextColor={SmartHomeColors.textMuted}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{TXT.device.customIcon}</Text>
                            <View style={styles.customIconContainer}>
                                {selectedCustomIcon ? (
                                    <View style={styles.previewWrapper}>
                                        <Image source={{ uri: selectedCustomIcon }} style={styles.previewImage} />
                                        <TouchableOpacity
                                            style={styles.removeCustomBtn}
                                            onPress={() => setSelectedCustomIcon(undefined)}
                                        >
                                            <Ionicons name="close-circle" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                                        <Ionicons name="image-outline" size={24} color={SmartHomeColors.purple} />
                                        <Text style={styles.uploadText}>{TXT.device.uploadIcon}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{TXT.device.deviceIcon}</Text>
                            <View style={styles.iconGrid}>
                                {ICONS.map((item) => (
                                    <TouchableOpacity
                                        key={item.type}
                                        style={[
                                            styles.iconOption,
                                            !selectedCustomIcon && selectedIcon === item.type && styles.iconOptionActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedIcon(item.type);
                                            setSelectedCustomIcon(undefined);
                                        }}
                                    >
                                        <Ionicons
                                            name={(!selectedCustomIcon && selectedIcon === item.type ? item.icon : `${item.icon}-outline`) as any}
                                            size={32}
                                            color={!selectedCustomIcon && selectedIcon === item.type ? '#FFF' : SmartHomeColors.textPrimary}
                                        />
                                    </TouchableOpacity>
                                ))}
                                {ICONS.length % 3 !== 0 && Array.from({ length: 3 - (ICONS.length % 3) }).map((_, i) => (
                                    <View key={`dummy-${i}`} style={{ width: '31%' }} />
                                ))}
                            </View>
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelText}>{TXT.common.cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
                            onPress={handleSave}
                            disabled={!name.trim()}
                        >
                            <Text style={styles.saveText}>{TXT.device.saveChanges}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: SmartHomeColors.cardBg,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '94%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: SmartHomeColors.textPrimary,
    },
    closeBtn: {
        padding: 5,
    },
    body: {
        marginBottom: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: SmartHomeColors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F8F9FF',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
        fontSize: 16,
        color: SmartHomeColors.textPrimary,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    customIconContainer: {
        marginBottom: 10,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(139, 92, 246, 0.05)',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: SmartHomeColors.purple,
        borderRadius: 12,
        padding: 15,
        gap: 10,
    },
    uploadText: {
        fontSize: 14,
        fontWeight: '600',
        color: SmartHomeColors.purple,
    },
    previewWrapper: {
        width: 80,
        height: 80,
        borderRadius: 20,
        overflow: 'visible',
    },
    previewImage: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
    },
    removeCustomBtn: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#FFF',
        borderRadius: 12,
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 12,
        justifyContent: 'space-between',
    },
    iconOption: {
        width: '31%',
        paddingVertical: 18,
        backgroundColor: '#F8F9FF',
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    iconOptionActive: {
        backgroundColor: SmartHomeColors.purple,
        borderColor: SmartHomeColors.purple,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '700',
        color: SmartHomeColors.textSecondary,
    },
    saveBtn: {
        flex: 2,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: SmartHomeColors.purple,
    },
    saveBtnDisabled: {
        opacity: 0.5,
    },
    saveText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFF',
    },
});
