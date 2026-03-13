// Supabase Configuration - TEMPLATE
// The user should fill these values
const SUPABASE_URL = 'https://qyttpvyjqgmkwhrixjff.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iIC7N-bj5ZnoY5mWRaL1WA_4c4luGAB';

let supabaseClient = null;
try {
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized successfully');
    } else {
        console.warn('Supabase URL is placeholder or library not loaded');
    }
} catch (e) {
    console.error('Failed to initialize Supabase:', e);
}

// Elements
const studentIdInput = document.getElementById('student-id');
const recordBtn = document.getElementById('record-btn');
const statusBadge = document.getElementById('status-badge');
const statusMessage = document.getElementById('status-message');
const visualizer = document.getElementById('visualizer');
const canvasCtx = visualizer.getContext('2d');

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let animationId = null;

// Initialize Visualizer
function initVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const width = visualizer.width = visualizer.clientWidth;
        const height = visualizer.height = visualizer.clientHeight;

        canvasCtx.clearRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;

            // Gradient color based on intensity
            const r = 99 + (i * 2);
            const g = 102;
            const b = 241;

            canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dataArray[i] / 255 + 0.2})`;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }
    draw();
}

// Recording Logic
async function startRecording() {
    const studentId = studentIdInput.value.trim();
    if (!studentId) {
        showStatus('受講生番号を入力してください', 'error');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadToSupabase(audioBlob, studentId);

            // Cleanup visualizer
            if (audioContext) audioContext.close();
            cancelAnimationFrame(animationId);
        };

        mediaRecorder.start();
        initVisualizer(stream);

        isRecording = true;
        updateUIState('recording');
        showStatus('', 'hidden');

    } catch (err) {
        console.error('Microphone access denied:', err);
        showStatus('マイクの使用が許可されませんでした。設定を確認してください。', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        updateUIState('uploading');
    }
}

async function uploadToSupabase(blob, studentId) {
    if (!supabaseClient) {
        showStatus('Supabaseが設定されていないか、初期化に失敗しています。', 'error');
        updateUIState('ready');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${studentId}_${timestamp}.webm`;

    try {
        const { data, error } = await supabaseClient.storage
            .from('recordings')
            .upload(fileName, blob);

        if (error) throw error;

        showStatus(`保存完了しました: ${fileName}`, 'success');
        updateUIState('ready');
    } catch (err) {
        console.error('Upload failed:', err);
        showStatus('保存に失敗しました。SupabaseのURL/Key、またはバケット名「recordings」の設定を確認してください。', 'error');
        updateUIState('ready');
    }
}

// UI Helpers
function updateUIState(state) {
    recordBtn.classList.remove('recording');
    statusBadge.className = 'badge';

    if (state === 'recording') {
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.text').textContent = '停止して保存';
        statusBadge.classList.add('recording');
        statusBadge.textContent = 'Recording';
    } else if (state === 'uploading') {
        recordBtn.querySelector('.text').textContent = '保存中...';
        statusBadge.classList.add('uploading');
        statusBadge.textContent = 'Uploading';
    } else {
        recordBtn.querySelector('.text').textContent = 'REC開始';
        statusBadge.classList.add('ready');
        statusBadge.textContent = 'Ready';
    }
}

function showStatus(msg, type) {
    if (type === 'hidden') {
        statusMessage.classList.add('hidden');
        return;
    }
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
}

// Event Listeners
recordBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});
