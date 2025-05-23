/**
 * Script để vẽ bản đồ vị trí robot
 * Theo dõi vị trí encoder của R1 và R2
 */

// Khai báo biến toàn cục
let websocket;
let ctx;
let canvas;
let canvasWidth;
let canvasHeight;
const FIELD_WIDTH = 15; // Chiều rộng thực tế 15m
const FIELD_HEIGHT = 8; // Chiều cao thực tế 8m
const ROBOT_DIAMETER = 0.8; // Đường kính robot 0.8m
let scaleX, scaleY;

// Vị trí robot
const robotPositions = {
    R1: { x: 0, y: 0, color: '#FF5733', updated: false },
    R2: { x: 0, y: 0, color: '#3498DB', updated: false }
};

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    console.log('Map page loaded, initializing...');
    
    // Lấy canvas và context
    canvas = document.getElementById('position-map');
    if (!canvas) {
        console.error('Canvas not found');
        return;
    }
    
    ctx = canvas.getContext('2d');
    
    // Thiết lập kích thước canvas
    resizeCanvas();
    
    // Theo dõi sự kiện resize
    window.addEventListener('resize', resizeCanvas);
    
    // Khởi tạo WebSocket
    initWebSocket();
    
    // Vẽ bản đồ ban đầu
    drawMap();
    
    // Cập nhật bản đồ liên tục
    setInterval(updateMap, 50);
});

// Thay đổi kích thước canvas khi cửa sổ thay đổi
function resizeCanvas() {
    const container = canvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    
    // Cập nhật kích thước canvas
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Tính toán tỷ lệ scale
    scaleX = canvasWidth / FIELD_WIDTH;
    scaleY = canvasHeight / FIELD_HEIGHT;
    
    // Vẽ lại bản đồ
    drawMap();
}

// Khởi tạo WebSocket
function initWebSocket() {
    console.log('Initializing WebSocket connection...');
    
    try {
        // Sử dụng hostname hiện tại hoặc mặc định
        const host = window.location.hostname || '192.168.5.1';
        websocket = new WebSocket(`ws://${host}/ws`);
        
        websocket.onopen = onOpen;
        websocket.onclose = onClose;
        websocket.onmessage = onMessage;
        websocket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            updateConnectionStatus('Error');
        };
        
        updateConnectionStatus('Connecting...');
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus('Error');
    }
}

// Khi kết nối WebSocket thành công
function onOpen(event) {
    console.log('WebSocket Connected!');
    updateConnectionStatus('Connected');
    
    // Tự động đăng ký với topic toàn cục
    subscribeToTopic();
}

// Đăng ký topic
function subscribeToTopic() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        const subscribeCommand = {
            action: 'subscribe',
            topic: '#'
        };
        
        websocket.send(JSON.stringify(subscribeCommand));
        console.log('Subscribing to all topics (#)');
        
        // Hiển thị trạng thái đăng ký
        const topicElement = document.getElementById('fixed-topic');
        if (topicElement) {
            topicElement.style.color = '#4CAF50';
        }
    }
}

// Khi mất kết nối WebSocket
function onClose(event) {
    console.log('WebSocket Disconnected!');
    updateConnectionStatus('Disconnected');
    
    // Thử kết nối lại sau 3 giây
    setTimeout(initWebSocket, 3000);
}

// Cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    // Cập nhật phần tử wifi-status
    const wifiStatus = document.getElementById('wifi-status');
    if (wifiStatus) {
        wifiStatus.textContent = status;
        wifiStatus.className = 'status ' + status.toLowerCase().replace(' ', '-');
    }
    
    // Cập nhật IP address nếu đã kết nối
    if (status === 'Connected') {
        const ipAddress = document.getElementById('ip-address');
        if (ipAddress) {
            ipAddress.textContent = window.location.hostname || '192.168.5.1';
        }
    }
}

// Khi nhận được tin nhắn WebSocket
function onMessage(event) {
    try {
        const data = JSON.parse(event.data);
        
        // Kiểm tra loại tin nhắn
        if (data.type === 'subscribe_response') {
            console.log(`Subscribed to topic ${data.topic}: ${data.success ? 'success' : 'failed'}`);
            return;
        }
        
        // Xử lý dữ liệu nhận được
        processPositionData(data);
        
    } catch (error) {
        console.error('Error processing WebSocket message:', error);
    }
}

