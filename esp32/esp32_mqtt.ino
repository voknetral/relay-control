#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>

// --- Configuration ---
const char *ssid = "TEKNOLAB Office";
const char *password = "selamatdatang";

// MQTT Configuration
const char *mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char *base_topic = "voknetral/device"; // Base topic for all devices
const char *prefs_namespace = "voknetral";
const char *legacy_prefs_namespace = "anomali";

// Relay Pins Definition
#define RELAY_PIN_1 12
#define RELAY_PIN_2 14
#define RELAY_PIN_3 27
#define RELAY_PIN_4 26

// Relay Logic (Active High)
#define RELAY_ON HIGH
#define RELAY_OFF LOW

// NTP Settings
const char *ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 7 * 3600; // WIB (UTC+7)
const int daylightOffset_sec = 0;

// Generate a consistent device ID based on MAC address
String getDeviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", 
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return "Voknetral-ESP32-" + String(macStr);
}

// Device Definitions
struct Device {
  const char *id;
  int pin;
  String topic_set;
  String topic_state;
  String topic_schedule;
  String topic_mode_set;
  String topic_mode_state;
  String topic_availability;
  String topic_verify;
};

Device devices[] = {{"1", RELAY_PIN_1, "", "", "", "", "", ""},
                    {"2", RELAY_PIN_2, "", "", "", "", "", ""},
                    {"3", RELAY_PIN_3, "", "", "", "", "", ""},
                    {"4", RELAY_PIN_4, "", "", "", "", "", ""}};

const int NUM_DEVICES = sizeof(devices) / sizeof(Device);

// Dynamic Shared Topics
String availabilityTopic;
String getTopic;
String verifyTopic;

WiFiClient espClient;
PubSubClient client(espClient);
Preferences preferences;

// State tracking
int last_minute_triggered = -1;
unsigned long last_reconnect_attempt = 0;
unsigned long last_manual_command_ms[NUM_DEVICES] = {0};
const unsigned long COMMAND_DEBOUNCE_MS = 500;
const unsigned long RECONNECT_DEBOUNCE_MS = 1000; // Reduced from 5000ms for faster reconnection
unsigned long last_connection_check = 0;
const unsigned long CONNECTION_CHECK_INTERVAL_MS = 3000;

void setup_wifi() {
  Serial.println("\nConnecting to WiFi...");
  Serial.print("SSID: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect to WiFi, will retry in loop");
  }
}

void savePreferenceValue(const String &key, const String &value) {
  preferences.begin(prefs_namespace, false);
  preferences.putString(key.c_str(), value);
  preferences.end();
}

String loadPreferenceValue(const String &key, const char *defaultValue) {
  preferences.begin(prefs_namespace, true);
  bool existsInCurrentNamespace = preferences.isKey(key.c_str());
  String value = preferences.getString(key.c_str(), defaultValue);
  preferences.end();

  if (existsInCurrentNamespace) {
    return value;
  }

  preferences.begin(legacy_prefs_namespace, true);
  bool existsInLegacyNamespace = preferences.isKey(key.c_str());
  String legacyValue = preferences.getString(key.c_str(), defaultValue);
  preferences.end();

  if (!existsInLegacyNamespace) {
    return defaultValue;
  }

  savePreferenceValue(key, legacyValue);
  return legacyValue;
}

void saveSchedules(int deviceIdx, String json) {
  savePreferenceValue("sch_" + String(devices[deviceIdx].id), json);
}

String loadSchedules(int deviceIdx) {
  return loadPreferenceValue("sch_" + String(devices[deviceIdx].id), "[]");
}

void saveMode(int deviceIdx, String mode) {
  savePreferenceValue("mode_" + String(devices[deviceIdx].id), mode);
}

String loadMode(int deviceIdx) {
  return loadPreferenceValue("mode_" + String(devices[deviceIdx].id), "manual");
}

