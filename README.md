## User Manual: ESP32 WebServer MQTT Dashboard
### Developed by AML - Roboconteam

### Localweb tracking parameter from robot using ESP32 - MQTT & WebSocket Protocol

Table of Contents
Introduction
System Requirements
Getting Started
Interface Overview
Working with MQTT Topics
Data Visualization
Controlling Devices
Troubleshooting
Advanced Features
Technical Support
1. Introduction
ESP32 WebServer MQTT Dashboard is a web-based application that allows real-time monitoring and control of robot parameters via MQTT protocol. The system uses ESP32 as a gateway between MQTT broker and web clients, providing a responsive interface for data visualization and device control.

Key Features:

Real-time parameter monitoring via MQTT
Automatic topic discovery
Dynamic data tables and charts
WebSocket communication for low latency
Responsive web interface accessible from any browser
2. System Requirements
Hardware Requirements
ESP32 development board
WiFi network with internet access
Software Requirements
Web browser supporting WebSocket (Chrome, Firefox, Safari, Edge)
MQTT broker (configured at IP 192.168.5.1)
Network Requirements
WiFi SSID: AML_Robocon
MQTT broker at 192.168.5.1:1883
Device must be on the same network as the MQTT broker
3. Getting Started
Connecting to the Dashboard
Power on the ESP32 device
Connect your computer/mobile device to the "AML_Robocon" WiFi network
Open a web browser and navigate to the ESP32's IP address (displayed on serial monitor)
The dashboard will automatically load and attempt to connect to the MQTT broker
Initial Setup
The dashboard will automatically:

Connect to the configured WiFi network
Establish connection to the MQTT broker
Subscribe to all available topics (# wildcard)
Display connection status in the header
4. Interface Overview
The dashboard interface consists of several key sections:

Header Section
Logo: AML logo on the left side
WiFi Information: SSID, IP address, and connection status
Topic Selection: Dropdown to select MQTT topics with Connect/Disconnect buttons
Main Content Area
Sidebar: Navigation menu for different sections
Graph Section: Dynamic charts displaying selected parameters
Data Tables: WatchR1 and WatchR2 tables showing real-time parameter values
Control Panel
Graph Controls: Buttons to start, stop, reset and export graph data
Parameter Selection: Input field to add parameters to charts
5. Working with MQTT Topics
Topic Discovery
When the dashboard starts, it automatically subscribes to all MQTT topics (using the # wildcard) and populates the topic dropdown as messages arrive.

Selecting a Topic
Wait for topics to appear in the "Topic" dropdown
Select the desired topic from the dropdown
Click the "Connect" button to subscribe specifically to that topic
The data tables will clear and begin showing only data from the selected topic
Switching Topics
To change topics, select a new topic from the dropdown
Click "Connect" to switch to the new topic
The data tables will clear and show data from the newly selected topic
Returning to Discovery Mode
Click the "Disconnect" button to unsubscribe from the current topic
The system will return to topic discovery mode (# wildcard)
You'll see all topics again as they arrive
6. Data Visualization
Data Tables
The dashboard features two data tables:

WatchR1: Primary table displaying current parameter values
WatchR2: Secondary table for additional parameters
Data in these tables:

Updates in real-time as new MQTT messages arrive
Shows parameter names and their current values
Numeric values are formatted to two decimal places
Charts
The dashboard provides dynamic charts for visualizing parameter trends:

Adding Parameters to Charts:

Enter the parameter name in the "#Valname" input field
Click "OK" to add the parameter to the chart
The parameter will appear on the chart with a unique color
Chart Controls:

Start: Begin recording and displaying data
Stop: Pause data collection and display
Reset: Clear the chart and start fresh
Export CSV: Download the chart data as a CSV file
Multiple Charts:

Click "ADD NEW GRAPH" to create additional charts
Each chart can track different parameters independently
7. Controlling Devices
The dashboard allows you to send control commands to devices via MQTT:

Commands sent from the web interface are transmitted through WebSocket to ESP32
The ESP32 forwards these commands to the MQTT broker under the topic "Swerve_Robot/command"
Devices subscribed to this topic will receive and execute the commands
Note: Command functionality must be implemented on the receiving devices to respond to these messages.

8. Troubleshooting
Connection Issues
WiFi Connection Problems:

Check that you're connected to the "AML_Robocon" network
Verify the ESP32 is powered and functioning
Check serial output for debugging information
MQTT Connection Failures:

Verify the MQTT broker is running at 192.168.5.1:1883
Check MQTT credentials (username: AML_Robocon, password: aml305b4)
Ensure the broker allows WebSocket connections
Data Visualization Problems
No Data in Tables:

Confirm you're connected to the correct topic
Check that the selected topic is receiving data
Verify the data format is valid JSON
Charts Not Updating:

Make sure you've clicked "Start" on the chart controls
Verify the parameter name matches exactly what's in the MQTT payload
Check browser console for JavaScript errors
9. Advanced Features
Rate Limiting
The system implements rate limiting to prevent overloading:

Maximum 40 MQTT messages per second are processed
Messages exceeding this rate will be dropped
WebSocket Communication
The dashboard uses WebSocket for bi-directional communication:

Provides real-time updates without polling
Maintains persistent connection for low latency
Automatically reconnects if the connection is lost
Data Export
Chart data can be exported to CSV format for further analysis:

Click "Export CSV" button on the chart controls
The file will download with timestamps and parameter values
Import into spreadsheet software for detailed analysis
10. Technical Support
For technical assistance or to report issues:

Developer: Dr. Ngo Minh Tu - AML_RBCTEAM25
Documentation: Refer to the source code comments for detailed implementation notes
Project Repository: Contact the developer for access to the project repository
© Designed by Dr. Ngo Minh Tu - AML_RBCTEAM25