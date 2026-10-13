
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { chatApi } from '../services/api';

const AVATAR_SIZE = 140;
const PANEL_WIDTH = 370;
const PANEL_HEIGHT = 550;
const EDGE = 12;
const MOVE_INTERVAL = 10000;

function getInitialPosition() {
  if (typeof window === 'undefined') {
    return { x: 300, y: 300 };
  }

  return {
    x: Math.max(EDGE, window.innerWidth - AVATAR_SIZE - 24),
    y: Math.max(EDGE, window.innerHeight - AVATAR_SIZE - 100),
  };
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SR ? new SR() : null;
}

export default function Chatbot({
  farmId,
  context,
  embedded = false,
}) {
  const { t, lang } = useLanguage();

  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [position, setPosition] = useState(getInitialPosition);

  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  // Voice support
  useEffect(() => {
    setSpeechSupported(
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }, []);

  // Stop all avatar movement while the chat is open.
  // Only ONE movement timer is used.
  useEffect(() => {
    if (embedded || open) return undefined;

    const moveAvatar = () => {
      const maxX = Math.max(
        EDGE,
        window.innerWidth - AVATAR_SIZE - EDGE
      );
      const maxY = Math.max(
        EDGE,
        window.innerHeight - AVATAR_SIZE - EDGE
      );

      setPosition({
        x: EDGE + Math.random() * Math.max(0, maxX - EDGE),
        y: EDGE + Math.random() * Math.max(0, maxY - EDGE),
      });
    };

    const timer = window.setInterval(moveAvatar, MOVE_INTERVAL);

    return () => window.clearInterval(timer);
  }, [open, embedded]);

  // Keep the avatar on-screen when the window is resized.
  useEffect(() => {
    function handleResize() {
      setPosition((current) => ({
        x: Math.max(
          EDGE,
          Math.min(current.x, window.innerWidth - AVATAR_SIZE - EDGE)
        ),
        y: Math.max(
          EDGE,
          Math.min(current.y, window.innerHeight - AVATAR_SIZE - EDGE)
        ),
      }));
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll to the latest chat message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Cancel speech recognition if the component is removed.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(
    (text) => {
      if (!window.speechSynthesis || !text) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'mr' ? 'mr-IN' : 'en-IN';

      window.speechSynthesis.speak(utterance);
    },
    [lang]
  );

  function stopSpeak() {
    window.speechSynthesis?.cancel();
  }

  async function sendText(text) {
    const content = (text || '').trim();

    if (!content || loading) return;

    setMessages((current) => [
      ...current,
      { role: 'user', content },
    ]);

    setInput('');
    setLoading(true);

    try {
      const data = await chatApi.send({
        sessionId,
        message: content,
        farmId,
        language: lang,
        context,
      });

      setSessionId(data.sessionId);

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: data.reply },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: error.message || 'Unable to connect. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    const recognition = getSpeechRecognition();

    if (!recognition) {
      alert(
        'Speech recognition is not supported in this browser. Please type your question.'
      );
      return;
    }

    recognitionRef.current = recognition;
    recognition.lang = lang === 'mr' ? 'mr-IN' : 'en-IN';
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      sendText(transcript);
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  const panel = (
    <div className={embedded ? 'card' : 'chat-panel chat-panel-floating'}>
      <div className="chat-header">
        <strong>{t.chatbotHeader}</strong>

        {!embedded && (
          <button
            type="button"
            className="ghost-btn"
            style={{ color: 'white' }}
            onClick={() => setOpen(false)}
            aria-label="Close chatbot"
          >
            ✕
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            {lang === 'mr'
              ? 'कापूस पिकाबद्दल विचारा — मराठी किंवा इंग्रजीत.'
              : 'Ask about your cotton crop in English or Marathi.'}
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`bubble ${message.role === 'user' ? 'user' : 'ai'}`}
          >
            {message.content}

            {message.role === 'assistant' && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="icon-btn"
                  title={t.listen}
                  onClick={() => speak(message.content)}
                >
                  🔊
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  title={t.stop}
                  onClick={stopSpeak}
                >
                  ⏹
                </button>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="bubble ai muted">{t.loading}</div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t.chatbotPlaceholder}
          onKeyDown={(event) => {
            if (event.key === 'Enter') sendText(input);
          }}
        />

        {speechSupported && (
          <button
            type="button"
            className={`icon-btn ${listening ? 'listening' : ''}`}
            title={t.speak}
            onClick={startListening}
          >
            🎙️
          </button>
        )}

        <button
          type="button"
          className="btn"
          onClick={() => sendText(input)}
          disabled={loading}
        >
          📤
        </button>
      </div>

      {listening && (
        <div
          className="alert alert-info"
          style={{ margin: 0, borderRadius: 0 }}
        >
          {t.listening}
        </div>
      )}
    </div>
  );

  if (embedded) return panel;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const panelWidth = Math.min(PANEL_WIDTH, viewportWidth - EDGE * 2);
  const panelHeight = Math.min(PANEL_HEIGHT, viewportHeight - EDGE * 2);

  const panelX = Math.max(
    EDGE,
    Math.min(
      position.x + AVATAR_SIZE / 2 - panelWidth / 2,
      viewportWidth - panelWidth - EDGE
    )
  );

  // Prefer above the avatar; otherwise show the panel below it.
  const panelY =
    position.y >= panelHeight + EDGE + 12
      ? position.y - panelHeight - 12
      : Math.max(
          EDGE,
          Math.min(
            position.y + AVATAR_SIZE + 12,
            viewportHeight - panelHeight - EDGE
          )
        );

  return (
    <>
      {open && (
        <div
          className="chat-panel-positioner"
          style={{
            left: panelX,
            top: panelY,
            width: panelWidth,
            height: panelHeight,
          }}
        >
          {panel}
        </div>
      )}

      <button
        type="button"
        className="chatbot-avatar-fab"
        style={{
          left: position.x,
          top: position.y,
        }}
        onClick={() => setOpen((current) => !current)}
        aria-label={
          open
            ? 'Close CottonGuard AI assistant'
            : 'Open CottonGuard AI assistant'
        }
        title="CottonGuard AI Assistant"
      >
        <img
          src="/chatbot.png"
          alt="CottonGuard AI Chatbot"
          className="chatbot-avatar-image"
          draggable="false"
        />
      </button>
    </>
  );
}
