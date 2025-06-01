/**
 * Script để vẽ bản đồ vị trí robot - Memory Optimized Version
 * Sử dụng TypedArray để tiết kiệm bộ nhớ
 */

// Khai báo biến toàn cục cho map
let mapCanvas, mapCtx;
let canvasWidth, canvasHeight;

// Field dimensions (mm)
const FIELD_WIDTH = 15000;  // 15000mm = 15m
const FIELD_HEIGHT = 8000;  // 8000mm = 8m
const ROBOT_RADIUS = 400;   // 400mm = 0.4m

// Memory-Optimized Path Storage
const PATH_HISTORY_MAX = 5000; // Tăng từ 1000 lên 5000 điểm!

// Sử dụng TypedArray thay vì JavaScript Objects
// Float32Array sử dụng 4 bytes per value (thay vì 8 bytes của Number)
const pathHistoryX = new Float32Array(PATH_HISTORY_MAX);
const pathHistoryY = new Float32Array(PATH_HISTORY_MAX);
const pathTimestamps = new Uint32Array(PATH_HISTORY_MAX); // Timestamps (optional)

// Path management variables
let pathIndex = 0;          // Current write position
let pathCount = 0;          // Number of points stored
let isCircularBuffer = false; // Whether we've filled the buffer once

// Other variables
let scaleX, scaleY;
let offsetX = 0, offsetY = 0;
let zoomLevel = 1;
let robotPosition = { x: 0, y: 0 };
let totalDistance = 0;
let currentSelectedTopic = "";
let isRecording = false;

// Memory usage statistics
function getMemoryUsage() {
    const xArraySize = pathHistoryX.byteLength;
    const yArraySize = pathHistoryY.byteLength;
    const timestampArraySize = pathTimestamps.byteLength;
    const totalBytes = xArraySize + yArraySize + timestampArraySize;
    
    return {
        totalBytes,
        totalKB: (totalBytes / 1024).toFixed(2),
        perPoint: (totalBytes / PATH_HISTORY_MAX).toFixed(1),
        efficiency: `${((52 * PATH_HISTORY_MAX - totalBytes) / (52 * PATH_HISTORY_MAX) * 100).toFixed(1)}% saved`
    };
}

// Enhanced path management functions
function addToPathHistory(x, y) {
    // Store values in TypedArrays
    pathHistoryX[pathIndex] = x;
    pathHistoryY[pathIndex] = y;
    pathTimestamps[pathIndex] = Date.now();
    
    // Update counters
    pathIndex = (pathIndex + 1) % PATH_HISTORY_MAX;
    
    if (pathCount < PATH_HISTORY_MAX) {
        pathCount++;
    } else {
        isCircularBuffer = true;
    }
    
    // Update UI
    updatePathStats();
}

function getPathPoint(index) {
    if (index >= pathCount) return null;
    
    let actualIndex;
    if (!isCircularBuffer) {
        actualIndex = index;
    } else {
        // Calculate actual index in circular buffer
        actualIndex = (pathIndex + index) % PATH_HISTORY_MAX;
    }
    
    return {
        x: pathHistoryX[actualIndex],
        y: pathHistoryY[actualIndex],
        timestamp: pathTimestamps[actualIndex]
    };
}

function getAllPathPoints() {
    const points = [];
    for (let i = 0; i < pathCount; i++) {
        points.push(getPathPoint(i));
    }
    return points;
}

function clearPathHistory() {
    pathIndex = 0;
    pathCount = 0;
    isCircularBuffer = false;
    totalDistance = 0;
    
    // Clear arrays (optional, for memory cleanup)
    pathHistoryX.fill(0);
    pathHistoryY.fill(0);
    pathTimestamps.fill(0);
    
    updatePathStats();
}

function updatePathStats() {
    document.getElementById('path-points').textContent = pathCount;
    document.getElementById('total-distance').textContent = totalDistance.toFixed(0);
    
    // Update memory usage display
    const memUsage = getMemoryUsage();
    const memoryElement = document.getElementById('memory-usage');
    if (memoryElement) {
        memoryElement.textContent = `${memUsage.totalKB} KB (${memUsage.efficiency})`;
    }
}

