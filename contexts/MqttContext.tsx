import { APP_DEFAULTS } from "@/constants/Config";
import { Storage } from "@/utils/storage";
import mqtt from "mqtt";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

interface MqttState {
  connected: boolean;
  error: string | null;
}

interface MqttContextValue extends MqttState {
  subscribe: (topic: string) => void;
  publish: (
    topic: string,
    message: string,
    options?: mqtt.IClientPublishOptions,
  ) => void;
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

  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [mqttTopic, setMqttTopic] = useState(APP_DEFAULTS.mqttTopic);
  const [mcuOnline, setMcuOnline] = useState(false);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const previousAvailabilityTopicRef = useRef(
    `${APP_DEFAULTS.mqttTopic}/availability`,
  );
  const mqttTopicRef = useRef(APP_DEFAULTS.mqttTopic);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const clientIdRef = useRef(
    `smart-relay-${Math.random().toString(16).slice(2, 10)}`,
  );
  const currentBrokerUrlRef = useRef<string | null>(null);
  const debugLog = (...args: any[]) => {
    if (__DEV__) {
      console.log(...args);
    }
  };

  const resolveBrokerUrl = useCallback((host: string, port: string) => {
    const normalizedHost = (host || APP_DEFAULTS.mqttHost).trim();
    let normalizedPort = (port || APP_DEFAULTS.mqttPort).trim();
    let protocol = "wss";

    // HiveMQ public broker for app-side WebSocket access should use 8884 by default.
    if (normalizedHost === "broker.hivemq.com" && normalizedPort === "1883") {
      normalizedPort = "8884";
    }

    if (normalizedPort === "8000" || normalizedPort === "8083") {
      protocol = "ws";
    }

    return `${protocol}://${normalizedHost}:${normalizedPort}/mqtt`;
  }, []);

  const updateAvailabilitySubscription = useCallback((topic: string) => {
    const client = clientRef.current;
    const nextAvailabilityTopic = `${topic}/availability`;
    const previousAvailabilityTopic = previousAvailabilityTopicRef.current;

    if (!client || !client.connected) {
      previousAvailabilityTopicRef.current = nextAvailabilityTopic;
      setMcuOnline(false);
      return;
    }

    if (previousAvailabilityTopic !== nextAvailabilityTopic) {
      client.unsubscribe(previousAvailabilityTopic);
    }

    client.subscribe(nextAvailabilityTopic);
    previousAvailabilityTopicRef.current = nextAvailabilityTopic;
    setMcuOnline(false);
  }, []);

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

  const doConnect = useCallback(
    (host: string, port: string, topic: string) => {
      if (!host || !port) return;

      const brokerUrl = resolveBrokerUrl(host, port);

      // Always disconnect existing client to ensure clean state
      if (clientRef.current) {
        debugLog("Closing previous MQTT connection...");
        try {
          clientRef.current.end(true);
        } catch (err) {
          debugLog("Error closing previous client:", err);
        }
        clientRef.current = null;
        currentBrokerUrlRef.current = null;
      }

      // Skip if broker URL hasn't changed and we're already connected
      if (currentBrokerUrlRef.current === brokerUrl) {
        debugLog("MQTT already connected to:", brokerUrl);
        return;
      }

      debugLog("Connecting to MQTT:", brokerUrl);

      try {
        const client = mqtt.connect(brokerUrl, {
          clientId: clientIdRef.current,
          clean: false,
          connectTimeout: 30000,
          reconnectPeriod: 2500,
          keepalive: 60,
          resubscribe: true,
          queueQoSZero: true,
          reschedulePings: true,
          protocolVersion: 4,
        });

        client.on("connect", () => {
          debugLog("MQTT Connected");
          currentBrokerUrlRef.current = brokerUrl;
          setState({ connected: true, error: null });
          updateAvailabilitySubscription(topic);
        });

        client.on("message", (topic, payload) => {
          if (topic.endsWith("/availability")) {
            setMcuOnline(payload.toString() === "online");
          }
        });

        client.on("error", (err) => {
          debugLog("MQTT Error:", err.message);
          setState({ connected: false, error: err.message });
        });

        client.on("offline", () => {
          debugLog("MQTT Offline");
          setState((prev) => ({ ...prev, connected: false }));
        });

        client.on("reconnect", () => {
          debugLog("MQTT Reconnecting");
          setState((prev) => ({ ...prev, connected: false }));
        });

        client.on("close", () => {
          debugLog("MQTT Closed");
          setState((prev) => ({ ...prev, connected: false }));
          setMcuOnline(false);
          if (currentBrokerUrlRef.current === brokerUrl) {
            currentBrokerUrlRef.current = null;
          }
        });

        clientRef.current = client;
      } catch (err: any) {
        debugLog("MQTT Connection Error:", err.message);
        setState({ connected: false, error: err.message });
      }
    },
    [resolveBrokerUrl, updateAvailabilitySubscription],
  );

