// app.js (UPDATED transcript labeling & UI)
// - Improved addTranscriptMessage to correctly label user and ai
// - Persists messages with correct type
// - Renders messages with avatars, sender label, timestamp
// - Footer / history UI improved (CSS handles style)

(function () {
    // DOM references
    const callStatus = document.getElementById('call-status');
    const statusIndicator = document.getElementById('status-indicator');
    const timerElement = document.getElementById('timer');
    const transcriptContainer = document.getElementById('transcript-container');
    const noTranscript = document.getElementById('no-transcript');
    const callHistory = document.getElementById('call-history');
    const noHistory = document.getElementById('no-history');
    const clearHistoryBtn = document.getElementById('clear-history');

    // state
    let callActive = false;
    let callStartTime = null;
    let timerInterval = null;
    let currentConversation = [];
    let callHistoryData = JSON.parse(localStorage.getItem('mediVoiceCallHistory')) || [];

    // init
    function init() {
        renderCallHistory();
        attachUIHandlers();
    }

    function attachUIHandlers() {
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (confirm('Clear all call history?')) {
                    callHistoryData = [];
                    localStorage.setItem('mediVoiceCallHistory', JSON.stringify(callHistoryData));
                    renderCallHistory();
                }
            });
        }
    }

    function callStarted() {
        callActive = true;
        callStartTime = new Date();
        updateCallStatus('Call in progress...', 'calling');
        startTimer();
        clearTranscript();
        // system message
        addTranscriptMessage('System', 'Call started with MediVoice AI Assistant', 'system');
    }

    function callEnded() {
        callActive = false;
        updateCallStatus('Call ended', 'offline');
        stopTimer();
        addTranscriptMessage('System', 'Call ended', 'system');
        saveCurrentConversation();
    }

    function updateCallStatus(text, state) {
        callStatus.textContent = text;
        statusIndicator.className = 'status-indicator';
        if (state === 'online') statusIndicator.classList.add('status-online');
        else if (state === 'calling') statusIndicator.classList.add('status-calling');
        else statusIndicator.classList.add('status-offline');
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (!callStartTime) return;
            const diff = Math.floor((Date.now() - callStartTime.getTime()) / 1000);
            const mm = String(Math.floor(diff / 60)).padStart(2, '0');
            const ss = String(diff % 60).padStart(2, '0');
            timerElement.textContent = `${mm}:${ss}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        timerElement.textContent = '00:00';
    }

    function clearTranscript() {
        transcriptContainer.innerHTML = '';
        if (noTranscript) noTranscript.style.display = 'block';
        currentConversation = [];
    }

    // render message: improved two-way chat UI
    function renderMessage(message) {
        if (!message || !message.type) return;

        if (noTranscript && noTranscript.style.display !== 'none') noTranscript.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ' + (message.type === 'ai' ? 'ai-wrapper' : message.type === 'user' ? 'user-wrapper' : 'system-wrapper');

        const bubble = document.createElement('div');
        bubble.className = 'message ' + (message.type === 'ai' ? 'ai-message' : message.type === 'user' ? 'user-message' : 'system-message');

        // sender row (icon + label + timestamp)
        const senderRow = document.createElement('div');
        senderRow.className = 'message-sender';
        const icon = document.createElement('i');
        if (message.type === 'ai') icon.className = 'fas fa-robot';
        else if (message.type === 'user') icon.className = 'fas fa-user';
        else icon.className = 'fas fa-info-circle';
        const label = document.createElement('strong');
        label.textContent = message.type === 'ai' ? 'AI Assistant' : (message.type === 'user' ? (message.sender === 'You' ? 'You' : message.sender) : message.sender || 'System');

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = ' • ' + (message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString());

        senderRow.appendChild(icon);
        senderRow.appendChild(label);
        senderRow.appendChild(timeSpan);

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = message.text;

        bubble.appendChild(senderRow);
        bubble.appendChild(textDiv);
        wrapper.appendChild(bubble);

        transcriptContainer.appendChild(wrapper);
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }

    // central message API used by vapi-integration
    window.addTranscriptMessage = function (senderOrLabel, messageText, role) {
        // role expected 'user'|'ai'|'system'
        let type = 'ai';
        let sender = senderOrLabel || '';

        if (typeof role === 'string') {
            const r = role.toLowerCase();
            if (r === 'user') type = 'user';
            else if (r === 'ai' || r === 'assistant') type = 'ai';
            else if (r === 'system') type = 'system';
        } else {
            // fallback heuristics: if sender contains 'you' or 'user' label then user
            const s = String(senderOrLabel || '').toLowerCase();
            if (s.includes('you') || s.includes('user') || s.includes('patient')) type = 'user';
            else type = 'ai';
        }

        // Normalize sender label
        if (type === 'user') sender = (sender === 'You' || sender === '') ? 'You' : sender;
        if (type === 'ai') sender = 'AI Assistant';
        if (type === 'system') sender = senderOrLabel || 'System';

        const msg = {
            sender: sender,
            text: String(messageText || ''),
            type: type,
            timestamp: new Date().toISOString()
        };

        currentConversation.push(msg);
        renderMessage(msg);
    };

    // Save conversation to history
    function saveCurrentConversation() {
        if (!currentConversation || currentConversation.length === 0) return;
        const callObj = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            duration: timerElement.textContent || '00:00',
            conversation: currentConversation.slice()
        };
        callHistoryData.unshift(callObj);
        if (callHistoryData.length > 50) callHistoryData.length = 50;
        localStorage.setItem('mediVoiceCallHistory', JSON.stringify(callHistoryData));
        renderCallHistory();
    }

    // Render call history (footer)
    function renderCallHistory() {
        if (!callHistory) return;
        callHistory.innerHTML = '';

        if (!callHistoryData || callHistoryData.length === 0) {
            if (noHistory) noHistory.style.display = 'block';
            return;
        }
        if (noHistory) noHistory.style.display = 'none';

        callHistoryData.forEach(call => {
            const item = document.createElement('div');
            item.className = 'call-item';

            const info = document.createElement('div');
            info.className = 'call-info';
            const title = document.createElement('h4');
            title.textContent = `Call - ${call.date}`;
            const details = document.createElement('p');
            details.textContent = `Duration: ${call.duration} • Messages: ${call.conversation.filter(m => m.type !== 'system').length}`;
            info.appendChild(title);
            info.appendChild(details);

            const actions = document.createElement('div');
            actions.className = 'call-actions';

            // View full chat (redirect to chat.html)
            const viewBtn = document.createElement('button');
            viewBtn.className = 'action-btn';
            viewBtn.title = 'Open Conversation';
            viewBtn.innerHTML = '<i class="fas fa-comments"></i>';
            viewBtn.addEventListener('click', () => {
                window.location.href = `chat.html?callId=${encodeURIComponent(call.id)}`;
            });

            // Preview (load into transcript area)
            const previewBtn = document.createElement('button');
            previewBtn.className = 'action-btn';
            previewBtn.title = 'Preview';
            previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            previewBtn.addEventListener('click', () => {
                // load into main transcript area
                clearTranscript();
                call.conversation.forEach(m => {
                    // Render using existing render flow
                    const converted = { sender: m.sender, text: m.text, type: m.type, timestamp: m.timestamp };
                    currentConversation.push(converted);
                    renderMessage(converted);
                });
            });

            // Delete
            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn';
            delBtn.title = 'Delete';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.addEventListener('click', () => {
                if (!confirm('Delete this call?')) return;
                callHistoryData = callHistoryData.filter(c => c.id !== call.id);
                localStorage.setItem('mediVoiceCallHistory', JSON.stringify(callHistoryData));
                renderCallHistory();
            });

            actions.appendChild(viewBtn);
            actions.appendChild(previewBtn);
            actions.appendChild(delBtn);

            item.appendChild(info);
            item.appendChild(actions);
            callHistory.appendChild(item);
        });
    }

    // Expose callStarted / callEnded for vapi-integration
    window.callStarted = callStarted;
    window.callEnded = callEnded;
    window.updateCallStatus = updateCallStatus;

    // init on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