// Khởi tạo khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    console.log(`Memory-Optimized Path Storage Initialized:`);
    console.log(`- Max Points: ${PATH_HISTORY_MAX}`);
    console.log(`- Memory Usage: ${getMemoryUsage().totalKB} KB`);
    console.log(`- Memory Efficiency: ${getMemoryUsage().efficiency}`);
    
    // Khởi tạo canvas
    initMap();
    
    // Thiết lập sự kiện cho các nút điều khiển
    setupEventListeners();
    
    // Cập nhật IP từ nguồn hiện tại
    document.getElementById('ip-address').textContent = window.location.hostname;
    updateConnectionStatus('Connected');
    
    // Vẽ bản đồ ban đầu
    drawMap();
    
    // Thiết lập sự kiện để đón nhận dữ liệu mới
    setupDataListener();
    
    // Display initial memory stats
    updatePathStats();
});

function setupEventListeners() {
    // Control buttons
    document.getElementById('reset-btn')?.addEventListener('click', resetPath);
    document.getElementById('center-btn')?.addEventListener('click', centerView);
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => changeZoom(1.2));
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => changeZoom(0.8));
    
    // Recording buttons
    document.getElementById('start-record-btn')?.addEventListener('click', startRecording);
    document.getElementById('stop-record-btn')?.addEventListener('click', stopRecording);
    document.getElementById('export-path-btn')?.addEventListener('click', exportPath);
    
    // Topic filtering
    document.getElementById('topic-confirm')?.addEventListener('click', applyTopicFilter);
    document.getElementById('topic-input')?.addEventListener('keyup', function(event) {
        if (event.key === "Enter") {
            applyTopicFilter();
        }
    });
    
    // Memory optimization controls
    document.getElementById('optimize-memory')?.addEventListener('click', optimizeMemory);
    document.getElementById('show-memory-stats')?.addEventListener('click', showMemoryStats);
}

// Enhanced processPositionData with memory-efficient storage
function processPositionData(data) {
    if (!data) {
        console.log("Map: Dữ liệu nhận được là null hoặc undefined");
        return;
    }
    
    // Topic filtering
    if (currentSelectedTopic && data.topic) {
        const normalizedFilter = currentSelectedTopic.toLowerCase();
        const normalizedTopic = data.topic.toLowerCase();
        
        if (!normalizedTopic.includes(normalizedFilter) && !normalizedFilter.includes(normalizedTopic)) {
            return;
        }
    }
    
    // Extract encoder values
    const encoderX = getValueFromJson(data, ['encoder x', 'encoderX', 'EncoderX', 'positionX', 'x', 'X']);
    const encoderY = getValueFromJson(data, ['encoder y', 'encoderY', 'EncoderY', 'positionY', 'y', 'Y']);
    
    if (encoderX !== null && encoderY !== null) {
        const newX = safeParseFloat(encoderX);
        const newY = safeParseFloat(encoderY);
        
        if (!isNaN(newX) && !isNaN(newY) && Math.abs(newX) < 10000000 && Math.abs(newY) < 10000000) {
            robotPosition.x = newX;
            robotPosition.y = newY;
            
            updatePositionDisplay(newX, newY);
            
            // Recording logic with memory-efficient storage
            if (isRecording) {
                if (pathCount > 0) {
                    const lastPoint = getPathPoint(pathCount - 1);
                    const dist = calculateDistance(lastPoint.x, lastPoint.y, newX, newY);
                    
                    if (dist > 10) { // Minimum movement threshold
                        totalDistance += dist;
                        addToPathHistory(newX, newY);
                    }
                } else {
                    addToPathHistory(newX, newY);
                }
            }
            
            drawMap();
        }
    }
}

// Memory-optimized drawing functions
function drawPathHistory(fieldX, fieldY) {
    if (pathCount < 2) return;
    
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    mapCtx.strokeStyle = '#3498DB';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    
    // Start point
    const firstPoint = getPathPoint(0);
    const startX = fieldX + (FIELD_WIDTH - firstPoint.x) * pixelsPerMeterX;
    const startY = fieldY + (FIELD_HEIGHT - firstPoint.y) * pixelsPerMeterY;
    mapCtx.moveTo(startX, startY);
    
    // Draw path using optimized point access
    for (let i = 1; i < pathCount; i++) {
        const point = getPathPoint(i);
        const x = fieldX + (FIELD_WIDTH - point.x) * pixelsPerMeterX;
        const y = fieldY + (FIELD_HEIGHT - point.y) * pixelsPerMeterY;
        mapCtx.lineTo(x, y);
    }
    
    mapCtx.stroke();
    
    // Draw start and end markers for long paths
    if (pathCount > 10) {
        // Start marker
        mapCtx.fillStyle = '#27ae60';
        mapCtx.beginPath();
        mapCtx.arc(startX, startY, 6, 0, Math.PI * 2);
        mapCtx.fill();
        
        // End marker
        const lastPoint = getPathPoint(pathCount - 1);
        const endX = fieldX + (FIELD_WIDTH - lastPoint.x) * pixelsPerMeterX;
        const endY = fieldY + (FIELD_HEIGHT - lastPoint.y) * pixelsPerMeterY;
        mapCtx.fillStyle = '#e74c3c';
        mapCtx.beginPath();
        mapCtx.arc(endX, endY, 6, 0, Math.PI * 2);
        mapCtx.fill();
    }
}

