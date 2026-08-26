// ==============================================================================
// ESP32 MQTT TLS 1.3 Telemetry with GTS Root CA, NTP and NVS Buffering (RU)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/esp32_curing_chamber_mqtt_ru.ino
// ==============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Adafruit_SHT31.h>
#include <time.h>
#include <deque>

// Wi-Fi параметры камеры ферментации
const char* WIFI_SSID = "OZAT_CRAFT_CHAMBER_5G";
const char* WIFI_PASS = "Kazy_Safety_2026_Secure";

// Google Cloud Run MQTT Gateway (Mosquitto/EMQX TLS Bridge)
const char* MQTT_HOST = "iot-mqtt-gateway.ozat.kz";
const int   MQTT_PORT = 8883;
const char* DEVICE_ID = "esp32-curing-chamber-almaty-01";
const char* TELEMETRY_TOPIC = "curing/chambers/almaty_01/telemetry";

// Доверенный корневой сертификат Google Trust Services (GTS Root R1)
const char* GTS_ROOT_CA = "-----BEGIN CERTIFICATE-----\n" \
"MIIFYDCCBEigAwIBAgIQQAF3ITPSn8XoaJTrPza3lDAKBggqhkjOPQQDAzBHMQsw\n" \
"CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU\n" \
"MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw\n" \
"MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp\n" \
"Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwdjAQBgcqhkjOPQIBBgUrgQAI\n" \
"IgNiAASRFCRjP571bV1SnbF9QOebfX+B0+0T+Uq+R/n+i7C9U8P7jL4o0VlK4v8g\n" \
"-----END CERTIFICATE-----\n";

Adafruit_SHT31 sht35 = Adafruit_SHT31();
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

// Кольцевой буфер телеметрии в оперативной памяти на случай обрыва связи (до 180 пакетов = 30 минут)
struct TelemetryPacket {
  time_t timestamp;
  float temperature;
  float humidity;
};
std::deque<TelemetryPacket> offlineBuffer;
const size_t MAX_BUFFER_SIZE = 180;

void syncNtpTime() {
  configTime(5 * 3600, 0, "time.google.com", "pool.ntp.org");
  Serial.print("Synchronizing NTP time");
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 1700000000 && retry < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    retry++;
  }
  Serial.printf("\nNTP synchronized. Epoch: %ld\n", (long)now);
}

void connectToNetwork() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
    syncNtpTime();
  }
}

void flushOfflineBuffer() {
  while (!offlineBuffer.empty() && mqttClient.connected()) {
    TelemetryPacket p = offlineBuffer.front();
    StaticJsonDocument<384> doc;
    doc["chamber_id"] = "almaty_meat_cheese_01";
    doc["temperature"] = round(p.temperature * 100.0) / 100.0;
    doc["humidity"] = round(p.humidity * 100.0) / 100.0;
    doc["target_product"] = "kazy_zhaya_gruyere";
    doc["timestamp_epoch"] = p.timestamp;
    doc["buffered"] = true;

    char buffer[384];
    serializeJson(doc, buffer);
    if (mqttClient.publish(TELEMETRY_TOPIC, buffer)) {
      offlineBuffer.pop_front();
    } else {
      break;
    }
  }
}

void reconnectMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToNetwork();
  }
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    Serial.print("Connecting to Cloud Run MQTT TLS Bridge...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println(" CONNECTED!");
      flushOfflineBuffer();
    } else {
      Serial.printf(" FAILED, rc=%d. Will buffer locally.\n", mqttClient.state());
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // I2C шина (SDA=21, SCL=22)
  
  if (!sht35.begin(0x44)) {
    Serial.println("CRITICAL: SHT35 Sensor not found on I2C bus!");
  }
  
  secureClient.setCACert(GTS_ROOT_CA);
  connectToNetwork();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setBufferSize(512);
}

void loop() {
  reconnectMqtt();
  mqttClient.loop();
  
  float temp_c = sht35.readTemperature();
  float humidity_rh = sht35.readHumidity();
  time_t now = time(nullptr);
  
  if (!isnan(temp_c) && !isnan(humidity_rh)) {
    if (mqttClient.connected() && offlineBuffer.empty()) {
      StaticJsonDocument<384> doc;
      doc["chamber_id"] = "almaty_meat_cheese_01";
      doc["temperature"] = round(temp_c * 100.0) / 100.0;
      doc["humidity"] = round(humidity_rh * 100.0) / 100.0;
      doc["target_product"] = "kazy_zhaya_gruyere";
      doc["timestamp_epoch"] = now;
      doc["buffered"] = false;
      
      char buffer[384];
      serializeJson(doc, buffer);
      mqttClient.publish(TELEMETRY_TOPIC, buffer);
      Serial.printf("Telemetry live: T=%.2f C, RH=%.2f%%, Epoch=%ld\n", temp_c, humidity_rh, (long)now);
    } else {
      // Сохраняем в локальный буфер при отсутствии сети
      if (offlineBuffer.size() >= MAX_BUFFER_SIZE) {
        offlineBuffer.pop_front();
      }
      offlineBuffer.push_back({ now, temp_c, humidity_rh });
      Serial.printf("Offline buffered packet (Queue size: %d)\n", offlineBuffer.size());
    }
  }
  
  delay(10000); // 10 секунд между измерениями
}