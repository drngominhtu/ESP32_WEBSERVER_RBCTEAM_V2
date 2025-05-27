/**
 * Script để vẽ bản đồ vị trí robot
 * Sử dụng giá trị encoderX và encoderY từ dữ liệu JSON đã được lấy bởi script.js
 */

// Khai báo biến toàn cục cho map
let mapCanvas, mapCtx;
let canvasWidth, canvasHeight;
const FIELD_WIDTH = 15; // Chiều rộng thực tế 15m
const FIELD_HEIGHT = 8; // Chiều cao thực tế 8m
const ROBOT_RADIUS = 0.3; // Bán kính robot (m)
const PATH_HISTORY_MAX = 1000; // Số điểm tối đa trong lịch sử đường đi
let scaleX, scaleY;
let offsetX = 0, offsetY = 0;
let zoomLevel = 1;

// Vị trí robot và lịch sử đường đi
let robotPosition = { x: 0, y: 0 };
let pathHistory = [];
let totalDistance = 0;

// Thêm biến toàn cục để lưu topic hiện tại
let currentSelectedTopic = ""; // Rỗng nghĩa là nhận tất cả các topic

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo canvas
    initMap();
    
    // Thiết lập sự kiện cho các nút điều khiển
    document.getElementById('reset-btn').addEventListener('click', resetPath);
    document.getElementById('center-btn').addEventListener('click', centerView);
    document.getElementById('zoom-in-btn').addEventListener('click', () => changeZoom(1.2));
    document.getElementById('zoom-out-btn').addEventListener('click', () => changeZoom(0.8));
    
    // Cập nhật IP từ nguồn hiện tại
    document.getElementById('ip-address').textContent = window.location.hostname;
    updateConnectionStatus('Connected');
    
    // Vẽ bản đồ ban đầu
    drawMap();
    
    // Thiết lập sự kiện để đón nhận dữ liệu mới
    setupDataListener();
    
    // Thêm sự kiện cho nút xác nhận topic
    document.getElementById('topic-confirm').addEventListener('click', applyTopicFilter);
    
    // Thêm sự kiện để nhấn Enter trong input cũng kích hoạt tìm kiếm
    document.getElementById('topic-input').addEventListener('keyup', function(event) {
        if (event.key === "Enter") {
            applyTopicFilter();
        }
    });
});

// Khởi tạo canvas bản đồ
function initMap() {
    mapCanvas = document.getElementById('position-map');
    if (!mapCanvas) {
        console.error('Canvas not found');
        return;
    }
    
    mapCtx = mapCanvas.getContext('2d');
    
    // Thiết lập kích thước canvas
    resizeCanvas();
    
    // Theo dõi sự kiện resize
    window.addEventListener('resize', resizeCanvas);
}

// Thiết lập lắng nghe dữ liệu mới
function setupDataListener() {
    console.log('Map: Setting up data listeners');
    
    // Phương thức 1: Đăng ký custom event từ script.js
    window.addEventListener('data-updated', function(event) {
        console.log('Map: Received data-updated event');
        const data = event.detail;
        processPositionData(data);
    });
    
    // Phương thức 2: Định nghĩa hàm cập nhật để script.js gọi trực tiếp
    window.updateMapData = function(data) {
        console.log('Map: updateMapData called with data:', data);
        processPositionData(data);
    };
    
    // Phương thức 3: Kiểm tra dữ liệu mới định kỳ
    setInterval(() => {
        if (window.lastReceivedData) {
            console.log('Map: Checking lastReceivedData:', window.lastReceivedData);
            processPositionData(window.lastReceivedData);
        }
    }, 1000); // Tăng lên 1000ms để giảm số lượng log
}

// Thêm hàm để áp dụng bộ lọc topic
function applyTopicFilter() {
    const topicInput = document.getElementById('topic-input');
    const newTopic = topicInput.value.trim();
    
    // Cập nhật biến global
    currentSelectedTopic = newTopic;
    
    // Cập nhật UI
    document.getElementById('current-topic').textContent = currentSelectedTopic || "ALL";
    
    // Reset đường đi khi thay đổi topic
    resetPath();
    
    console.log(`Topic filter applied: ${currentSelectedTopic || "ALL"}`);
}

