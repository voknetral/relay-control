import { APP_DEFAULTS } from '@/constants/Config';
import { Storage } from '@/utils/storage';
import mqtt from 'mqtt';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface MqttState {
    connected: boolean;
    error: string | null;
}

interface MqttContextValue extends MqttState {
    subscribe: (topic: string) => void;
    publish: (topic: string, message: string, options?: mqtt.IClientPublishOptions) => void;
    onMessage: (callback: (topic: string, message: Buffer) => void) => () => void;
    reconnect: (host: string, port: string, topic?: string) => void;
    mcuOnline: boolean;
    mqttTopic: string;
}

const MqttContext = createContext<MqttContextValue | undefined>(undefined);

export function MqttProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<MqttState>({
        connected: false,
        error: null,
    });

    const [remoteHost, setRemoteHost] = useState('');
    const [remotePort, setRemotePort] = useState('');
    const [mqttTopic, setMqttTopic] = useState(APP_DEFAULTS.mqttTopic);
    const [mcuOnline, setMcuOnline] = useState(false);
    const clientRef = useRef<mqtt.MqttClient | null>(null);

    // Initial load from storage
    useEffect(() => {
        const load = async () => {
            const config = await Storage.loadConfig();
            if (config) {
                setRemoteHost(config.mqttHost || APP_DEFAULTS.mqttHost);
                setRemotePort(config.mqttPort || APP_DEFAULTS.mqttPort);
                setMqttTopic(config.mqttTopic || APP_DEFAULTS.mqttTopic);
            } else {
                setRemoteHost(APP_DEFAULTS.mqttHost);
                setRemotePort(APP_DEFAULTS.mqttPort);
            }
        };
        load();
    }, []);

    const doConnect = useCallback((host: string, port: string) => {
        if (clientRef.current) {
            console.log('Ending previous MQTT connection...');
            clientRef.current.end();
            clientRef.current = null;
        }

        if (!host || !port) return;

        const brokerUrl = `wss://${host}:${port}/mqtt`;
        const clientId = `anomali-client-${Math.random().toString(16).substring(2, 10)}`;
        
        console.log('Connecting Global MQTT:', brokerUrl);

        try {
            const client = mqtt.connect(brokerUrl, {
                clientId,
                clean: true,
                connectTimeout: 15000,
                reconnectPeriod: 2000,
                keepalive: 60,
                resubscribe: true,
            });

            client.on('connect', () => {
                console.log('Global MQTT Connected');
                setState({ connected: true, error: null });
                // Subscribe to availability once connected
                client.subscribe(`${mqttTopic}/availability`);
            });

            client.on('message', (topic, payload) => {
                if (topic.endsWith('/availability')) {
                    setMcuOnline(payload.toString() === 'online');
                }
            });

            client.on('error', (err) => {
                setState({ connected: false, error: err.message });
            });

            client.on('close', () => {
                setState((prev) => ({ ...prev, connected: false }));
                setMcuOnline(false); // If MQTT is closed, assume MCU is offline
            });

            clientRef.current = client;
        } catch (err: any) {
            setState({ connected: false, error: err.message });
        }
    }, []);

    useEffect(() => {
        if (remoteHost && remotePort) {
            doConnect(remoteHost, remotePort);
        }
        return () => {
            if (clientRef.current) {
                clientRef.current.end();
            }
        };
    }, [remoteHost, remotePort, doConnect]);

    const subscribe = useCallback((topic: string) => {
        if (clientRef.current && state.connected) {
            clientRef.current.subscribe(topic);
        }
    }, [state.connected]);

    const publish = useCallback((topic: string, message: string, options?: mqtt.IClientPublishOptions) => {
        if (clientRef.current && state.connected) {
            clientRef.current.publish(topic, message, options || { qos: 0, retain: false });
        }
    }, [state.connected]);

    const onMessage = useCallback((callback: (topic: string, message: Buffer) => void) => {
        const client = clientRef.current;
        if (client) {
            const listener = (topic: string, m: Buffer) => callback(topic, m);
            client.on('message', listener);
            return () => {
                client.removeListener('message', listener);
            };
        }
        return () => { };
    }, []);

    const reconnect = useCallback((host: string, port: string, topic?: string) => {
        if (topic) setMqttTopic(topic);
        setRemoteHost(host);
        setRemotePort(port);
    }, []);

    return (
        <MqttContext.Provider value={{ ...state, subscribe, publish, onMessage, reconnect, mcuOnline, mqttTopic }}>
            {children}
        </MqttContext.Provider>
    );
}

export function useMqttContext() {
    const context = useContext(MqttContext);
    if (!context) {
        throw new Error('useMqttContext must be used within a MqttProvider');
    }
    return context;
}