void callback(char *topic, byte *payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++)
    message += (char)payload[i];

  if (String(topic) == getTopic) {
    for (int j = 0; j < NUM_DEVICES; j++) {
      client.publish(devices[j].topic_state.c_str(),
                     (digitalRead(devices[j].pin) == RELAY_ON) ? "ON" : "OFF",
                     true);
      client.publish(devices[j].topic_mode_state.c_str(), loadMode(j).c_str(),
                     true);
      client.publish(devices[j].topic_availability.c_str(), "online", true);
    }
    return;
  }

  if (String(topic) == verifyTopic) {
    for (int j = 0; j < NUM_DEVICES; j++) {
      client.publish(devices[j].topic_verify.c_str(), message.c_str(), false);
    }
    return;
  }

  for (int i = 0; i < NUM_DEVICES; i++) {
    if (String(topic) == devices[i].topic_set) {
      unsigned long now = millis();
      if (now - last_manual_command_ms[i] < COMMAND_DEBOUNCE_MS) {
        return;
      }
      last_manual_command_ms[i] = now;

      bool newState = (message == "ON");
      digitalWrite(devices[i].pin, newState ? RELAY_ON : RELAY_OFF);
      client.publish(devices[i].topic_state.c_str(), newState ? "ON" : "OFF",
                     true);
      break;
    } else if (String(topic) == devices[i].topic_schedule) {
      saveSchedules(i, message);
      break;
    } else if (String(topic) == devices[i].topic_mode_set) {
      if (message == "auto" || message == "manual") {
        saveMode(i, message);
        client.publish(devices[i].topic_mode_state.c_str(), message.c_str(),
                       true);
      }
      break;
    }
  }
}

bool isTimeInRange(const char* startStr, const char* endStr, int currentMins) {
  int startH, startM, endH, endM;
  if (sscanf(startStr, "%d:%d", &startH, &startM) != 2) return false;
  if (sscanf(endStr, "%d:%d", &endH, &endM) != 2) return false;

  int startMins = startH * 60 + startM;
  int endMins = endH * 60 + endM;

  if (startMins < endMins) {
    return (currentMins >= startMins && currentMins < endMins);
  } else {
    // Crosses midnight
    return (currentMins >= startMins || currentMins < endMins);
  }
}

boolean reconnect() {
  if (client.connected()) {
    return true; // Already connected
  }

  String clientId = getDeviceId();
  Serial.print("Connecting with clientId: ");
  Serial.println(clientId);

  if (client.connect(clientId.c_str(), availabilityTopic.c_str(), 0, true, "offline")) {
    Serial.println("MQTT Connected!");
    client.publish(availabilityTopic.c_str(), "online", true);
    
    // Subscribe to all topics
    for (int i = 0; i < NUM_DEVICES; i++) {
      client.subscribe(devices[i].topic_set.c_str());
      client.subscribe(devices[i].topic_schedule.c_str());
      client.subscribe(devices[i].topic_mode_set.c_str());
      client.subscribe(devices[i].topic_availability.c_str());
    }
    client.subscribe(getTopic.c_str());
    client.subscribe(verifyTopic.c_str());

    // Sync current state back to app on initial connection
    for (int i = 0; i < NUM_DEVICES; i++) {
      client.publish(devices[i].topic_state.c_str(),
                     (digitalRead(devices[i].pin) == RELAY_ON) ? "ON" : "OFF",
                     true);
      client.publish(devices[i].topic_mode_state.c_str(), loadMode(i).c_str(),
                     true);
      client.publish(devices[i].topic_availability.c_str(), "online", true);
    }
    
    Serial.println("Successfully subscribed to all topics and published initial states");
    return true;
  } else {
    int state = client.state();
    Serial.print("MQTT connect failed, code: ");
    Serial.println(state);
    switch (state) {
      case -4: Serial.println("MQTT_CONNECTION_TIMEOUT"); break;
      case -3: Serial.println("MQTT_CONNECTION_LOST"); break;
      case -2: Serial.println("MQTT_CONNECT_FAILED"); break;
      case -1: Serial.println("MQTT_DISCONNECTED"); break;
      case 1: Serial.println("MQTT_CONNECT_BAD_PROTOCOL"); break;
      case 2: Serial.println("MQTT_CONNECT_BAD_CLIENT_ID"); break;
      case 3: Serial.println("MQTT_CONNECT_UNAVAILABLE"); break;
      case 4: Serial.println("MQTT_CONNECT_BAD_CREDENTIALS"); break;
      case 5: Serial.println("MQTT_CONNECT_UNAUTHORIZED"); break;
      default: Serial.println("Unknown error");
    }
  }
  return false;
}

