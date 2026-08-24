// ==============================================================================
// ESP32 SHT35 Meat and Cheese Curing Chamber MQTT Firmware (Arduino / C++)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/esp32_curing_chamber_mqtt_ru.ino
// ==============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Adafruit_SHT31.h>

// Конфигурация камеры вызревания деликатесов (Алматинская область / Казы & Сыр)
const char* WIFI_SSID = "OZAT_CRAFT_CHAMBER_5G";
const char* WIFI_PASS = "Kazy_Safety_2026_Secure";

// Google Cloud IoT Bridge / MQTT Broker на Cloud Run
const char* MQTT_HOST = "iot-bridge-prod-xyz.a.run.app";
const int   MQTT_PORT = 8883;
const char* DEVICE_ID = "esp32-curing-chamber-almaty-01";
const char* TELEMETRY_TOPIC = "curing/chambers/almaty_01/telemetry";

Adafruit_SHT31 sht35 = Adafruit_SHT31();
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

void connectToNetwork() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
  
  // В продакшене используем доверенный Root CA сертификат Google Trust Services
  secureClient.setInsecure(); // для изолированного защищенного VPN-шлюза
}

void reconnectMqtt() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT TLS connection...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println(" Connected to Google Cloud IoT Bridge!");
    } else {
      Serial.print(" Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 3 seconds...");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // I2C пины ESP32 (SDA, SCL)
  
  if (!sht35.begin(0x44)) {
    Serial.println("CRITICAL: SHT35 Sensor not found! Check wiring.");
  }
  
  connectToNetwork();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMqtt();
  }
  mqttClient.loop();
  
  // Считываем прецизионные показания микроклимата
  float temp_c = sht35.readTemperature();
  float humidity_rh = sht35.readHumidity();
  
  if (!isnan(temp_c) && !isnan(humidity_rh)) {
    StaticJsonDocument<256> doc;
    doc["chamber_id"] = "almaty_meat_cheese_01";
    doc["temperature"] = round(temp_c * 100.0) / 100.0;
    doc["humidity"] = round(humidity_rh * 100.0) / 100.0;
    doc["target_product"] = "kazy_zhaya_gruyere";
    doc["timestamp_ms"] = millis();
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    // Публикация телеметрии в брокер каждые 10 секунд
    mqttClient.publish(TELEMETRY_TOPIC, buffer);
    Serial.printf("Telemetry sent: Temp=%.2f C, RH=%.2f%%\n", temp_c, humidity_rh);
  }
  
  delay(10000); // 10 секунд между циклами опроса
}