// Xử lý dữ liệu vị trí từ JSON
function processPositionData(data) {
    if (!data) {
        console.log("Map: Dữ liệu nhận được là null hoặc undefined");
        return;
    }
    
    console.log("Map: Đã nhận dữ liệu mới:", data);
    
    if (data.topic) {
        console.log("Map: Topic của dữ liệu:", data.topic);
    } else {
        console.log("Map: Dữ liệu không có thông tin topic");
    }
    
    // Kiểm tra xem dữ liệu có đến từ topic đã chọn không
    if (currentSelectedTopic && data.topic) {
        // Chuyển cả hai sang chữ thường để tránh lỗi phân biệt hoa thường
        const normalizedFilter = currentSelectedTopic.toLowerCase();
        const normalizedTopic = data.topic.toLowerCase();
        
        console.log(`Map: Kiểm tra topic - Filter: ${normalizedFilter}, Data: ${normalizedTopic}`);
        
        // Kiểm tra cả hai chiều - topic có chứa filter hoặc filter có chứa topic
        if (!normalizedTopic.includes(normalizedFilter) && !normalizedFilter.includes(normalizedTopic)) {
            console.log(`Map: Topic không phù hợp với filter, bỏ qua dữ liệu`);
            return;
        }
    }
    
    // In ra toàn bộ thuộc tính của object để tìm encoder
    console.log("Map: Tất cả các thuộc tính trong dữ liệu:");
    for (const key in data) {
        console.log(`    ${key}: ${data[key]}`);
    }
    
    // Tìm giá trị encoder với nhiều tên khả dĩ hơn
    const encoderX = getValueFromJson(data, ['encoderX', 'EncoderX', 'positionX', 'PositionX', 'x', 'X', 'encoder_x', 'pos_x', 'px']);
    const encoderY = getValueFromJson(data, ['encoderY', 'EncoderY', 'positionY', 'PositionY', 'y', 'Y', 'encoder_y', 'pos_y', 'py']);
    
    console.log(`Map: Tìm thấy encoderX=${encoderX}, encoderY=${encoderY}`);
    
    if (encoderX !== null && encoderY !== null) {
        // Chuyển đổi an toàn sang số
        const newX = safeParseFloat(encoderX);
        const newY = safeParseFloat(encoderY);
        
        console.log(`Map: Sau khi parse - X=${newX}, Y=${newY}`);
        
        // Chỉ xử lý giá trị hợp lệ và nằm trong giới hạn
        if (!isNaN(newX) && !isNaN(newY) && Math.abs(newX) < 10000 && Math.abs(newY) < 10000) {
            // Tính khoảng cách từ vị trí trước đó
            if (pathHistory.length > 0) {
                const lastPos = pathHistory[pathHistory.length - 1];
                const dist = calculateDistance(lastPos.x, lastPos.y, newX, newY);
                
                // Cập nhật tổng khoảng cách chỉ khi vị trí thực sự thay đổi
                if (dist > 0.01) { // Bỏ qua thay đổi nhỏ để tránh tích lũy nhiễu
                    totalDistance += dist;
                    document.getElementById('total-distance').textContent = totalDistance.toFixed(2);
                    
                    // Cập nhật vị trí và thêm vào lịch sử
                    robotPosition.x = newX;
                    robotPosition.y = newY;
                    addToPathHistory(newX, newY);
                    
                    // Cập nhật hiển thị vị trí
                    updatePositionDisplay(newX, newY);
                    
                    // Vẽ lại bản đồ
                    drawMap();
                }
            } else {
                // Điểm đầu tiên
                robotPosition.x = newX;
                robotPosition.y = newY;
                addToPathHistory(newX, newY);
                updatePositionDisplay(newX, newY);
                drawMap();
            }
        } else {
            console.log(`Map: Giá trị không hợp lệ hoặc vượt quá giới hạn - X=${newX}, Y=${newY}`);
        }
    } else {
        console.log("Map: Không tìm thấy giá trị encoderX hoặc encoderY trong dữ liệu");
    }
}

function safeParseFloat(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    
    // Loại bỏ các ký tự không phải số, dấu thập phân, dấu âm
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    return parseFloat(cleanValue);
}