// Enhanced export functions
function exportPathAsJSON() {
    try {
        const memUsage = getMemoryUsage();
        
        const exportData = {
            timestamp: new Date().toISOString(),
            topic: currentSelectedTopic || 'ALL',
            totalDistance: totalDistance,
            unit: 'mm',
            points: pathCount,
            maxCapacity: PATH_HISTORY_MAX,
            memoryUsage: memUsage,
            isCircularBuffer: isCircularBuffer,
            path: getAllPathPoints() // Convert TypedArray to regular array for JSON
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `robot_path_${PATH_HISTORY_MAX}pts_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        console.log('Path exported with memory stats:', memUsage);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export: ' + error.message);
    }
}

// Memory optimization utilities
function optimizeMemory() {
    // Compact the path by removing redundant points
    if (pathCount < 100) return;
    
    const threshold = 5; // mm - remove points closer than this
    const newX = new Float32Array(PATH_HISTORY_MAX);
    const newY = new Float32Array(PATH_HISTORY_MAX);
    const newTimestamps = new Uint32Array(PATH_HISTORY_MAX);
    
    let newCount = 0;
    let lastX = pathHistoryX[0];
    let lastY = pathHistoryY[0];
    
    // Always keep first point
    newX[0] = lastX;
    newY[0] = lastY;
    newTimestamps[0] = pathTimestamps[0];
    newCount = 1;
    
    for (let i = 1; i < pathCount; i++) {
        const point = getPathPoint(i);
        const dist = calculateDistance(lastX, lastY, point.x, point.y);
        
        if (dist >= threshold || i === pathCount - 1) {
            newX[newCount] = point.x;
            newY[newCount] = point.y;
            newTimestamps[newCount] = point.timestamp;
            newCount++;
            lastX = point.x;
            lastY = point.y;
        }
    }
    
    // Replace arrays
    pathHistoryX.set(newX.subarray(0, newCount));
    pathHistoryY.set(newY.subarray(0, newCount));
    pathTimestamps.set(newTimestamps.subarray(0, newCount));
    
    // Update counters
    pathCount = newCount;
    pathIndex = newCount % PATH_HISTORY_MAX;
    isCircularBuffer = false;
    
    updatePathStats();
    drawMap();
    
    console.log(`Memory optimized: Reduced from ${pathCount} to ${newCount} points`);
}

function showMemoryStats() {
    const memUsage = getMemoryUsage();
    const stats = `
Memory Statistics:
- Total Memory: ${memUsage.totalKB} KB
- Per Point: ${memUsage.perPoint} bytes
- Efficiency: ${memUsage.efficiency}
- Points Stored: ${pathCount}/${PATH_HISTORY_MAX}
- Buffer Type: ${isCircularBuffer ? 'Circular' : 'Linear'}

Comparison with Object Storage:
- Object Method: ${(52 * PATH_HISTORY_MAX / 1024).toFixed(2)} KB
- TypedArray Method: ${memUsage.totalKB} KB
- Memory Saved: ${((52 * PATH_HISTORY_MAX - memUsage.totalBytes) / 1024).toFixed(2)} KB
    `;
    
    alert(stats);
}

// Reset with memory cleanup
function resetPath() {
    if (pathCount > 0) {
        const confirmReset = confirm(`Reset ${pathCount} points? This will free ${getMemoryUsage().totalKB} KB of data.`);
        if (!confirmReset) return;
    }
    
    clearPathHistory();
    drawMap();
    
    if (isRecording) {
        stopRecording();
    }
    
    console.log('Path reset - Memory cleared');
}

// Keep all other existing functions unchanged
function initMap() {
    mapCanvas = document.getElementById('position-map');
    if (!mapCanvas) {
        console.error('Canvas not found');
        return;
    }
    
    mapCtx = mapCanvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function setupDataListener() {
    console.log('Map: Setting up data listeners');
    
    window.addEventListener('data-updated', function(event) {
        const data = event.detail;
        processPositionData(data);
    });
    
    window.updateMapData = function(data) {
        processPositionData(data);
    };
    
    setInterval(() => {
        if (window.lastReceivedData) {
            processPositionData(window.lastReceivedData);
        }
    }, 1000);
}

function applyTopicFilter() {
    const topicInput = document.getElementById('topic-input');
    const newTopic = topicInput.value.trim();
    
    currentSelectedTopic = newTopic;
    document.getElementById('current-topic').textContent = currentSelectedTopic || "ALL";
    
    resetPath();
    console.log(`Topic filter applied: ${currentSelectedTopic || "ALL"}`);
}

function safeParseFloat(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    return parseFloat(cleanValue);
}

function getValueFromJson(data, possibleNames) {
    for (const name of possibleNames) {
        if (data[name] !== undefined) return data[name];
    }
    
    if (data.data && typeof data.data === 'object') {
        for (const name of possibleNames) {
            if (data.data[name] !== undefined) return data.data[name];
        }
    }
    
    for (const key in data) {
        if (typeof data[key] === 'object' && data[key] !== null) {
            for (const name of possibleNames) {
                if (data[key][name] !== undefined) return data[key][name];
            }
        }
    }
    
    return null;
}

function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function updatePositionDisplay(x, y) {
    const posXElement = document.getElementById('position-x');
    const posYElement = document.getElementById('position-y');
    
    if (posXElement) posXElement.textContent = Math.round(x);
    if (posYElement) posYElement.textContent = Math.round(y);
}

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

function resizeCanvas() {
    const container = mapCanvas.parentElement;
    canvasWidth = container.clientWidth;
    canvasHeight = container.clientHeight;
    
    mapCanvas.width = canvasWidth;
    mapCanvas.height = canvasHeight;
    
    updateScale();
    drawMap();
}

function updateScale() {
    scaleX = (canvasWidth / FIELD_WIDTH) * zoomLevel;
    scaleY = (canvasHeight / FIELD_HEIGHT) * zoomLevel;
}

function changeZoom(factor) {
    zoomLevel *= factor;
    
    if (zoomLevel < 0.5) zoomLevel = 0.5;
    if (zoomLevel > 5) zoomLevel = 5;
    
    updateScale();
    drawMap();
}

function drawMap() {
    if (!mapCtx) return;
    
    mapCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    mapCtx.save();
    
    mapCtx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
    mapCtx.scale(zoomLevel, zoomLevel);
    mapCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
    
    const fieldPixelWidth = FIELD_WIDTH * (canvasWidth / FIELD_WIDTH);
    const fieldPixelHeight = FIELD_HEIGHT * (canvasHeight / FIELD_HEIGHT);
    const fieldX = (canvasWidth - fieldPixelWidth) / 2;
    const fieldY = (canvasHeight - fieldPixelHeight) / 2;
    
    // Draw field boundary
    mapCtx.strokeStyle = '#333';
    mapCtx.lineWidth = 2;
    mapCtx.strokeRect(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Draw grid
    drawGrid(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
    
    // Draw path history (optimized)
    drawPathHistory(fieldX, fieldY);
    
    // Draw robot position
    drawRobotPosition(fieldX, fieldY);
    
    mapCtx.restore();
    
    // Add coordinate system info
    mapCtx.fillStyle = '#333';
    mapCtx.font = 'italic 10px Arial';
    mapCtx.fillText('*Gốc toạ độ (0,0) ở góc dưới bên phải. Đơn vị: milimet (mm)', fieldX + 5, fieldY + 15);
    
    // Add memory usage info
    const memUsage = getMemoryUsage();
    mapCtx.fillText(`Memory: ${memUsage.totalKB} KB (${pathCount}/${PATH_HISTORY_MAX} points)`, fieldX + 5, fieldY + 30);
}

function drawGrid(fieldX, fieldY, fieldWidth, fieldHeight) {
    const gridSize = 1000;
    const pixelsPerMeterX = fieldWidth / FIELD_WIDTH;
    const pixelsPerMeterY = fieldHeight / FIELD_HEIGHT;
    
    mapCtx.strokeStyle = '#ddd';
    mapCtx.lineWidth = 0.5;
    
    // Vertical grid lines
    for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
        const pixelX = fieldX + x * pixelsPerMeterX;
        mapCtx.beginPath();
        mapCtx.moveTo(pixelX, fieldY);
        mapCtx.lineTo(pixelX, fieldY + fieldHeight);
        mapCtx.stroke();
        
        if (x % 5000 === 0 || x === FIELD_WIDTH) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            mapCtx.fillText(`${(FIELD_WIDTH - x)}mm`, pixelX + 2, fieldY + fieldHeight - 2);
        }
    }
    
    // Horizontal grid lines
    for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
        const pixelY = fieldY + y * pixelsPerMeterY;
        mapCtx.beginPath();
        mapCtx.moveTo(fieldX, pixelY);
        mapCtx.lineTo(fieldX + fieldWidth, pixelY);
        mapCtx.stroke();
        
        if (y % 5000 === 0 || y === FIELD_HEIGHT) {
            mapCtx.fillStyle = '#666';
            mapCtx.font = '10px Arial';
            mapCtx.fillText(`${y}mm`, fieldX + 2, pixelY - 2);
        }
    }
    
    // Center lines
    mapCtx.strokeStyle = '#7b1fa2';
    mapCtx.lineWidth = 1.5;
    
    const centerX = fieldX + (FIELD_WIDTH / 2) * pixelsPerMeterX;
    mapCtx.beginPath();
    mapCtx.moveTo(centerX, fieldY);
    mapCtx.lineTo(centerX, fieldY + fieldHeight);
    mapCtx.stroke();
    
    const centerY = fieldY + (FIELD_HEIGHT / 2) * pixelsPerMeterY;
    mapCtx.beginPath();
    mapCtx.moveTo(fieldX, centerY);
    mapCtx.lineTo(fieldX + fieldWidth, centerY);
    mapCtx.stroke();
}

function drawRobotPosition(fieldX, fieldY) {
    const pixelsPerMeterX = (canvasWidth / FIELD_WIDTH);
    const pixelsPerMeterY = (canvasHeight / FIELD_HEIGHT);
    
    const robotX = fieldX + (FIELD_WIDTH - robotPosition.x) * pixelsPerMeterX;
    const robotY = fieldY + (FIELD_HEIGHT - robotPosition.y) * pixelsPerMeterY;
    const radiusPixels = ROBOT_RADIUS * pixelsPerMeterX;
    
    mapCtx.strokeStyle = '#FF5733';
    mapCtx.beginPath();
    mapCtx.arc(robotX, robotY, radiusPixels, 0, Math.PI * 2);
    mapCtx.stroke();

    mapCtx.strokeStyle = '#FF5733';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(robotX - 5, robotY);
    mapCtx.lineTo(robotX + 5, robotY);
    mapCtx.moveTo(robotX, robotY - 5);
    mapCtx.lineTo(robotX, robotY + 5);
    mapCtx.stroke();
}

function centerView() {
    offsetX = 0;
    offsetY = 0;
    zoomLevel = 1;
    updateScale();
    drawMap();
}

function startRecording() {
    if (!isRecording) {
        isRecording = true;
        
        document.getElementById('start-record-btn').disabled = true;
        document.getElementById('stop-record-btn').disabled = false;
        
        const statusElement = document.querySelector('.recording-status');
        statusElement.classList.remove('inactive');
        statusElement.classList.add('active');
        statusElement.querySelector('.recording-text').textContent = 'Recording';
        
        console.log('Map: Recording started');
    }
}

function stopRecording() {
    if (isRecording) {
        isRecording = false;
        
        document.getElementById('start-record-btn').disabled = false;
        document.getElementById('stop-record-btn').disabled = true;
        
        const statusElement = document.querySelector('.recording-status');
        statusElement.classList.remove('active');
        statusElement.classList.add('inactive');
        statusElement.querySelector('.recording-text').textContent = 'Stopped';
        
        console.log('Map: Recording stopped');
    }
}

function exportImage() {
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = mapCanvas.width * 2;
        tempCanvas.height = mapCanvas.height * 2;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.scale(2, 2);
        tempCtx.translate(canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
        tempCtx.scale(zoomLevel, zoomLevel);
        tempCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
        
        const fieldPixelWidth = FIELD_WIDTH * (canvasWidth / FIELD_WIDTH);
        const fieldPixelHeight = FIELD_HEIGHT * (canvasHeight / FIELD_HEIGHT);
        const fieldX = (canvasWidth - fieldPixelWidth) / 2;
        const fieldY = (canvasHeight - fieldPixelHeight) / 2;
        
        tempCtx.fillStyle = '#f0f0f0';
        tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        tempCtx.strokeStyle = '#333';
        tempCtx.lineWidth = 2;
        tempCtx.strokeRect(fieldX, fieldY, fieldPixelWidth, fieldPixelHeight);
        
        // Draw grid on export canvas
        const pixelsPerMeterX = fieldPixelWidth / FIELD_WIDTH;
        const pixelsPerMeterY = fieldPixelHeight / FIELD_HEIGHT;
        
        tempCtx.strokeStyle = '#ddd';
        tempCtx.lineWidth = 0.5;
        
        const gridSize = 1000;
        
        for (let x = 0; x <= FIELD_WIDTH; x += gridSize) {
            const pixelX = fieldX + x * pixelsPerMeterX;
            tempCtx.beginPath();
            tempCtx.moveTo(pixelX, fieldY);
            tempCtx.lineTo(pixelX, fieldY + fieldPixelHeight);
            tempCtx.stroke();
            
            if (x % 5000 === 0 || x === FIELD_WIDTH) {
                tempCtx.fillStyle = '#666';
                tempCtx.font = '12px Arial';
                tempCtx.fillText(`${FIELD_WIDTH - x}mm`, pixelX + 2, fieldY + fieldPixelHeight - 4);
            }
        }
        
        for (let y = 0; y <= FIELD_HEIGHT; y += gridSize) {
            const pixelY = fieldY + y * pixelsPerMeterY;
            tempCtx.beginPath();
            tempCtx.moveTo(fieldX, pixelY);
            tempCtx.lineTo(fieldX + fieldPixelWidth, pixelY);
            tempCtx.stroke();
            
            if (y % 5000 === 0 || y === FIELD_HEIGHT) {
                tempCtx.fillStyle = '#666';
                tempCtx.font = '12px Arial';
                tempCtx.fillText(`${y}mm`, fieldX + 4, pixelY - 4);
            }
        }
        
        // Draw center lines
        tempCtx.strokeStyle = '#7b1fa2';
        tempCtx.lineWidth = 1.5;
        
        const centerX = fieldX + (FIELD_WIDTH / 2) * pixelsPerMeterX;
        tempCtx.beginPath();
        tempCtx.moveTo(centerX, fieldY);
        tempCtx.lineTo(centerX, fieldY + fieldPixelHeight);
        tempCtx.stroke();
        
        const centerY = fieldY + (FIELD_HEIGHT / 2) * pixelsPerMeterY;
        tempCtx.beginPath();
        tempCtx.moveTo(fieldX, centerY);
        tempCtx.lineTo(fieldX + fieldPixelWidth, centerY);
        tempCtx.stroke();
        
        tempCtx.fillStyle = '#7b1fa2';
        tempCtx.font = 'bold 12px Arial';
        tempCtx.fillText(`Giữa (${FIELD_WIDTH/2}mm)`, centerX + 5, fieldY + 16);
        tempCtx.fillText(`Giữa (${FIELD_HEIGHT/2}mm)`, fieldX + 5, centerY - 8);
        
        // Draw path using memory-efficient method
        if (pathCount >= 2) {
            tempCtx.strokeStyle = '#3498DB';
            tempCtx.lineWidth = 3;
            tempCtx.beginPath();
            
            const firstPoint = getPathPoint(0);
            const startX = fieldX + (FIELD_WIDTH - firstPoint.x) * pixelsPerMeterX;
            const startY = fieldY + (FIELD_HEIGHT - firstPoint.y) * pixelsPerMeterY;
            tempCtx.moveTo(startX, startY);
            
            for (let i = 1; i < pathCount; i++) {
                const point = getPathPoint(i);
                const x = fieldX + (FIELD_WIDTH - point.x) * pixelsPerMeterX;
                const y = fieldY + (FIELD_HEIGHT - point.y) * pixelsPerMeterY;
                tempCtx.lineTo(x, y);
            }
            
            tempCtx.stroke();
            
            // Start and end markers
            tempCtx.fillStyle = '#27ae60';
            tempCtx.beginPath();
            tempCtx.arc(startX, startY, 8, 0, Math.PI * 2);
            tempCtx.fill();
            
            const lastPoint = getPathPoint(pathCount - 1);
            const endX = fieldX + (FIELD_WIDTH - lastPoint.x) * pixelsPerMeterX;
            const endY = fieldY + (FIELD_HEIGHT - lastPoint.y) * pixelsPerMeterY;
            tempCtx.fillStyle = '#e74c3c';
            tempCtx.beginPath();
            tempCtx.arc(endX, endY, 8, 0, Math.PI * 2);
            tempCtx.fill();
            
            tempCtx.fillStyle = '#000';
            tempCtx.font = '12px Arial';
            tempCtx.fillText('Start', startX + 10, startY);
            tempCtx.fillText('End', endX + 10, endY);
        }
        
        // Draw robot position
        const robotX = fieldX + (FIELD_WIDTH - robotPosition.x) * pixelsPerMeterX;
        const robotY = fieldY + (FIELD_HEIGHT - robotPosition.y) * pixelsPerMeterY;
        const radiusPixels = ROBOT_RADIUS * pixelsPerMeterX;
        
        tempCtx.strokeStyle = '#FF5733';
        tempCtx.beginPath();
        tempCtx.arc(robotX, robotY, radiusPixels, 0, Math.PI * 2);
        tempCtx.stroke();
        
        tempCtx.strokeStyle = '#FF5733';
        tempCtx.lineWidth = 3;
        tempCtx.beginPath();
        tempCtx.moveTo(robotX - 8, robotY);
        tempCtx.lineTo(robotX + 8, robotY);
        tempCtx.moveTo(robotX, robotY - 8);
        tempCtx.lineTo(robotX, robotY + 8);
        tempCtx.stroke();
        
        // Add info with memory stats
        const memUsage = getMemoryUsage();
        tempCtx.fillStyle = '#333';
        tempCtx.font = '14px Arial';
        tempCtx.fillText(`Total Distance: ${totalDistance.toFixed(0)}mm`, 10, 20);
        tempCtx.fillText(`Points: ${pathCount}/${PATH_HISTORY_MAX}`, 10, 40);
        tempCtx.fillText(`Memory: ${memUsage.totalKB} KB (${memUsage.efficiency})`, 10, 60);
        tempCtx.fillText(`Topic: ${currentSelectedTopic || 'ALL'}`, 10, 80);
        tempCtx.fillText(`Generated: ${new Date().toLocaleString()}`, 10, 100);
        tempCtx.fillText(`*Gốc toạ độ (0,0) ở góc dưới bên phải`, 10, 120);
        
        // Legend
        const legendY = 150;
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Chú thích:', 10, legendY);
        
        tempCtx.fillStyle = '#3498DB';
        tempCtx.fillRect(10, legendY + 10, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Đường đi', 35, legendY + 18);
        
        tempCtx.fillStyle = '#FF5733';
        tempCtx.fillRect(10, legendY + 30, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Vị trí robot', 35, legendY + 38);
        
        tempCtx.fillStyle = '#27ae60';
        tempCtx.fillRect(10, legendY + 50, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Điểm bắt đầu', 35, legendY + 58);
        
        tempCtx.fillStyle = '#e74c3c';
        tempCtx.fillRect(10, legendY + 70, 20, 10);
        tempCtx.fillStyle = '#333';
        tempCtx.fillText('Điểm kết thúc', 35, legendY + 78);
        
        const imageURL = tempCanvas.toDataURL('image/png');
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = imageURL;
        a.download = `robot_path_${PATH_HISTORY_MAX}pts_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(imageURL);
        }, 100);
        
        console.log('Map: Image exported successfully with memory stats');
    } catch (error) {
        console.error('Map: Error exporting image', error);
        alert('Failed to export image: ' + error.message);
    }
}

function exportPath() {
    if (pathCount === 0) {
        alert('No path data to export.');
        return;
    }
    
    const exportType = confirm(
        'Choose export format:\nOK - Export as Image (PNG)\nCancel - Export as Data (JSON)'
    );
    
    if (exportType) {
        exportImage();
    } else {
        exportPathAsJSON();
    }
}