  useEffect(() => {
    if (remoteHost && remotePort) {
      doConnect(remoteHost, remotePort, mqttTopicRef.current);
    }
  }, [remoteHost, remotePort, doConnect]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    mqttTopicRef.current = mqttTopic;
    updateAvailabilitySubscription(mqttTopic);
  }, [mqttTopic, updateAvailabilitySubscription]);

  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        previousState.match(/inactive|background/) &&
        nextState === "active"
      ) {
        // App resumed from background - force reconnect
        debugLog("App resumed from background, forcing MQTT reconnect");
        if (clientRef.current) {
          clientRef.current.end(true);
          clientRef.current = null;
          currentBrokerUrlRef.current = null;
        }

        // Schedule reconnection after a short delay to ensure cleanup
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (remoteHost && remotePort) {
            doConnect(remoteHost, remotePort, mqttTopicRef.current);
          }
        }, 500);
      } else if (nextState.match(/inactive|background/)) {
        // App going to background
        debugLog("App going to background");
        if (reconnectTimer) clearTimeout(reconnectTimer);
      }
    });

    return () => {
      subscription.remove();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [remoteHost, remotePort, doConnect]);

  const subscribe = useCallback((topic: string) => {
    if (clientRef.current) {
      if (clientRef.current.connected) {
        debugLog("Subscribing to:", topic);
        clientRef.current.subscribe(topic);
      } else {
        debugLog("Cannot subscribe - MQTT not connected:", topic);
      }
    }
  }, []);

  const publish = useCallback(
    (topic: string, message: string, options?: mqtt.IClientPublishOptions) => {
      if (clientRef.current) {
        if (clientRef.current.connected) {
          clientRef.current.publish(
            topic,
            message,
            options || { qos: 0, retain: false },
          );
        } else {
          debugLog("Cannot publish - MQTT not connected:", topic);
        }
      }
    },
    [],
  );

  const onMessage = useCallback(
    (callback: (topic: string, message: Buffer) => void) => {
      const client = clientRef.current;
      if (client) {
        const listener = (topic: string, m: Buffer) => callback(topic, m);
        client.on("message", listener);
        return () => {
          client.removeListener("message", listener);
        };
      }
      return () => {};
    },
    [],
  );

  const reconnect = useCallback(
    (host: string, port: string, topic?: string) => {
      const normalizedHost = host || APP_DEFAULTS.mqttHost;
      const normalizedPort = port || APP_DEFAULTS.mqttPort;
      const normalizedTopic = topic || mqttTopic || APP_DEFAULTS.mqttTopic;

      const hostChanged = normalizedHost !== remoteHost;
      const portChanged = normalizedPort !== remotePort;
      const topicChanged = normalizedTopic !== mqttTopic;

      if (topicChanged) {
        setMqttTopic(normalizedTopic);
      }

      if (hostChanged) setRemoteHost(normalizedHost);
      if (portChanged) setRemotePort(normalizedPort);

      if (
        !hostChanged &&
        !portChanged &&
        !clientRef.current &&
        normalizedHost &&
        normalizedPort
      ) {
        doConnect(normalizedHost, normalizedPort, normalizedTopic);
      }
    },
    [doConnect, mqttTopic, remoteHost, remotePort],
  );

  return (
    <MqttContext.Provider
      value={{
        ...state,
        subscribe,
        publish,
        onMessage,
        reconnect,
        mcuOnline,
        mqttTopic,
      }}
    >
      {children}
    </MqttContext.Provider>
  );
}

export function useMqttContext() {
  const context = useContext(MqttContext);
  if (!context) {
    throw new Error("useMqttContext must be used within a MqttProvider");
  }
  return context;
}
