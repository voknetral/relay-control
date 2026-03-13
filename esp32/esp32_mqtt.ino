#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>

// --- Configuration ---
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

// Relay Logic (Active High)
#define RELAY_ON HIGH
#define RELAY_OFF LOW

// NTP Settings
const char *ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 7 * 3600; // WIB (UTC+7)
const int daylightOffset_sec = 0;

// Device Definitions
struct Device {
  const char *id;
  int pin;
  const char *topic_set;
  const char *topic_state;
  const char *topic_schedule;
  const char *topic_mode_set;
  const char *topic_mode_state;
};

Device devices[] = {{"1", 16, "anomali/device/1/set", "anomali/device/1/state",
                     "anomali/device/1/schedule", "anomali/device/1/mode/set",
                     "anomali/device/1/mode/state"},
                    {"2", 17, "anomali/device/2/set", "anomali/device/2/state",
                     "anomali/device/2/schedule", "anomali/device/2/mode/set",
                     "anomali/device/2/mode/state"},
                    {"3", 18, "anomali/device/3/set", "anomali/device/3/state",
                     "anomali/device/3/schedule", "anomali/device/3/mode/set",
                     "anomali/device/3/mode/state"},
                    {"4", 19, "anomali/device/4/set", "anomali/device/4/state",
                     "anomali/device/4/schedule", "anomali/device/4/mode/set",
                     "anomali/device/4/mode/state"},
                    {"5", 21, "anomali/device/5/set", "anomali/device/5/state",
                     "anomali/device/5/schedule", "anomali/device/5/mode/set",
                     "anomali/device/5/mode/state"},
                    {"6", 22, "anomali/device/6/set", "anomali/device/6/state",
                     "anomali/device/6/schedule", "anomali/device/6/mode/set",
                     "anomali/device/6/mode/state"}};

const int NUM_DEVICES = sizeof(devices) / sizeof(Device);
const char *availabilityTopic = "anomali/device/availability";
const char *getTopic = "anomali/device/get";

WiFiClient espClient;
PubSubClient client(espClient);
Preferences preferences;

// State tracking
int last_minute_triggered = -1;
unsigned long last_reconnect_attempt = 0;

void setup_wifi() {
  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);
}

void saveSchedules(int deviceIdx, String json) {
  preferences.begin("anomali", false);
  preferences.putString(("sch_" + String(devices[deviceIdx].id)).c_str(), json);
  preferences.end();
}

String loadSchedules(int deviceIdx) {
  preferences.begin("anomali", true);
  String json = preferences.getString(
      ("sch_" + String(devices[deviceIdx].id)).c_str(), "[]");
  preferences.end();
  return json;
}

void saveMode(int deviceIdx, String mode) {
  preferences.begin("anomali", false);
  preferences.putString(("mode_" + String(devices[deviceIdx].id)).c_str(),
                        mode);
  preferences.end();
}

String loadMode(int deviceIdx) {
  preferences.begin("anomali", true);
  String mode = preferences.getString(
      ("mode_" + String(devices[deviceIdx].id)).c_str(), "auto");
  preferences.end();
  return mode;
}

void callback(char *topic, byte *payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++)
    message += (char)payload[i];

  for (int i = 0; i < NUM_DEVICES; i++) {
    if (String(topic) == devices[i].topic_set) {
      bool newState = (message == "ON");
      digitalWrite(devices[i].pin, newState ? RELAY_ON : RELAY_OFF);
      client.publish(devices[i].topic_state, newState ? "ON" : "OFF", true);
      break;
    } else if (String(topic) == devices[i].topic_schedule) {
      saveSchedules(i, message);
      break;
    } else if (String(topic) == devices[i].topic_mode_set) {
      if (message == "auto" || message == "manual") {
        saveMode(i, message);
        client.publish(devices[i].topic_mode_state, message.c_str(), true);
      }
      break;
    } else if (String(topic) == getTopic) {
      // Sync all device states
      for (int j = 0; j < NUM_DEVICES; j++) {
        client.publish(devices[j].topic_state,
                       (digitalRead(devices[j].pin) == RELAY_ON) ? "ON" : "OFF",
                       true);
        client.publish(devices[j].topic_mode_state, loadMode(j).c_str(), true);
      }
      break;
    }
  }
}

boolean reconnect() {
  String clientId = "Anomali-MCU-" + String(random(0xffff), HEX);
  if (client.connect(clientId.c_str(), availabilityTopic, 0, true, "offline")) {
    client.publish(availabilityTopic, "online", true);
    for (int i = 0; i < NUM_DEVICES; i++) {
      client.subscribe(devices[i].topic_set);
      client.subscribe(devices[i].topic_schedule);
      client.subscribe(devices[i].topic_mode_set);
    }
    client.subscribe(getTopic);

    // Sync current state back to app on initial connection
    for (int i = 0; i < NUM_DEVICES; i++) {
      client.publish(devices[i].topic_state,
                     (digitalRead(devices[i].pin) == RELAY_ON) ? "ON" : "OFF",
                     true);
      client.publish(devices[i].topic_mode_state, loadMode(i).c_str(), true);
    }
    return true;
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

  char currentTime[6];
  sprintf(currentTime, "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
  Serial.print("Checking schedules for: ");
  Serial.println(currentTime);

  for (int i = 0; i < NUM_DEVICES; i++) {
    if (loadMode(i) != "auto")
      continue;

    String json = loadSchedules(i);
    DynamicJsonDocument doc(1024);
    if (deserializeJson(doc, json))
      continue;

    for (JsonObject s : doc.as<JsonArray>()) {
      if (!s["isEnabled"])
        continue;

      if (strcmp(currentTime, s["startTime"]) == 0) {
        digitalWrite(devices[i].pin, RELAY_ON);
        client.publish(devices[i].topic_state, "ON", true);
      } else if (strcmp(currentTime, s["endTime"]) == 0) {
        digitalWrite(devices[i].pin, RELAY_OFF);
        client.publish(devices[i].topic_state, "OFF", true);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_DEVICES; i++) {
    pinMode(devices[i].pin, OUTPUT);
    digitalWrite(devices[i].pin, RELAY_OFF);
  }

  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // Init NTP
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      unsigned long now = millis();
      if (now - last_reconnect_attempt > 5000) {
        last_reconnect_attempt = now;
        if (reconnect()) {
          last_reconnect_attempt = 0;
        }
      }
    } else {
      client.loop();
    }
  } else {
    // WiFi lost - non-blocking attempt to reconnect
    if (millis() % 10000 == 0)
      WiFi.begin(ssid, password);
  }

  // Check schedules every few seconds (non-blocking)
  static unsigned long last_sch_ms = 0;
  if (millis() - last_sch_ms > 2000) {
    last_sch_ms = millis();
    checkSchedules();
  }
}