// Mở rộng hàm getValueFromJson để tìm kiếm sâu hơn
function getValueFromJson(data, possibleNames) {
    // Kiểm tra cấp cao nhất
    for (const name of possibleNames) {
        if (data[name] !== undefined) {
            console.log(`Map: Tìm thấy ${name} ở cấp cao nhất:`, data[name]);
            return data[name];
        }
    }
    
    // Kiểm tra trong data.data (cấu trúc phổ biến)
    if (data.data && typeof data.data === 'object') {
        for (const name of possibleNames) {
            if (data.data[name] !== undefined) {
                console.log(`Map: Tìm thấy ${name} trong data.data:`, data.data[name]);
                return data.data[name];
            }
        }
    }
    
    // Kiểm tra trong các trường con cấp 1
    for (const key in data) {
        if (typeof data[key] === 'object' && data[key] !== null) {
            for (const name of possibleNames) {
                if (data[key][name] !== undefined) {
                    console.log(`Map: Tìm thấy ${name} trong ${key}:`, data[key][name]);
                    return data[key][name];
                }
            }
        }
    }
    
    console.log("Map: Không tìm thấy các trường sau trong dữ liệu:", possibleNames);
    return null;
}

// Tính khoảng cách giữa hai điểm
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Thêm vị trí vào lịch sử đường đi
function addToPathHistory(x, y) {
    pathHistory.push({ x, y });
    
    // Giới hạn số lượng điểm trong lịch sử
    if (pathHistory.length > PATH_HISTORY_MAX) {
        pathHistory.shift(); // Loại bỏ điểm cũ nhất
    }
    
    // Cập nhật số điểm
    document.getElementById('path-points').textContent = pathHistory.length;
}

// Cập nhật hiển thị vị trí
function updatePositionDisplay(x, y) {
    document.getElementById('position-x').textContent = x.toFixed(2);
    document.getElementById('position-y').textContent = y.toFixed(2);
}

// Cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('wifi-status');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = 'status';
        
        if (status === 'Connected') {
            statusElement.classList.add('connected');
        } else if (status === 'Disconnected' || status === 'Error') {
            statusElement.classList.add('disconnected');
        } else {
            statusElement.classList.add('connecting');
        }
    }
}

// Thay đổi kích thước canvas
function resizeCanvas() {
    const container = mapCanvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    
    mapCanvas.width = canvasWidth;
    mapCanvas.height = canvasHeight;
    
    // Tính tỷ lệ dựa trên kích thước và zoom
    updateScale();
    
    // Vẽ lại bản đồ
    drawMap();
}

// Cập nhật tỷ lệ khi thay đổi kích thước hoặc zoom
function updateScale() {
    scaleX = (canvasWidth / FIELD_WIDTH) * zoomLevel;
    scaleY = (canvasHeight / FIELD_HEIGHT) * zoomLevel;
}

// Thay đổi mức độ zoom
function changeZoom(factor) {
    zoomLevel *= factor;
    
    // Giới hạn zoom
    if (zoomLevel < 0.5) zoomLevel = 0.5;
    if (zoomLevel > 5) zoomLevel = 5;
    
    // Cập nhật tỷ lệ
    updateScale();
    
    // Vẽ lại bản đồ
    drawMap();
}

