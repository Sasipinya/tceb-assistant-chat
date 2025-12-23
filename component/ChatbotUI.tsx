'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Moon, Sun } from 'lucide-react';
import type React from 'react';
import { generateUUID } from '@/utils/uuid';
import parse from 'html-react-parser';

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: string;
  isStreaming?: boolean;
}

interface GreetingResponse {
  greeting: string;
  data?: string[];
}

// ดึง greeting จาก API
async function fetchGreetingFromAPI(): Promise<string> {
  const fallback =
    '📝 ระบบได้รับคำถามแล้ว กำลังเตรียมข้อความตอบกลับ...';

  try {
    const res = await fetch(
      'https://cms-tvai.terodigital.com/api/tceb-greeting',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      throw new Error('Failed to fetch greeting');
    }

    const json: GreetingResponse = await res.json();
    return json?.greeting || fallback;
  } catch (e) {
    console.error('fetchGreeting error:', e);
    return fallback;
  }
}

export default function ChatbotUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [conversationId, setConversationId] = useState('');
  const [chatStarted, setChatStarted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSentRef = useRef(false);

  //  Detect iOS
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  //  Safe scroll
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (messagesEndRef.current) {
      try {
        if ('scrollBehavior' in document.documentElement.style) {
          messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
        } else {
          messagesEndRef.current.scrollIntoView(false);
        }
      } catch {
        messagesEndRef.current.scrollIntoView();
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, scrollToBottom]);

  //  Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = '0';
    el.style.overflow = 'hidden';

    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, 44), 160);

    el.style.height = newHeight + 'px';
    el.style.overflow = scrollHeight > 160 ? 'auto' : 'hidden';
  }, [input]);

  const pushMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const updateMessage = useCallback(
    (id: string, patch: Partial<Message>) => {
      setMessages(prev =>
        prev.map(m => (m.id === id ? { ...m, ...patch } : m))
      );
    },
    []
  );

  const animateGreeting = useCallback(
    async (assistantId: string, greetingText: string) => {
      if (!greetingText) return;

      updateMessage(assistantId, {
        content: '',
        isStreaming: true,
      });

      await new Promise<void>(resolve => setTimeout(resolve, 2000));

      const words = greetingText.split(' ');
      let current = '';

      for (let i = 0; i < words.length; i++) {
        current += (current ? ' ' : '') + words[i];
        await new Promise<void>(resolve => setTimeout(resolve, 70));
        updateMessage(assistantId, {
          content: current,
          isStreaming: true,
        });
      }

      updateMessage(assistantId, {
        content: current + '\n\n',
        isStreaming: true,
      });
    },
    [updateMessage]
  );

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;
    setChatStarted(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMessage: Message = {
      id: `u_${generateUUID()}`,
      role: 'user',
      content: messageText,
    };

    const payload = {
      query: messageText,
      conversation_id: conversationId || undefined,
    };

    setIsLoading(true);

    const assistantId = `a_${generateUUID()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    pushMessage(userMessage);
    pushMessage(assistantMessage);

    const greetingText = await fetchGreetingFromAPI();
    await animateGreeting(assistantId, greetingText);

    const baseGreeting = greetingText ? greetingText + '\n\n' : '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`API request failed: ${res.status}`);

      const ctype = res.headers.get('content-type') || '';

      if (ctype.includes('text/event-stream')) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        let answerBuffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });

          const lines = acc.split('\n');
          acc = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();

            if (data === '[DONE]') {
              break;
            }

            try {
              const json = JSON.parse(data);

              if (json.conversation_id && !conversationId) {
                setConversationId(json.conversation_id);
              }

              if (typeof json.delta === 'string' && json.delta.length > 0) {
                answerBuffer += json.delta;
                updateMessage(assistantId, {
                  content: baseGreeting + answerBuffer,
                  isStreaming: true,
                });
              } else if (typeof json.answer === 'string') {
                answerBuffer = json.answer;
                updateMessage(assistantId, {
                  content: baseGreeting + answerBuffer,
                  isStreaming: true,
                });
              }
            } catch {
              answerBuffer += String(data);
              updateMessage(assistantId, {
                content: baseGreeting + answerBuffer,
                isStreaming: true,
              });
            }
          }
        }

        if (answerBuffer) {
          updateMessage(assistantId, {
            content: answerBuffer,
            isStreaming: false,
          });
        } else {
          updateMessage(assistantId, { isStreaming: false });
        }
      } else {
        const result = await res.json();
        const data = result?.success && result?.data ? result.data : result;

        if (data.conversation_id && !conversationId) {
          setConversationId(data.conversation_id);
        }

        const fullText =
          data.answer || 'ขออภัยครับ ไม่สามารถประมวลผลคำตอบได้';

        const words = fullText.split(' ');
        let answerCurrent = '';

        for (let i = 0; i < words.length; i++) {
          answerCurrent += (answerCurrent ? ' ' : '') + words[i];
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => resolve())
          );
          updateMessage(assistantId, {
            content: baseGreeting + answerCurrent,
            isStreaming: true,
          });
        }

        updateMessage(assistantId, {
          content: answerCurrent,
          isStreaming: false,
        });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        updateMessage(assistantId, {
          content: greetingText + '\n\nยกเลิกคำขอก่อนหน้าแล้ว',
          isStreaming: false,
        });
      } else {
        console.error(e);
        updateMessage(assistantId, {
          content:
            greetingText +
            '\n\nเกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
          isStreaming: false,
        });
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, conversationId, pushMessage, animateGreeting, updateMessage]);

  useEffect(() => {
    if (autoSentRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const messageParam = params.get('message');

    if (messageParam && messageParam.trim()) {
      autoSentRef.current = true;
      const decodedMessage = decodeURIComponent(messageParam);
      setInput(decodedMessage);

      setTimeout(() => {
        sendMessage(decodedMessage);
        setInput('');
      }, 500);
    }
  }, [sendMessage]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    //  iOS: blur to dismiss keyboard
    if (isIOS) {
      inputRef.current?.blur();
    }

    await sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  const bgColor =
    theme === 'light'
      ? 'bg-[url("/shutterstock_785054566.png")] bg-cover bg-center bg-white'
      : 'bg-gray-900';
  const textColor = theme === 'light' ? 'text-[#0e5a8b]' : 'text-gray-100';
  const secondaryBg = theme === 'light' ? 'bg-gray-50' : 'bg-gray-800';
  const borderColor =
    theme === 'light' ? 'border-gray-200' : 'border-gray-700';
  const inputBg = theme === 'light' ? 'bg-white' : 'bg-gray-800';
  const accentColor = '#0371c1';

  return (
    <div
      ref={containerRef}
      className={`ios-container ${bgColor} ${textColor} transition-colors duration-300`}
    >
      {/* Header */}
      <header
        className={`ios-header flex items-center justify-between px-4 py-2 pt-1 border-b ${borderColor}`}
      >
        <div className="flex items-center gap-2 text-2xl max-[399px]:text-[16px] font-bold">
          <p>SMART SEARCH </p>
          <span
            className={`absolute top-[28px] text-sm max-[399px]:text-[10px] ${
              theme === 'light' ? 'text-[#0e5a8b7a]' : 'text-[#ffffff]'
            }`}
          >
            How can I assist you today?
          </span>
        </div>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            theme === 'light' ? 'hover:bg-gray-50' : 'hover:bg-gray-800'
          }`}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </button>
      </header>

      {/* Main - Scrollable area */}
      <main
        className={`ios-main px-4 py-6 transition-all duration-700 ${
          chatStarted
            ? theme === 'light'
              ? 'bg-[#f9fafb]/80'
              : 'bg-gradient-to-b from-gray-900 to-gray-800'
            : 'bg-transparent'
        }`}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-[#0371c1] to-[#ffc300]">
              <Sparkles className="w-8 h-8 text-white animate-spin-slow" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">
              สวัสดีครับ มีอะไรให้ช่วยไหมครับ?
            </h2>
            <p
              className={
                theme === 'light' ? 'text-gray-600' : 'text-gray-400'
              }
            >
              เริ่มสนทนาได้เลยครับ
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-3 ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                } animate-fade-in`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 bg-gradient-to-br from-[#0371c1]/30 to-[#ffc300]/70">
                    <Sparkles className="w-4 h-4 text-white animate-spin-slow" />
                  </div>
                )}

                <div
                  className={`relative px-4 py-3 rounded-2xl max-w-2xl text-base ${
                    m.role === 'user' ? textColor : secondaryBg
                  }`}
                  style={
                    m.role === 'user'
                      ? {
                          background:
                            'linear-gradient(135deg, rgb(3 113 193 / 24%), rgb(255 195 0 / 60%))',
                        }
                      : {
                          background:
                            'linear-gradient(135deg, rgb(3 113 193 / 10%), rgb(3 113 193 / 14%))',
                        }
                  }
                >
                  <span
                    className={`pointer-events-none absolute ${
                      m.role === 'user'
                        ? 'bottom-3 right-[-8px] border-y-8 border-l-8 border-y-transparent border-l-[rgb(246_220_147)]'
                        : 'bottom-2 left-[-8px] border-y-8 border-r-8 border-y-transparent ' +
                          (theme === 'light'
                            ? 'border-r-gray-50'
                            : 'border-r-gray-800')
                    }`}
                    aria-hidden
                  />

                  <div className="break-words">
                    {m.role === 'assistant' ? (
                      <div className="text-chat-assistant">
                        {parse(m.content || '')}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}

                    {m.isStreaming && (
                      <span className="inline-flex items-center ml-1 align-baseline">
                        <i className="w-1 h-1 rounded-full bg-current animate-wave [animation-delay:0ms]" />
                        <i className="w-1 h-1 ml-1 rounded-full bg-current animate-wave [animation-delay:200ms]" />
                        <i className="w-1 h-1 ml-1 rounded-full bg-current animate-wave [animation-delay:400ms]" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Footer - Input area */}
      <footer
        className={`ios-footer border-t ${borderColor} p-4`}
        style={{
          backgroundColor: theme === 'light' ? '' : 'rgba(17,24,39,0.98)',
        }}
      >
        <div className="max-w-3xl mx-auto">
          <div
            className={`flex gap-2 items-end ${inputBg} rounded-2xl border ${borderColor} p-2 focus-within:ring-2 focus-within:ring-opacity-50 transition-all`}
            style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="พิมพ์ข้อความของคุณ..."
              rows={1}
              className={`flex-1 ${inputBg} ${textColor} resize-none outline-none px-2 py-2 max-h-40 placeholder-gray-400`}
              disabled={isLoading}
              style={{
                fontSize: '16px',
                WebkitAppearance: 'none',
                borderRadius: 0,
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={false}
              enterKeyHint="send"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 touch-manipulation"
              style={{
                background:
                  input.trim() && !isLoading
                    ? 'linear-gradient(135deg, rgb(3 113 193 / 24%), rgb(255 195 0 / 60%))'
                    : theme === 'light'
                    ? '#e5e7eb'
                    : '#374151',
              }}
              aria-label="Send"
            >
              <Send
                className={`w-5 h-5 ${
                  input.trim() && !isLoading
                    ? 'text-white'
                    : theme === 'light'
                    ? 'text-gray-400'
                    : 'text-gray-600'
                }`}
              />
            </button>
          </div>
          <p
            className={`text-xs max-[399px]:text-[10px] text-center mt-2 ${
              theme === 'light' ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            AI Chat อาจตอบผิดพลาดได้ โปรดใช้วิจารณญาณตรวจสอบก่อนนำไปใช้
          </p>
        </div>
      </footer>
    </div>
  );
}