// Xử lý dữ liệu vị trí
function processPositionData(data) {
    // Phát hiện và xử lý dữ liệu vị trí từ R1
    if (data.topic === 'R1/data' || data.topic === 'R1/data/encoder') {
        if (typeof data.encoderX !== 'undefined' && typeof data.encoderY !== 'undefined') {
            robotPositions.R1.x = parseFloat(data.encoderX);
            robotPositions.R1.y = parseFloat(data.encoderY);
            robotPositions.R1.updated = true;
            
            // Cập nhật hiển thị vị trí R1
            updatePositionDisplay('r1-position', robotPositions.R1.x, robotPositions.R1.y);
        }
    }
    
    // Phát hiện và xử lý dữ liệu vị trí từ R2
    if (data.topic === 'R2/data' || data.topic === 'R2/data/encoder') {
        if (typeof data.encoderX !== 'undefined' && typeof data.encoderY !== 'undefined') {
            robotPositions.R2.x = parseFloat(data.encoderX);
            robotPositions.R2.y = parseFloat(data.encoderY);
            robotPositions.R2.updated = true;
            
            // Cập nhật hiển thị vị trí R2
            updatePositionDisplay('r2-position', robotPositions.R2.x, robotPositions.R2.y);
        }
    }
    
    // Còn một trường hợp khác - kiểm tra nếu dữ liệu đến từ topic bất kỳ với cấu trúc đúng
    if (typeof data.topic === 'string') {
        // Kiểm tra R1/data/encoderX hoặc R1/data/encoderY
        if (data.topic.startsWith('R1/data/encoder')) {
            if (data.topic === 'R1/data/encoderX' && typeof data.value !== 'undefined') {
                robotPositions.R1.x = parseFloat(data.value);
                robotPositions.R1.updated = true;
            } else if (data.topic === 'R1/data/encoderY' && typeof data.value !== 'undefined') {
                robotPositions.R1.y = parseFloat(data.value);
                robotPositions.R1.updated = true;
            }
            
            // Cập nhật hiển thị vị trí R1 nếu có cả X và Y
            updatePositionDisplay('r1-position', robotPositions.R1.x, robotPositions.R1.y);
        }
        
        // Kiểm tra R2/data/encoderX hoặc R2/data/encoderY
        if (data.topic.startsWith('R2/data/encoder')) {
            if (data.topic === 'R2/data/encoderX' && typeof data.value !== 'undefined') {
                robotPositions.R2.x = parseFloat(data.value);
                robotPositions.R2.updated = true;
            } else if (data.topic === 'R2/data/encoderY' && typeof data.value !== 'undefined') {
                robotPositions.R2.y = parseFloat(data.value);
                robotPositions.R2.updated = true;
            }
            
            // Cập nhật hiển thị vị trí R2 nếu có cả X và Y
            updatePositionDisplay('r2-position', robotPositions.R2.x, robotPositions.R2.y);
        }
    }
}

// Cập nhật hiển thị vị trí
function updatePositionDisplay(elementId, x, y) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = `X: ${x.toFixed(2)}m, Y: ${y.toFixed(2)}m`;
    }
}