// Vẽ bản đồ
function drawMap() {
    if (!mapCtx) return;
    
    // Xóa canvas
    mapCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Lưu trạng thái
    mapCtx.save();
    
    // Áp dụng transform để zoom và pan
    mapCtx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
    mapCtx.scale(zoomLevel, zoomLevel);
    mapCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
    
    // Vẽ khung sân
    mapCtx.strokeStyle = '#333';
    mapCtx.lineWidth = 2;
    
    // Tính toán kích thước và vị trí của hình chữ nhật
    const fieldPixelWidth = FIELD_WIDTH * (canvasWidth / FIELD_WIDTH);
    const fieldPixelHeight = FIELD_HEIGHT * (canvasHeight / FIELD_HEIGHT);
    const fieldX = (canvasWidth - fieldPixelWidth) / 2;
    const fieldY = (canvasHeight - fieldPixelHeight) / 2;
    
    mapCtx.strokeRect(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Vẽ lưới
    drawGrid(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Vẽ lịch sử đường đi
    drawPathHistory(fieldX, fieldY);
    
    // Vẽ vị trí robot
    drawRobotPosition(fieldX, fieldY);
    
    // Khôi phục trạng thái
    mapCtx.restore();
}

// Vẽ lưới
function drawGrid(fieldX, fieldY, fieldWidth, fieldHeight) {
    const gridSize = 1; // 1 mét
    const pixelsPerMeterX = fieldWidth / FIELD_WIDTH;
    const pixelsPerMeterY = fieldHeight / FIELD_HEIGHT;
    
    mapCtx.strokeStyle = '#ddd';
    mapCtx.lineWidth = 0.5;
    
    // Vẽ lưới dọc
    for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
        const pixelX = fieldX + x * pixelsPerMeterX;
        
        mapCtx.beginPath();
        mapCtx.moveTo(pixelX, fieldY);
        mapCtx.lineTo(pixelX, fieldY + fieldHeight);
        mapCtx.stroke();
        
        // Vẽ nhãn trục X
        if (x % 5 === 0 || x === FIELD_WIDTH) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            mapCtx.fillText(`${x}m`, pixelX + 2, fieldY + fieldHeight - 2);
        }
    }
    
    // Vẽ lưới ngang
    for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
        const pixelY = fieldY + y * pixelsPerMeterY;
        
        mapCtx.beginPath();
        mapCtx.moveTo(fieldX, pixelY);
        mapCtx.lineTo(fieldX + fieldWidth, pixelY);
        mapCtx.stroke();
        
        // Vẽ nhãn trục Y
        if (y % 5 === 0 || y === FIELD_HEIGHT) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            mapCtx.fillText(`${y}m`, fieldX + 2, pixelY - 2);
        }
    }
}

// Vẽ lịch sử đường đi
function drawPathHistory(fieldX, fieldY) {
    if (pathHistory.length < 2) return;
    
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    mapCtx.strokeStyle = '#3498DB';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    
    // Điểm đầu tiên
    const startX = fieldX + pathHistory[0].x * pixelsPerMeterX;
    const startY = fieldY + (FIELD_HEIGHT - pathHistory[0].y) * pixelsPerMeterY;
    mapCtx.moveTo(startX, startY);
    
    // Vẽ đường nối các điểm
    for (let i = 1; i < pathHistory.length; i++) {
        const x = fieldX + pathHistory[i].x * pixelsPerMeterX;
        const y = fieldY + (FIELD_HEIGHT - pathHistory[i].y) * pixelsPerMeterY;
        mapCtx.lineTo(x, y);
    }
    
    mapCtx.stroke();
}

// Vẽ vị trí robot
function drawRobotPosition(fieldX, fieldY) {
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    const robotX = fieldX + robotPosition.x * pixelsPerMeterX;
    const robotY = fieldY + (FIELD_HEIGHT - robotPosition.y) * pixelsPerMeterY;
    const radiusPixels = ROBOT_RADIUS * pixelsPerMeterX;
    
    // Vẽ hình tròn đại diện cho robot
    mapCtx.fillStyle = '#FF5733';
    mapCtx.beginPath();
    mapCtx.arc(robotX, robotY, radiusPixels, 0, Math.PI * 2);
    mapCtx.fill();
    
    // Vẽ dấu cộng tại tâm
    mapCtx.strokeStyle = '#fff';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(robotX - 5, robotY);
    mapCtx.lineTo(robotX + 5, robotY);
    mapCtx.moveTo(robotX, robotY - 5);
    mapCtx.lineTo(robotX, robotY + 5);
    mapCtx.stroke();
}

// Xóa lịch sử đường đi
function resetPath() {
    pathHistory = [];
    totalDistance = 0;
    document.getElementById('path-points').textContent = '0';
    document.getElementById('total-distance').textContent = '0.00';
    drawMap();
}

// Căn giữa khung nhìn
function centerView() {
    offsetX = 0;
    offsetY = 0;
    zoomLevel = 1;
    updateScale();
    drawMap();
}