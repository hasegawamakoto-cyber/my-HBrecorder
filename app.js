// Supabase Configuration - TEMPLATE
// The user should fill these values
const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
const GAS_WEBAPP_URL = '__GAS_WEBAPP_URL__';
const TROUBLES_GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzfmj_owugpcoGZXKe_lto5c1ruE1RTlxNXSrsRsX7aJkW69bSkMVTXeV0-HsRHg0dr/exec';

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
const studentNameInput = document.getElementById('student-name');
const studentLevelInput = document.getElementById('student-level');
const studentTroubleInput1 = document.getElementById('student-trouble-1');
const studentTroubleInput2 = document.getElementById('student-trouble-2');
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
let troublesData = {}; // Fetched from GAS

const PHRASES = [
    "Sean and Doug saw women in Los Angeles yesterday.",
    "My father and mother won't be at the party tonight.",
    "Can Joe vote for Arthur in the video game?",
    "The men heard her first word on the phone.",
    "Shelly and Sean work downtown and live in Santa Ana."
];
let currentPhraseIndex = 0;

// Fetch Troubles Data
async function fetchTroublesData() {
    if (TROUBLES_GAS_WEBAPP_URL === '__TROUBLES_GAS_WEBAPP_URL__') {
        // Fallback dummy data based on user's image for testing before GAS is setup
        troublesData = {
            "1A": ["・Eロケーションがやりにくい", "・BTの上げ下げが難しい", "・Cロケーションが下の歯から離れてしまう", "・舌が思うように動かない", "・口があかない", "★選ばれなかった場合"],
            "1B": ["・シュワの音が安定しない", "・ショートIが安定しない", "・二重母音のリズムを、2:1にしているつもりができていない", "・舌のゼロロケーションの時に、舌が浮いてしまう", "・カタカナ感が抜けない", "★選ばれなかった場合"],
            "2": ["・バイブレーションが必要な音が苦手", "・/s/とpucker/ロングs/の違いを出すのが苦手", "・短音では出せるが、単語の中の子音の音が不安定になる"]
        };
        return;
    }

    try {
        const response = await fetch(TROUBLES_GAS_WEBAPP_URL);
        troublesData = await response.json();
    } catch (err) {
        console.error('Failed to fetch troubles data:', err);
        showStatus('悩みのデータの取得に失敗しました', 'error');
    }
}

// Initialize UI
function initUI() {
    fetchTroublesData();
    updatePhraseDisplay();
    updateUIState('ready');
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
    const studentName = studentNameInput.value.trim();
    const studentLevel = studentLevelInput.value;
    const studentTrouble1 = studentTroubleInput1.value;
    const studentTrouble2 = studentTroubleInput2.value;

    // Validation: L + 10 digits
    const studentIdPattern = /^L\d{10}$/;

    if (!studentId || !studentName || !studentLevel || !studentTrouble1) {
        showStatus('受講生番号、氏名、テストレベル、悩み(1つ目)をすべて入力してください', 'error');
        return;
    }

    // Validation: ASCII characters only for name
    const asciiPattern = /^[a-zA-Z0-9\s_\-]+$/;
    if (!asciiPattern.test(studentName)) {
        showStatus('氏名は半角ローマ字（英数字とスペース）で入力してください', 'error');
        return;
    }

    if (!studentIdPattern.test(studentId)) {
        showStatus('受講生番号の形式が正しくありません (例: L1234567890)', 'error');
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
            const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });

            try {
                showStatus('音声データをWAVに変換中...', 'success');
                const arrayBuffer = await webmBlob.arrayBuffer();
                const offlineCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
                latestBlob = audioBufferToWav(audioBuffer);
            } catch (err) {
                console.error('WAV conversion error:', err);
                latestBlob = webmBlob; // 変換失敗時はそのままWebMを使う
            }

            // Create local URL for preview
            if (latestAudioURL) URL.revokeObjectURL(latestAudioURL);
            latestAudioURL = URL.createObjectURL(latestBlob);
            audioPlayer.src = latestAudioURL;

            // Cleanup visualizer
            if (audioContext) audioContext.close();
            cancelAnimationFrame(animationId);

            updateUIState('review');
            showStatus('', 'hidden');
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
    const studentName = studentNameInput.value.trim();
    const studentLevel = studentLevelInput.value;
    const studentTrouble1 = studentTroubleInput1.value;
    const studentTrouble2 = studentTroubleInput2.value;

    if (!latestBlob || !studentId || !studentName || !studentLevel || !studentTrouble1) return;

    updateUIState('uploading');
    await uploadToSupabase(latestBlob, studentId, studentName, studentLevel, studentTrouble1, studentTrouble2);

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

function getFormattedTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

