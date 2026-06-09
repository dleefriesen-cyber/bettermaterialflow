(function () {
  'use strict';

  // ── Injected by server at request time ──
  var DEALER_ID = '__DEALER_ID__';
  var API_BASE = '__API_BASE__';

  // ── State ──
  var sessionId = null;
  var messages = [];
  var isOpen = false;
  var isTyping = false;

  // ── Styles ──
  var CSS = `
    #lml-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      width: 60px; height: 60px; border-radius: 50%;
      background: #c8102e; border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #lml-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    #lml-widget-btn svg { width: 28px; height: 28px; fill: white; }

    #lml-widget-panel {
      position: fixed; bottom: 96px; right: 24px; z-index: 99998;
      width: 360px; height: 520px; border-radius: 16px;
      background: #fff; box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transform: scale(0.9) translateY(20px); opacity: 0;
      transition: transform 0.25s ease, opacity 0.25s ease;
      pointer-events: none;
    }
    #lml-widget-panel.open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }

    #lml-header {
      background: #c8102e; color: white; padding: 16px 20px;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    #lml-header-logo {
      width: 36px; height: 36px; background: white; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #lml-header-logo svg { width: 22px; height: 22px; fill: #c8102e; }
    #lml-header-text h3 { margin: 0; font-size: 15px; font-weight: 700; }
    #lml-header-text p { margin: 2px 0 0; font-size: 12px; opacity: 0.85; }
    #lml-close-btn {
      margin-left: auto; background: none; border: none; color: white;
      cursor: pointer; font-size: 22px; line-height: 1; padding: 0 4px;
      opacity: 0.8; transition: opacity 0.15s;
    }
    #lml-close-btn:hover { opacity: 1; }

    #lml-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px; scroll-behavior: smooth;
    }
    #lml-messages::-webkit-scrollbar { width: 4px; }
    #lml-messages::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }

    .lml-msg {
      max-width: 82%; padding: 10px 14px; border-radius: 14px;
      font-size: 14px; line-height: 1.5; word-wrap: break-word;
    }
    .lml-msg.bot {
      background: #f3f4f6; color: #111; border-bottom-left-radius: 4px; align-self: flex-start;
    }
    .lml-msg.user {
      background: #c8102e; color: white; border-bottom-right-radius: 4px; align-self: flex-end;
    }
    .lml-msg strong { font-weight: 700; }

    .lml-typing {
      display: flex; gap: 5px; padding: 12px 14px;
      background: #f3f4f6; border-radius: 14px; border-bottom-left-radius: 4px;
      width: fit-content; align-self: flex-start;
    }
    .lml-typing span {
      width: 7px; height: 7px; background: #aaa; border-radius: 50%;
      animation: lml-bounce 1.2s infinite;
    }
    .lml-typing span:nth-child(2) { animation-delay: 0.2s; }
    .lml-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes lml-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    #lml-input-area {
      padding: 12px 16px; border-top: 1px solid #eee;
      display: flex; gap: 8px; flex-shrink: 0; background: white;
    }
    #lml-input {
      flex: 1; border: 1.5px solid #e0e0e0; border-radius: 22px;
      padding: 9px 16px; font-size: 14px; outline: none;
      font-family: inherit; resize: none; max-height: 80px;
      transition: border-color 0.15s;
    }
    #lml-input:focus { border-color: #c8102e; }
    #lml-send-btn {
      width: 40px; height: 40px; border-radius: 50%; background: #c8102e;
      border: none; cursor: pointer; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; transition: background 0.15s;
    }
    #lml-send-btn:hover { background: #a50d26; }
    #lml-send-btn:disabled { background: #ccc; cursor: default; }
    #lml-send-btn svg { width: 18px; height: 18px; fill: white; }

    .lml-feedback {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 14px 10px; align-self: flex-start;
    }
    .lml-feedback span { font-size: 12px; color: #888; }
    .lml-feedback-btn {
      background: none; border: 1.5px solid #e0e0e0; border-radius: 20px;
      padding: 4px 12px; font-size: 16px; cursor: pointer;
      transition: all 0.15s; line-height: 1.4;
    }
    .lml-feedback-btn:hover { background: #f5f5f5; border-color: #ccc; transform: scale(1.1); }
    .lml-feedback-btn.selected-up { background: #d1fae5; border-color: #6ee7b7; }
    .lml-feedback-btn.selected-down { background: #fee2e2; border-color: #fca5a5; }
    .lml-feedback-thanks { font-size: 12px; color: #888; padding: 4px 14px 10px; align-self: flex-start; }

    #lml-footer {
      text-align: center; padding: 6px; font-size: 10px; color: #bbb;
      border-top: 1px solid #f5f5f5; background: white;
    }
    #lml-footer a { color: #bbb; text-decoration: none; }

    @media (max-width: 400px) {
      #lml-widget-panel { width: calc(100vw - 24px); right: 12px; bottom: 84px; }
    }
  `;

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildHTML() {
    // Floating button
    var btn = document.createElement('button');
    btn.id = 'lml-widget-btn';
    btn.setAttribute('aria-label', 'Open Lamello Connector Selector');
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>`;
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    // Chat panel
    var panel = document.createElement('div');
    panel.id = 'lml-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Lamello Connector Selector');
    panel.innerHTML = `
      <div id="lml-header">
        <div id="lml-header-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
        </div>
        <div id="lml-header-text">
          <h3>Connector Selector</h3>
          <p>Powered by Lamello</p>
        </div>
        <button id="lml-close-btn" aria-label="Close">&times;</button>
      </div>
      <div id="lml-messages"></div>
      <div id="lml-input-area">
        <textarea id="lml-input" placeholder="Describe your project..." rows="1"></textarea>
        <button id="lml-send-btn" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div id="lml-footer">Powered by <a href="https://lamello.com" target="_blank">Lamello</a></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('lml-close-btn').addEventListener('click', closePanel);
    document.getElementById('lml-send-btn').addEventListener('click', sendMessage);
    document.getElementById('lml-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    // Auto-resize textarea
    document.getElementById('lml-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });
  }

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    isOpen = true;
    document.getElementById('lml-widget-panel').classList.add('open');
    document.getElementById('lml-input').focus();

    // Start conversation if first open
    if (messages.length === 0) {
      startConversation();
    }
  }

  function closePanel() {
    isOpen = false;
    document.getElementById('lml-widget-panel').classList.remove('open');
  }

  function addMessage(role, text, showFeedback, connectorName) {
    var msgBox = document.getElementById('lml-messages');
    var div = document.createElement('div');
    div.className = 'lml-msg ' + role;
    // Convert **bold** markdown to <strong>
    div.innerHTML = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    msgBox.appendChild(div);

    // Show feedback buttons after bot recommendations
    if (role === 'bot' && showFeedback && connectorName) {
      var fb = document.createElement('div');
      fb.className = 'lml-feedback';
      fb.innerHTML = `
        <span>Helpful?</span>
        <button class="lml-feedback-btn" data-rating="1" title="Yes, helpful">👍</button>
        <button class="lml-feedback-btn" data-rating="-1" title="Not helpful">👎</button>
      `;
      msgBox.appendChild(fb);

      fb.querySelectorAll('.lml-feedback-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var rating = parseInt(btn.getAttribute('data-rating'));
          submitFeedback(rating, connectorName, fb);
        });
      });
    }

    msgBox.scrollTop = msgBox.scrollHeight;
    return div;
  }

  function submitFeedback(rating, connectorName, feedbackEl) {
    // Update UI immediately
    feedbackEl.querySelectorAll('.lml-feedback-btn').forEach(function(b) {
      b.disabled = true;
      b.classList.remove('selected-up', 'selected-down');
    });
    var clicked = feedbackEl.querySelector('[data-rating="' + rating + '"]');
    if (clicked) clicked.classList.add(rating === 1 ? 'selected-up' : 'selected-down');

    // Replace with thanks message after a moment
    setTimeout(function() {
      var thanks = document.createElement('div');
      thanks.className = 'lml-feedback-thanks';
      thanks.textContent = rating === 1 ? '✅ Thanks for the feedback!' : '📝 Thanks — we\'ll use this to improve recommendations.';
      feedbackEl.replaceWith(thanks);
    }, 800);

    // Send to backend
    fetch(API_BASE + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        dealerId: DEALER_ID,
        connectorRecommended: connectorName,
        rating: rating,
        conversation: messages,
      }),
    }).catch(function() { /* silent fail — feedback is best-effort */ });
  }

  function showTyping() {
    var msgBox = document.getElementById('lml-messages');
    var div = document.createElement('div');
    div.className = 'lml-typing';
    div.id = 'lml-typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('lml-typing-indicator');
    if (el) el.remove();
  }

  function setInputDisabled(disabled) {
    document.getElementById('lml-input').disabled = disabled;
    document.getElementById('lml-send-btn').disabled = disabled;
  }

  async function callAPI(userMessages) {
    var response = await fetch(API_BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        dealerId: DEALER_ID,
        messages: userMessages,
        domain: window.location.hostname,
        userAgent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      throw new Error('API request failed: ' + response.status);
    }

    return response.json();
  }

  async function startConversation() {
    showTyping();
    setInputDisabled(true);

    try {
      var data = await callAPI([{
        role: 'user',
        content: 'Hello, I need help finding the right connector.',
      }]);

      sessionId = data.sessionId;
      messages.push({ role: 'user', content: 'Hello, I need help finding the right connector.' });
      messages.push({ role: 'assistant', content: data.message });

      hideTyping();
      addMessage('bot', data.message, false, null);
    } catch (e) {
      hideTyping();
      addMessage('bot', 'Sorry, I couldn\'t connect. Please try again in a moment.', false, null);
    }

    setInputDisabled(false);
    document.getElementById('lml-input').focus();
  }

  async function sendMessage() {
    var input = document.getElementById('lml-input');
    var text = input.value.trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    addMessage('user', text);

    messages.push({ role: 'user', content: text });

    isTyping = true;
    setInputDisabled(true);
    showTyping();

    try {
      var data = await callAPI(messages);
      sessionId = data.sessionId;
      messages.push({ role: 'assistant', content: data.message });

      // Detect recommendation to show feedback buttons
      var recMatch = data.message.match(/\*\*(Clamex[^*]+|Cabineo[^*]+|Zeta[^*]+|Simplex[^*]+)\*\*/i);
      var connectorName = recMatch ? recMatch[1].trim() : null;

      hideTyping();
      addMessage('bot', data.message, !!connectorName, connectorName);
    } catch (e) {
      hideTyping();
      addMessage('bot', 'Sorry, something went wrong. Please try again.', false, null);
      messages.pop(); // remove the user message that failed
    }

    isTyping = false;
    setInputDisabled(false);
    document.getElementById('lml-input').focus();
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    injectStyles();
    buildHTML();
  }

})();
