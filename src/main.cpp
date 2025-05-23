#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <set>

// WiFi credentials
const char* ssid = "AML_Robocon";
const char* password = "aml305b4";

// MQTT Broker settings
const char* mqtt_server = "192.168.5.1";
const int mqtt_port = 1883;
const char* mqtt_username = "AML_Robocon";
const char* mqtt_password = "aml305b4";
const char* mqtt_topic = "#"; //sửa thành topic = #

// Create objects
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
WiFiClient espClient;
PubSubClient mqtt_client(espClient);

// Increase rate limit interval to reduce overhead
unsigned long lastMessageTime = 0;
const unsigned long MESSAGE_INTERVAL = 100; // Increased from 25ms to 100ms
const size_t MAX_QUEUE_SIZE = 32; // Maximum queue size for WebSocket messages

// Lưu trữ các topic đã phát hiện
std::set<String> knownTopics;
String currentSubscribedTopic = "#"; // Topic đang được subscribe

// Update MQTT callback
void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    // Rate limiting check
    unsigned long currentTime = millis();
    if (currentTime - lastMessageTime < MESSAGE_INTERVAL) {
        return;
    }
    lastMessageTime = currentTime;

    // REMOVED all Serial.print for incoming MQTT messages

    // Lưu topic mới vào danh sách
    String topicStr = String(topic);
    bool isNewTopic = false;
    
    if (knownTopics.find(topicStr) == knownTopics.end()) {
        knownTopics.insert(topicStr);
        isNewTopic = true;
        
        // Keep only this critical new topic discovery log
        Serial.print("New topic: ");
        Serial.println(topicStr);
    }

    // Tạo JSON với name và value
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.print("JSON parsing failed: ");
        Serial.println(error.c_str());
        return;
    }

    // REMOVED all Serial.print for JSON payload

    // Nếu topic hiện tại là "#" hoặc topic này là topic đang được subscribe
    // Hoặc topic này là con của topic đang được subscribe
    if (currentSubscribedTopic == "#" || 
        topicStr == currentSubscribedTopic || 
        topicStr.startsWith(currentSubscribedTopic + "/")) {
        // Forward JSON message không có address
        if (ws.count() > 0) {
            String jsonString;
            // Add topic to the JSON before forwarding
            doc["topic"] = topicStr; // Make sure topic is included in the forwarded JSON
            serializeJson(doc, jsonString);
            ws.textAll(jsonString);
        }
    }

    // Nếu có topic mới, luôn gửi danh sách cập nhật cho clients
    if (isNewTopic && ws.count() > 0) {
        StaticJsonDocument<1024> topicDoc;
        topicDoc["type"] = "topic_list";
        JsonArray topicArray = topicDoc.createNestedArray("topics");
        
        for (const String& t : knownTopics) {
            topicArray.add(t);
        }
        
        String topicList;
        serializeJson(topicDoc, topicList);
        ws.textAll(topicList);
    }
}

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT: {
            // Keep only critical connection log
            Serial.print("WebSocket client connected #");
            Serial.println(client->id());
            
            // Send topic list to new client
            StaticJsonDocument<1024> topicDoc;
            topicDoc["type"] = "topic_list";
            JsonArray topicArray = topicDoc.createNestedArray("topics");
            
            for (const String& t : knownTopics) {
                topicArray.add(t);
            }
            
            String topicList;
            serializeJson(topicDoc, topicList);
            client->text(topicList);
            break;
        }
            
        case WS_EVT_DISCONNECT:
            // Keep only critical disconnect log
            Serial.print("WebSocket client disconnected #");
            Serial.println(client->id());
            break;
            
        case WS_EVT_DATA:
            if (len > 0) {
                // REMOVED verbose data logs
                
                char message[len + 1];
                memcpy(message, data, len);
                message[len] = '\0';
                
                // Kiểm tra xem đây có phải là lệnh đăng ký topic mới không
                StaticJsonDocument<200> doc;
                DeserializationError error = deserializeJson(doc, message);
                
                if (!error && doc.containsKey("action")) {
                    String action = doc["action"];
                    
                    if (action == "subscribe" && doc.containsKey("topic")) {
                        String newTopic = doc["topic"];
                        // Keep subscribe action log
                        Serial.print("Subscribing to: ");
                        Serial.println(newTopic);
                        
                        // Hủy đăng ký topic cũ và đăng ký topic mới
                        mqtt_client.unsubscribe(currentSubscribedTopic.c_str());
                        currentSubscribedTopic = newTopic;
                        mqtt_client.subscribe(currentSubscribedTopic.c_str());
                        
                        // Thông báo cho client
                        StaticJsonDocument<200> response;
                        response["type"] = "subscribe_response";
                        response["status"] = "success";
                        response["topic"] = newTopic;
                        
                        String jsonResponse;
                        serializeJson(response, jsonResponse);
                        client->text(jsonResponse);
                    }
                } else {
                    // Đây là lệnh khác, chuyển tiếp tới MQTT
                    mqtt_client.publish("Swerve_Robot/command", message); // Fixed - was publishing to "#"
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
    
    // Print free memory
    Serial.print("Free heap: ");
    Serial.println(ESP.getFreeHeap());

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
    
    
    server.on("/aml_logo.svg", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/aml_logo.svg", "image/svg+xml");
    });

    // Đảm bảo rằng bạn có code xử lý route cho map.html
    server.on("/map.html", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/map.html", "text/html");
    });

    // Tương tự, nếu có stylemap.css và scriptmap.js riêng biệt:
    server.on("/stylemap.css", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/stylemap.css", "text/css");
    });

    server.on("/scriptmap.js", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send(SPIFFS, "/scriptmap.js", "application/javascript");
    });

    server.begin();
    Serial.println("HTTP server started");
}

void reconnect_mqtt() {
    // Only attempt connection for 10 seconds to prevent blocking
    unsigned long startAttempt = millis();
    
    while (!mqtt_client.connected() && (millis() - startAttempt < 10000)) {
        Serial.println("Attempting MQTT connection...");
        if (mqtt_client.connect("ESP32Client", mqtt_username, mqtt_password)) {
            Serial.println("Connected to MQTT broker");
            mqtt_client.subscribe(mqtt_topic);
        } else {
            Serial.print("Failed, rc=");
            Serial.print(mqtt_client.state());
            Serial.println(" Retrying in 2 seconds");
            delay(2000);
        }
    }
}

void loop() {
    // Handle MQTT connection
    if (!mqtt_client.connected()) {
        reconnect_mqtt();
    }
    mqtt_client.loop();
    
    // IMPORTANT: Add WebSocket cleanup to maintain connections
    ws.cleanupClients();
    
    // Add a small delay to prevent watchdog timeout
    delay(1);
}