async function uploadToSupabase(blob, studentId, studentName, studentLevel, studentTrouble1, studentTrouble2) {
    if (!supabaseClient) {
        showStatus('Supabaseが設定されていないか、初期化に失敗しています。', 'error');
        updateUIState('ready');
        return;
    }

    const timestamp = getFormattedTimestamp();

    // Sanitize for Supabase Storage key: Replace problematic characters
    // Especially dot (.) inside the name or level can cause "Invalid key" issues
    const safeStudentId = studentId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeStudentName = studentName.replace(/[./\\:*?"<>| ]/g, '_');
    const safeStudentLevel = studentLevel.replace(/[./\\:*?"<>| ]/g, ''); // Remove dot from "Lv.1A" etc.

    const extension = blob.type.includes('wav') ? 'wav' : 'webm';
    const fileName = `${safeStudentId}_${safeStudentName}_${safeStudentLevel}_${timestamp}.${extension}`;
    console.log('Attempting upload with filename:', fileName);

    try {
        const { data, error } = await supabaseClient.storage
            .from('recordings')
            .upload(fileName, blob, {
                contentType: blob.type,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw error;
        }

        // 2. Get Public URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('recordings')
            .getPublicUrl(fileName);

        showStatus(`音声ファイルを保存しました。DBに記録中...`, 'success');

        // 3. Send to Google Sheets (GAS)
        // Format date as yyyy/mm/dd hh:mm:ss for Spreadsheet
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const dateStr = `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;

        await sendToGoogleSheets(studentId, studentName, dateStr, studentLevel, studentTrouble1, studentTrouble2, publicUrl);

        showStatus(`全ての保存が完了しました！: ${fileName}`, 'success');
        updateUIState('ready');
    } catch (err) {
        console.error('Upload failed:', err);
        let errorMsg = err.message || '不明なエラー';

        // Translate common Supabase errors for students
        if (errorMsg.includes('Invalid key')) {
            errorMsg = 'ファイル名に制限事項があります。管理者に連絡してください。';
        } else if (errorMsg.includes('Bucket not found')) {
            errorMsg = '保存先の設定（Bucket）が見つかりません。';
        }

        showStatus(`保存に失敗しました (${errorMsg})。通信環境を確認し、解決しない場合は管理者にエラー内容を伝えてください。`, 'error');
        updateUIState('ready');
    }
}

// GAS transmission logic
async function sendToGoogleSheets(studentId, studentName, dateStr, studentLevel, studentTrouble1, studentTrouble2, audioUrl) {
    const payload = {
        studentId: studentId,
        studentName: studentName,
        date: dateStr,
        studentLevel: studentLevel,
        studentTrouble1: studentTrouble1,
        studentTrouble2: studentTrouble2 || "",
        audioUrl: audioUrl
    };
    
    console.log('Sending to GAS:', payload);

    try {
        const response = await fetch(GAS_WEBAPP_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain",
            },
            body: JSON.stringify(payload)
        });
        console.log('GAS notification sent. Response status:', response.status);
    } catch (err) {
        console.error('Failed to notify Google Sheets:', err);
    }
}

// UI Helpers
function updateUIState(state) {
    recordBtn.classList.remove('recording', 'next', 'final');
    statusBadge.className = 'badge';
    previewSection.classList.add('hidden');
    taskSection.classList.add('hidden');
    studentIdInput.disabled = false;
    studentNameInput.disabled = false;
    studentLevelInput.disabled = false;
    if(studentLevelInput.value) {
        studentTroubleInput1.disabled = false;
        studentTroubleInput2.disabled = false;
    } else {
        studentTroubleInput1.disabled = true;
        studentTroubleInput2.disabled = true;
    }

    if (state === 'recording') {
        recordBtn.style.display = 'flex';
        recordBtn.classList.add('recording');
        taskSection.classList.remove('hidden');
        studentIdInput.disabled = true;
        studentNameInput.disabled = true;
        studentLevelInput.disabled = true;
        studentTroubleInput1.disabled = true;
        studentTroubleInput2.disabled = true;

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
        studentNameInput.disabled = true;
        studentLevelInput.disabled = true;
        studentTroubleInput1.disabled = true;
        studentTroubleInput2.disabled = true;
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
studentLevelInput.addEventListener('change', () => {
    const originalLevel = studentLevelInput.value;
    // スプレッドシート側のデータ（3, 4など）と合わせるための処理
    let levelData = troublesData[originalLevel];
    if (!levelData && originalLevel.length > 1) {
        levelData = troublesData[originalLevel.charAt(0)]; // '3A' -> '3' として探す
    }

    studentTroubleInput1.innerHTML = '<option value="" disabled selected>選択してください</option>';
    studentTroubleInput2.innerHTML = '<option value="" selected>なし（2つ目の悩みがある場合のみ選択）</option>';
    
    if (levelData && levelData.length > 0) {
        studentTroubleInput1.disabled = false;
        studentTroubleInput2.disabled = false;
        levelData.forEach(trouble => {
            const option1 = document.createElement('option');
            option1.value = trouble;
            option1.textContent = trouble;
            studentTroubleInput1.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = trouble;
            option2.textContent = trouble;
            studentTroubleInput2.appendChild(option2);
        });
    } else {
        studentTroubleInput1.innerHTML = '<option value="" disabled selected>このレベルの悩みデータがありません</option>';
        studentTroubleInput1.disabled = true;
        studentTroubleInput2.disabled = true;
    }
});

recordBtn.addEventListener('click', () => {
    if (isRecording) {
        nextPhrase();
    } else {
        startRecording();
    }
});

retryBtn.addEventListener('click', handleRetry);
uploadBtn.addEventListener('click', handleUpload);

// Prevent accidental closure
window.addEventListener('beforeunload', (e) => {
    if (isRecording || latestBlob) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Start
initUI();

// WAV Conversion Helpers
function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const result = new Int16Array(buffer.length * numOfChan);
    let offset = 0;
    const channels = [];
    for (let i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }
    
    while (offset < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            result[offset * numOfChan + i] = sample;
        }
        offset++;
    }
    
    const dataSize = result.length * 2;
    const bufferArray = new ArrayBuffer(44 + dataSize);
    const view = new DataView(bufferArray);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numOfChan * 2, true);
    view.setUint16(32, numOfChan * 2, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    const dataView = new Int16Array(bufferArray, 44);
    dataView.set(result);
    
    return new Blob([bufferArray], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
