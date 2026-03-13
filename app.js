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
const phraseText = document.getElementById('phrase-text');
const phraseCounter = document.getElementById('phrase-counter');
const previewSection = document.getElementById('preview-section');
const audioPlayer = document.getElementById('audio-player');
const retryBtn = document.getElementById('retry-btn');
const uploadBtn = document.getElementById('upload-btn');
const taskSection = document.getElementById('task-section');

// State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioContext = null;
let analyser = null;
let animationId = null;
let latestBlob = null;
let latestAudioURL = null;

const PHRASES = [
    "Where do you live in Los Angeles?",
    "I heard her first word yesterday.",
    "Please tell me how to get there.",
    "Let’s go downtown after the party.",
    "Can you help me find my car?"
];
let currentPhraseIndex = 0;

// Initialize UI
function initUI() {
    updatePhraseDisplay();
}

function updatePhraseDisplay() {
    phraseText.textContent = PHRASES[currentPhraseIndex];
    phraseCounter.textContent = `${currentPhraseIndex + 1} / ${PHRASES.length}`;
}

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
            latestBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Create local URL for preview
            if (latestAudioURL) URL.revokeObjectURL(latestAudioURL);
            latestAudioURL = URL.createObjectURL(latestBlob);
            audioPlayer.src = latestAudioURL;

            // Cleanup visualizer
            if (audioContext) audioContext.close();
            cancelAnimationFrame(animationId);
            
            updateUIState('review');
        };

        mediaRecorder.start();
        initVisualizer(stream);

        isRecording = true;
        currentPhraseIndex = 0;
        updatePhraseDisplay();
        updateUIState('recording');
        showStatus('', 'hidden');

    } catch (err) {
        console.error('Microphone access denied:', err);
        showStatus('マイクの使用が許可されませんでした。設定を確認してください。', 'error');
    }
}

function nextPhrase() {
    if (currentPhraseIndex < PHRASES.length - 1) {
        currentPhraseIndex++;
        updatePhraseDisplay();
        updateUIState('recording');
    } else {
        stopRecording();
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
    }
}

async function handleUpload() {
    const studentId = studentIdInput.value.trim();
    if (!latestBlob || !studentId) return;
    
    updateUIState('uploading');
    await uploadToSupabase(latestBlob, studentId);
    
    // Reset to beginning after success
    currentPhraseIndex = 0;
    updatePhraseDisplay();
}

function handleRetry() {
    // Stop audio playback if running
    audioPlayer.pause();
    audioPlayer.currentTime = 0;

    // Reset state and return to ready
    currentPhraseIndex = 0;
    updatePhraseDisplay();
    updateUIState('ready');
    showStatus('', 'hidden');
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
        const errorMsg = err.message || '不明なエラー';
        showStatus(`保存に失敗しました (${errorMsg})。SupabaseのURL/Key、またはバケット名「recordings」の設定を確認してください。`, 'error');
        updateUIState('ready');
    }
}

// UI Helpers
function updateUIState(state) {
    recordBtn.classList.remove('recording', 'next', 'final');
    statusBadge.className = 'badge';
    previewSection.classList.add('hidden');
    taskSection.classList.add('hidden');
    studentIdInput.disabled = false;
    
    if (state === 'recording') {
        recordBtn.style.display = 'flex';
        recordBtn.classList.add('recording');
        taskSection.classList.remove('hidden');
        studentIdInput.disabled = true;
        
        if (currentPhraseIndex < PHRASES.length - 1) {
            recordBtn.querySelector('.text').textContent = '次のフレーズへ';
            recordBtn.classList.add('next');
        } else {
            recordBtn.querySelector('.text').textContent = '全フレーズ終了（確認へ）';
            recordBtn.classList.add('final');
        }
        
        statusBadge.classList.add('recording');
        statusBadge.textContent = 'Recording';
    } else if (state === 'review') {
        recordBtn.style.display = 'none';
        previewSection.classList.remove('hidden');
        studentIdInput.disabled = true;
        statusBadge.classList.add('ready');
        statusBadge.textContent = 'Review';
    } else if (state === 'uploading') {
        recordBtn.style.display = 'flex';
        recordBtn.disabled = true;
        recordBtn.querySelector('.text').textContent = '保存中...';
        statusBadge.classList.add('uploading');
        statusBadge.textContent = 'Uploading';
    } else {
        recordBtn.style.display = 'flex';
        recordBtn.disabled = false;
        recordBtn.querySelector('.text').textContent = 'REC開始';
        statusBadge.classList.add('ready');
        statusBadge.textContent = 'Ready';
        
        if (latestAudioURL) {
            URL.revokeObjectURL(latestAudioURL);
            latestAudioURL = null;
        }
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
        nextPhrase();
    } else {
        startRecording();
    }
});

retryBtn.addEventListener('click', handleRetry);
uploadBtn.addEventListener('click', handleUpload);

// Start
initUI();
