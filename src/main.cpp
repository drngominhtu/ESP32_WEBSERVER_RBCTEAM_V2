#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "AML_Robocon";
const char* password = "aml305b4";

// MQTT Broker settings
const char* mqtt_server = "192.168.5.1";
const int mqtt_port = 1883;
const char* mqtt_username = "AML_Robocon";
const char* mqtt_password = "aml305b4";
const char* mqtt_topic = "Swerve_Robot/data/#";

// Create objects
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
WiFiClient espClient;
PubSubClient mqtt_client(espClient);

// Add rate limiting variables
unsigned long lastMessageTime = 0;
const unsigned long MESSAGE_INTERVAL = 25; // 100ms between messages
const size_t MAX_QUEUE_SIZE = 32;

// Update MQTT callback
void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    // Rate limiting check
    unsigned long currentTime = millis();
    if (currentTime - lastMessageTime < MESSAGE_INTERVAL) {
        return;
    }
    lastMessageTime = currentTime;

    // Parse incoming JSON
    StaticJsonDocument<200> incomingDoc;
    deserializeJson(incomingDoc, payload, length);

    // Create separate messages for each value
    StaticJsonDocument<200> imuDoc;
    imuDoc["topic"] = "Swerve_Robot/data/imu";
    imuDoc["value"] = incomingDoc["imu"].as<float>();
    
    StaticJsonDocument<200> encoderXDoc;
    encoderXDoc["topic"] = "Swerve_Robot/data/encoder_x";
    encoderXDoc["value"] = incomingDoc["encoder_x"].as<float>();
    
    StaticJsonDocument<200> encoderYDoc;
    encoderYDoc["topic"] = "Swerve_Robot/data/encoder_y";
    encoderYDoc["value"] = incomingDoc["encoder_y"].as<float>();

    // Send each value via WebSocket
    if (ws.count() > 0) {
        String jsonString;
        
        serializeJson(imuDoc, jsonString);
        ws.textAll(jsonString);
        
        jsonString = "";
        serializeJson(encoderXDoc, jsonString);
        ws.textAll(jsonString);
        
        jsonString = "";
        serializeJson(encoderYDoc, jsonString);
        ws.textAll(jsonString);
    }
}

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            break;
        case WS_EVT_DISCONNECT:
            break;
        case WS_EVT_DATA:
            if (len > 0) {
                char message[len + 1];
                memcpy(message, data, len);
                message[len] = '\0';
                mqtt_client.publish("Swerve_Robot/command", message);
            }
            break;
    }
}

void setup() {
    delay(1000);
    Serial.begin(115200);

    // Initialize SPIFFS
    if(!SPIFFS.begin(true)) {
        Serial.println("An error occurred while mounting SPIFFS");
        return;  // Don't continue if SPIFFS fails
    }
    Serial.println("SPIFFS mounted successfully");

    // Connect to WiFi
    WiFi.begin(ssid, password);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected to WiFi");
    Serial.println("IP Address: " + WiFi.localIP().toString());

    // Setup MQTT
    mqtt_client.setServer(mqtt_server, mqtt_port);
    mqtt_client.setCallback(mqtt_callback);

    // Setup WebSocket
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    // Setup web routes with correct MIME types
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/index.html", "text/html");
    });

    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/style.css", "text/css");
    });

    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/script.js", "application/javascript");
    });

    server.begin();
    Serial.println("HTTP server started");
}

void reconnect_mqtt() {
    while (!mqtt_client.connected()) {
        Serial.println("Attempting MQTT connection...");
        if (mqtt_client.connect("ESP32Client", mqtt_username, mqtt_password)) {
            Serial.println("Connected to MQTT broker");
            mqtt_client.subscribe(mqtt_topic);
        } else {
            Serial.print("Failed, rc=");
            Serial.print(mqtt_client.state());
            Serial.println(" Retrying in 5 seconds");
            delay(5000);
        }
    }
}

void loop() {
    if (!mqtt_client.connected()) {
        reconnect_mqtt();
    }
    mqtt_client.loop();
}