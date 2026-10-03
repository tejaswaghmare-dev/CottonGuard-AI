import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { chatApi } from '../services/api';

function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SR ? new SR() : null;
}

export default function Chatbot({ farmId, context, embedded = false }) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const speak = useCallback(
    (text) => {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'mr' ? 'mr-IN' : 'en-IN';
      window.speechSynthesis.speak(u);
    },
    [lang]
  );

  const stopSpeak = () => window.speechSynthesis?.cancel();

  async function sendText(text) {
    const content = (text || '').trim();
    if (!content) return;
    setMessages((m) => [...m, { role: 'user', content }]);
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
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  function startListening() {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      alert('Speech recognition is not supported in this browser. Please type your question.');
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
    recognition.start();
  }

  const panel = (
    <div className={embedded ? 'card' : 'chat-panel'} style={embedded ? { height: 480, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' } : undefined}>
      <div className="chat-header">
        <strong>{t.chatbotHeader}</strong>
        {!embedded && (
          <button type="button" className="ghost-btn" style={{ color: 'white' }} onClick={() => setOpen(false)}>✕</button>
        )}
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            {lang === 'mr' ? 'कापूस पिकाबद्दल विचारा — मराठी किंवा इंग्रजीत.' : 'Ask about your cotton crop in English or Marathi.'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
            {m.content}
            {m.role === 'assistant' && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <button type="button" className="icon-btn" title={t.listen} onClick={() => speak(m.content)}>🔊</button>
                <button type="button" className="icon-btn" title={t.stop} onClick={stopSpeak}>⏹</button>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="bubble ai muted">{t.loading}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.chatbotPlaceholder}
          onKeyDown={(e) => e.key === 'Enter' && sendText(input)}
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
        <button type="button" className="btn" onClick={() => sendText(input)} disabled={loading}>
          📤
        </button>
      </div>
      {listening && <div className="alert alert-info" style={{ margin: 0, borderRadius: 0 }}>{t.listening}</div>}
    </div>
  );

  if (embedded) return panel;

  return (
    <>
      {open && panel}
      <button type="button" className="chat-fab" onClick={() => setOpen((o) => !o)}>
        💬 {t.aiAssistant}
      </button>
    </>
  );
}
