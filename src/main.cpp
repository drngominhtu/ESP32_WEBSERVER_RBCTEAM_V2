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
AsyncWebServer server(80);  // HTTP server
AsyncWebServer wsServer(9001);  // WebSocket server
AsyncWebSocket ws("/ws");
WiFiClient espClient;
PubSubClient mqtt_client(espClient);

// Add rate limiting variables
unsigned long lastMessageTime = 0;
const unsigned long MESSAGE_INTERVAL = 25; // 100ms between messages
const size_t MAX_QUEUE_SIZE = 32; // Maximum queue size for WebSocket messages

// Update MQTT callback
void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    // Rate limiting check
    unsigned long currentTime = millis();
    if (currentTime - lastMessageTime < MESSAGE_INTERVAL) {
        return;
    }
    lastMessageTime = currentTime;

    // Create JSON document
    StaticJsonDocument<200> doc;
    
    // Parse incoming payload into JSON
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.print("JSON parsing failed: ");
        Serial.println(error.c_str());
        return;
    }

    // Forward the complete JSON message to WebSocket clients
    if (ws.count() > 0) {
        String jsonString;
        serializeJson(doc, jsonString);
        ws.textAll(jsonString);
    }
}

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
            break;
            
        case WS_EVT_DISCONNECT:
            Serial.printf("WebSocket client #%u disconnected\n", client->id());
            break;
            
        case WS_EVT_DATA:
            if (len > 0) {
                // Rate limiting check
                unsigned long currentTime = millis();
                if (currentTime - lastMessageTime < MESSAGE_INTERVAL) {
                    return;
                }
                lastMessageTime = currentTime;

                // Handle incoming data
                StaticJsonDocument<512> doc; // Increased buffer size
                char message[len + 1];
                memcpy(message, data, len);
                message[len] = '\0';
                
                DeserializationError error = deserializeJson(doc, message);
                if (!error) {
                    // Check for authentication message
                    if (doc.containsKey("type") && strcmp(doc["type"], "auth") == 0) {
                        const char* username = doc["username"];
                        const char* password = doc["password"];
                        if (strcmp(username, "rbcteam") == 0 && strcmp(password, "rbcteam") == 0) {
                            Serial.printf("Client #%u authenticated successfully\n", client->id());
                            // Send confirmation
                            client->text("{\"status\":\"authenticated\"}");
                        } else {
                            client->text("{\"error\":\"authentication_failed\"}");
                            client->close();
                            return;
                        }
                    } else {
                        // Forward to all authenticated clients
                        String jsonString;
                        serializeJson(doc, jsonString);
                        ws.textAll(jsonString);
                    }
                } else {
                    Serial.println("JSON parsing failed");
                    client->text("{\"error\":\"invalid_json\"}");
                }
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

    // Setup WebSocket server
    wsServer.addHandler(&ws);
    wsServer.begin();
    Serial.println("WebSocket server started on port 9001");

    // Setup web server routes
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
    Serial.println("HTTP server started on port 80");
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
    
    // Clean up disconnected WebSocket clients
    ws.cleanupClients();
}