void checkSchedules() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
    return;

  // Prevent multiple triggers in the same minute
  if (timeinfo.tm_min == last_minute_triggered)
    return;
  last_minute_triggered = timeinfo.tm_min;

  int currentMins = timeinfo.tm_hour * 60 + timeinfo.tm_min;

  for (int i = 0; i < NUM_DEVICES; i++) {
    if (loadMode(i) != "auto")
      continue;

    String json = loadSchedules(i);
    JsonDocument doc;
    if (deserializeJson(doc, json))
      continue;

    bool shouldBeOn = false;
    for (JsonObject s : doc.as<JsonArray>()) {
      if (!s["isEnabled"])
        continue;

      const char* startTime = s["startTime"].as<const char*>();
      const char* endTime = s["endTime"].as<const char*>();

      if (startTime && endTime && isTimeInRange(startTime, endTime, currentMins)) {
        shouldBeOn = true;
        break;
      }
    }

    // Only update if state changes to reduce wear and MQTT traffic
    bool currentState = (digitalRead(devices[i].pin) == RELAY_ON);
    if (currentState != shouldBeOn) {
      digitalWrite(devices[i].pin, shouldBeOn ? RELAY_ON : RELAY_OFF);
      client.publish(devices[i].topic_state.c_str(), shouldBeOn ? "ON" : "OFF", true);
      Serial.printf("Device %s switched %s by schedule\n", devices[i].id, shouldBeOn ? "ON" : "OFF");
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  Serial.println("\n\n=== ESP32 Relay Control Starting ===");
  Serial.print("Device ID: ");
  Serial.println(getDeviceId());

  // Initialize topics dynamically
  availabilityTopic = String(base_topic) + "/availability";
  getTopic = String(base_topic) + "/get";
  verifyTopic = String(base_topic) + "/verify";

  for (int i = 0; i < NUM_DEVICES; i++) {
    String deviceBase = String(base_topic) + "/" + String(devices[i].id);
    devices[i].topic_set = deviceBase + "/set";
    devices[i].topic_state = deviceBase + "/state";
    devices[i].topic_schedule = deviceBase + "/schedule";
    devices[i].topic_mode_set = deviceBase + "/mode/set";
    devices[i].topic_mode_state = deviceBase + "/mode/state";
    devices[i].topic_availability = deviceBase + "/availability";
    devices[i].topic_verify = deviceBase + "/verify";

    pinMode(devices[i].pin, OUTPUT);
    digitalWrite(devices[i].pin, RELAY_OFF);
  }

  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // Init NTP
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  Serial.println("Setup complete, waiting for WiFi connection...");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      unsigned long now = millis();
      if (now - last_reconnect_attempt > RECONNECT_DEBOUNCE_MS) {
        last_reconnect_attempt = now;
        Serial.println("Attempting to reconnect to MQTT...");
        if (reconnect()) {
          last_reconnect_attempt = 0;
        }
      }
    } else {
      client.loop();
    }
  } else {
    // WiFi lost - non-blocking attempt to reconnect
    static unsigned long last_wifi_ms = 0;
    if (millis() - last_wifi_ms > 10000) {
      last_wifi_ms = millis();
      Serial.println("WiFi lost - attempting to reconnect...");
      WiFi.begin(ssid, password);
    }
  }

  // Check schedules every few seconds (non-blocking)
  static unsigned long last_sch_ms = 0;
  if (millis() - last_sch_ms > 2000) {
    last_sch_ms = millis();
    checkSchedules();
  }

  // Periodic connection status check
  unsigned long now = millis();
  if (now - last_connection_check > CONNECTION_CHECK_INTERVAL_MS) {
    last_connection_check = now;
    if (!client.connected()) {
      Serial.print("Connection lost. WiFi: ");
      Serial.print(WiFi.status() == WL_CONNECTED ? "OK" : "DISCONNECTED");
      Serial.println();
    }
  }
}
