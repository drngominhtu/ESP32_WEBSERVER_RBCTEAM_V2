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

// Add rate limiting variables
unsigned long lastMessageTime = 0;
const unsigned long MESSAGE_INTERVAL = 25; // 100ms between messages
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

    // Debug: In ra topic nhận được
    Serial.print("Received MQTT message on topic: ");
    Serial.println(topic);

    // Lưu topic mới vào danh sách
    String topicStr = String(topic);
    bool isNewTopic = false;
    
    if (knownTopics.find(topicStr) == knownTopics.end()) {
        knownTopics.insert(topicStr);
        isNewTopic = true;
        
        // Debug: In ra khi phát hiện topic mới
        Serial.print("New topic discovered: ");
        Serial.println(topicStr);
        Serial.print("Total topics known: ");
        Serial.println(knownTopics.size());
    }

    // Tạo JSON với name và value
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.print("JSON parsing failed: ");
        Serial.println(error.c_str());
        return;
    }

    // Debug: In ra JSON đã parse
    Serial.print("JSON payload: ");
    serializeJson(doc, Serial);
    Serial.println();

    // Nếu topic hiện tại là "#" hoặc topic này là topic đang được subscribe
    // Hoặc topic này là con của topic đang được subscribe
    if (currentSubscribedTopic == "#" || 
        topicStr == currentSubscribedTopic || 
        topicStr.startsWith(currentSubscribedTopic + "/")) {
        // Forward JSON message không có address
        if (ws.count() > 0) {
            String jsonString;
            serializeJson(doc, jsonString);
            ws.textAll(jsonString);
            
            // Debug: In ra khi gửi dữ liệu qua WebSocket
            Serial.print("Forwarding data to WebSocket. Connected clients: ");
            Serial.println(ws.count());
        }
    }

    // Nếu có topic mới, luôn gửi danh sách cập nhật cho clients, không quan tâm ws.count()
    if (isNewTopic) {
        // In ra thông tin về số lượng client WebSocket
        Serial.print("Current WebSocket clients: ");
        Serial.println(ws.count());
        
        if (ws.count() > 0) {
            // Thêm dấu ngoặc nhọn mở
            {
                StaticJsonDocument<1024> topicDoc;
                topicDoc["type"] = "topic_list";
                JsonArray topicArray = topicDoc.createNestedArray("topics");
                
                // In ra danh sách đầy đủ các topic đã biết
                Serial.println("Known topics:");
                for (const String& t : knownTopics) {
                    topicArray.add(t);
                    Serial.println("  - " + t);
                }
                
                String topicList;
                serializeJson(topicDoc, topicList);
                ws.textAll(topicList);
                
                // Debug: In ra khi gửi danh sách topic mới
                Serial.println("Sending updated topic list to WebSocket clients:");
                Serial.println(topicList);
            } // Thêm dấu ngoặc nhọn đóng
        } else {
            Serial.println("No WebSocket clients connected to send topic list");
        }
    }
}

void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT: {
            // Debug: In ra khi có client kết nối mới
            Serial.print("WebSocket client connected. ID: ");
            Serial.println(client->id());
            Serial.print("Total WebSocket clients: ");
            Serial.println(ws.count());
            
            // Luôn gửi danh sách topic hiện có, ngay cả khi trống
            StaticJsonDocument<1024> topicDoc;
            topicDoc["type"] = "topic_list";
            JsonArray topicArray = topicDoc.createNestedArray("topics");
            
            if (knownTopics.size() > 0) {
                Serial.println("Sending topic list to new client:");
                for (const String& t : knownTopics) {
                    topicArray.add(t);
                    Serial.println("  - " + t);
                }
            } else {
                Serial.println("No topics available, sending empty list to new client");
            }
            
            String topicList;
            serializeJson(topicDoc, topicList);
            client->text(topicList);
            Serial.println("Topic list JSON sent: " + topicList);
            break;
        }
            
        case WS_EVT_DISCONNECT:
            // Debug: In ra khi client ngắt kết nối
            Serial.print("WebSocket client disconnected. ID: ");
            Serial.println(client->id());
            break;
            
        case WS_EVT_DATA:
            if (len > 0) {
                // Debug: In ra dữ liệu nhận được từ client
                Serial.print("Received data from WebSocket client. Length: ");
                Serial.println(len);
                
                char message[len + 1];
                memcpy(message, data, len);
                message[len] = '\0';
                Serial.print("Message: ");
                Serial.println(message);
                
                // Kiểm tra xem đây có phải là lệnh đăng ký topic mới không
                StaticJsonDocument<200> doc;
                DeserializationError error = deserializeJson(doc, message);
                
                if (!error && doc.containsKey("action")) {
                    String action = doc["action"];
                    
                    if (action == "subscribe" && doc.containsKey("topic")) {
                        String newTopic = doc["topic"];
                        // Debug: In ra hành động đăng ký topic mới
                        Serial.print("Subscribing to new topic: ");
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
                        
                        // Debug: In ra phản hồi gửi cho client
                        Serial.print("Sending response: ");
                        Serial.println(jsonResponse);
                    }
                } else {
                    // Đây là lệnh khác, chuyển tiếp tới MQTT như cũ
                    mqtt_client.publish("Swerve_Robot/command", message);
                    Serial.println("Forwarding message to MQTT topic: Swerve_Robot/command");
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
    
    server.on("/R1.html", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/R1.html", "text/html");
    });
    
    server.on("/R2.html", HTTP_GET, [](AsyncWebServerRequest *request){
        request->send(SPIFFS, "/R2.html", "text/html");
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