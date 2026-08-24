// ==============================================================================
// React Hook for Gemini 2.0 Flash Multimodal Live Audio & Kaspi QR Stream (TypeScript)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/useGeminiLiveCoffeeOrder_ru.tsx
// ==============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';

// Конфигурация WebSocket шлюза к Gemini 2.0 Flash Multimodal Live API (Cloud Run)
const GEMINI_LIVE_WS_URL = 'wss://gemini-live-gateway-prod-xyz.a.run.app/ws/coffee-kiosk';

interface CoffeeItem {
  name: string;
  size: 'small' | 'medium' | 'large';
  milkType: 'cow' | 'oat' | 'coconut' | 'almond';
  syrup?: string;
  sugar: number;
  price: number;
}

interface OrderState {
  orderId: string;
  items: CoffeeItem[];
  totalKzt: number;
  kaspiQrUrl?: string;
  status: 'listening' | 'confirming' | 'awaiting_payment' | 'sent_to_kds';
}

export function useGeminiLiveCoffeeOrder(onOrderFinalized: (order: OrderState) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [currentOrder, setCurrentOrder] = useState<OrderState | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startLiveOrdering = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket(GEMINI_LIVE_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsRecording(true);
        console.log('[Gemini Live] Bidirectional Audio Session Started');
        
        // Передаем системный промпт бариста-ассистента с поддержкой шала-казахского сленга
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            systemInstruction: {
              parts: [{
                text: "Ты ультра-быстрый AI-бариста в кофейне БЦ Астаны. Распознавай речь на лету (русский, казахский, шала-казахский). Как только гость назвал кофе и молоко, мгновенно сформируй JSON структуру заказа и вызови функцию finalize_coffee_ticket. Отвечай ультра-лаконично (не более 4-5 слов)."
              }]
            },
            generationConfig: { responseModalities: ["AUDIO", "TEXT"] }
          }
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.serverContent?.modelTurn?.parts) {
          for (const part of data.serverContent.modelTurn.parts) {
            if (part.text) setLiveTranscript(prev => prev + ' ' + part.text);
          }
        }
        if (data.toolCall?.functionCalls) {
          for (const call of data.toolCall.functionCalls) {
            if (call.name === 'finalize_coffee_ticket') {
              const orderData: OrderState = call.args;
              setCurrentOrder(orderData);
              onOrderFinalized(orderData);
            }
          }
        }
      };

      // Захват PCM 16kHz микрофонного потока и потоковая отправка чанков по 100мс
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('[Gemini Live] Mic Init Error:', err);
    }
  }, [onOrderFinalized]);

  const stopLiveOrdering = useCallback(() => {
    setIsRecording(false);
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    wsRef.current?.close();
  }, []);

  return { isRecording, startLiveOrdering, stopLiveOrdering, liveTranscript, currentOrder };
}