// Vẽ bản đồ
function drawMap() {
    if (!ctx) return;
    
    // Xóa canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Vẽ biên sân
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
    
    // Vẽ lưới
    const gridSizeM = 1; // Kích thước ô lưới (1m)
    const gridSizeX = gridSizeM * scaleX;
    const gridSizeY = gridSizeM * scaleY;
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    
    // Vẽ lưới dọc
    for (let x = gridSizeX; x < canvasWidth; x += gridSizeX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }
    
    // Vẽ lưới ngang
    for (let y = gridSizeY; y < canvasHeight; y += gridSizeY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
    
    // Vẽ trục tọa độ
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    
    // Trục X
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.stroke();
    
    // Trục Y
    ctx.beginPath();
    ctx.moveTo(canvasWidth / 2, 0);
    ctx.lineTo(canvasWidth / 2, canvasHeight);
    ctx.stroke();
    
    // Vẽ vạch chia
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // Vạch chia trục X
    for (let x = 0; x <= FIELD_WIDTH; x++) {
        const posX = x * scaleX;
        
        // Vạch chia lớn
        ctx.beginPath();
        ctx.moveTo(posX, canvasHeight / 2 - 5);
        ctx.lineTo(posX, canvasHeight / 2 + 5);
        ctx.stroke();
        
        // Nhãn
        if (x % 2 === 0) {
            const value = x - FIELD_WIDTH / 2;
            ctx.fillText(`${value}m`, posX, canvasHeight / 2 + 20);
        }
    }
    
    // Vạch chia trục Y
    for (let y = 0; y <= FIELD_HEIGHT; y++) {
        const posY = y * scaleY;
        
        // Vạch chia lớn
        ctx.beginPath();
        ctx.moveTo(canvasWidth / 2 - 5, posY);
        ctx.lineTo(canvasWidth / 2 + 5, posY);
        ctx.stroke();
        
        // Nhãn
        if (y % 2 === 0) {
            const value = FIELD_HEIGHT / 2 - y;
            ctx.fillText(`${value}m`, canvasWidth / 2 - 20, posY + 4);
        }
    }
}

// Cập nhật vị trí robot trên bản đồ
function updateMap() {
    if (!ctx) return;
    
    // Vẽ lại bản đồ nền
    drawMap();
    
    // Tính toán vị trí thực tế trên canvas
    // Điểm gốc (0,0) là trung tâm của bản đồ
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    // Vẽ vị trí R1 nếu đã cập nhật
    if (robotPositions.R1.updated) {
        const x = centerX + robotPositions.R1.x * scaleX;
        const y = centerY - robotPositions.R1.y * scaleY; // Đảo chiều trục Y
        
        // Vẽ vòng tròn của robot
        ctx.beginPath();
        ctx.arc(x, y, ROBOT_DIAMETER * scaleX / 2, 0, Math.PI * 2);
        ctx.fillStyle = robotPositions.R1.color + '40'; // Màu có alpha
        ctx.fill();
        ctx.strokeStyle = robotPositions.R1.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Vẽ điểm trung tâm
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = robotPositions.R1.color;
        ctx.fill();
        
        // Thêm nhãn
        ctx.font = '12px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText('R1', x + 10, y - 10);
    }
    
    // Vẽ vị trí R2 nếu đã cập nhật
    if (robotPositions.R2.updated) {
        const x = centerX + robotPositions.R2.x * scaleX;
        const y = centerY - robotPositions.R2.y * scaleY; // Đảo chiều trục Y
        
        // Vẽ vòng tròn của robot
        ctx.beginPath();
        ctx.arc(x, y, ROBOT_DIAMETER * scaleX / 2, 0, Math.PI * 2);
        ctx.fillStyle = robotPositions.R2.color + '40'; // Màu có alpha
        ctx.fill();
        ctx.strokeStyle = robotPositions.R2.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Vẽ điểm trung tâm
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = robotPositions.R2.color;
        ctx.fill();
        
        // Thêm nhãn
        ctx.font = '12px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText('R2', x + 10, y - 10);
    }
}

// Mô phỏng dữ liệu vị trí (chỉ để test)
function startSimulation() {
    let t = 0;
    
    setInterval(() => {
        t += 0.01;
        
        // Tính toán vị trí mô phỏng cho R1
        robotPositions.R1.x = 5 * Math.cos(t);
        robotPositions.R1.y = 3 * Math.sin(t);
        robotPositions.R1.updated = true;
        
        // Tính toán vị trí mô phỏng cho R2
        robotPositions.R2.x = 4 * Math.cos(t + Math.PI);
        robotPositions.R2.y = 2 * Math.sin(t + Math.PI);
        robotPositions.R2.updated = true;
        
        // Cập nhật hiển thị vị trí
        updatePositionDisplay('r1-position', robotPositions.R1.x, robotPositions.R1.y);
        updatePositionDisplay('r2-position', robotPositions.R2.x, robotPositions.R2.y);
        
    }, 50);
}