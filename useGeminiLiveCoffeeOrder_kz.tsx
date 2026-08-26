// ==============================================================================
// useGeminiLiveCoffeeOrder_kz.tsx
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/useGeminiLiveCoffeeOrder_kz.tsx
// ==============================================================================

import { useState, useRef, useCallback } from 'react';

const GATEWAY_WS_URL = 'wss://gemini-live-gateway.ozat.kz/v1/kiosk-session';

export interface OrderItem {
  sku: string;
  name: string;
  size: 'regular' | 'large';
  milk: 'standard' | 'oat' | 'coconut' | 'lactose_free';
  syrup?: string;
  temperature: 'hot' | 'iced';
  priceKzt: number;
}

export interface KioskOrder {
  orderId: string;
  items: OrderItem[];
  totalKzt: number;
  paymentPayloadKaspi: string;
  status: 'draft' | 'validated' | 'paid' | 'pushed_to_kds';
}

export function useGeminiLiveKiosk(onOrderReady: (order: KioskOrder) => Promise<void>) {
  const [sessionActive, setSessionActive] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<KioskOrder | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startSession = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket(GATEWAY_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setSessionActive(true);
        ws.send(JSON.stringify({
          type: 'session.setup',
          model: 'models/gemini-2.5-flash',
          generationConfig: {
            temperature: 0.1,
            responseModalities: ['AUDIO', 'TEXT']
          },
          systemInstruction: {
            parts: [{
              text: "Сен ОЗАТ Coffee Bar AI-көмекшісісің. Тез әрі нақты жұмыс істе. Қазақша, орысша немесе аралас сөйлегенді табиғи түсін. Клиент кофе түрі мен сүтін айтқан бойда validate_and_emit_ticket құралын шақыр."
            }]
          },
          tools: [{
            functionDeclarations: [{
              name: 'validate_and_emit_ticket',
              description: 'Қоймадағы қалдық бойынша тапсырыс құрамын тексереді және финализациялайды',
              parameters: {
                type: 'OBJECT',
                properties: {
                  items: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        sku: { type: 'STRING' },
                        name: { type: 'STRING' },
                        size: { type: 'STRING', enum: ['regular', 'large'] },
                        milk: { type: 'STRING', enum: ['standard', 'oat', 'coconut', 'lactose_free'] },
                        syrup: { type: 'STRING' },
                        temperature: { type: 'STRING', enum: ['hot', 'iced'] }
                      },
                      required: ['sku', 'name', 'size', 'milk']
                    }
                  }
                },
                required: ['items']
              }
            }]
          }]
        }));
      };

      ws.onmessage = async (evt) => {
        const msg = JSON.parse(evt.data);

        if (msg.toolCall?.functionCalls) {
          for (const call of msg.toolCall.functionCalls) {
            if (call.name === 'validate_and_emit_ticket') {
              const orderPayload: KioskOrder = {
                orderId: 'ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
                items: call.args.items,
                totalKzt: call.args.items.reduce((acc: number, item: any) => acc + (item.size === 'large' ? 1800 : 1400), 0),
                paymentPayloadKaspi: 'https://kaspi.kz/pay/OZAT_COFFEE?order_id=' + Date.now(),
                status: 'validated'
              };
              setCurrentOrder(orderPayload);
              await onOrderReady(orderPayload);

              ws.send(JSON.stringify({
                type: 'tool_response',
                toolResponses: [{
                  response: { output: { success: true, orderId: orderPayload.orderId } },
                  id: call.id
                }]
              }));
            }
          }
        }
      };

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      await audioCtx.audioWorklet.addModule('/audio-stream-processor.js');
      const workletNode = new AudioWorkletNode(audioCtx, 'audio-stream-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e) => {
        if (ws.readyState === WebSocket.OPEN && e.data.pcm16Chunk) {
          ws.send(e.data.pcm16Chunk);
        }
      };

      source.connect(workletNode);
    } catch (err) {
      console.error('[Gemini Live Gateway] Init error:', err);
      setSessionActive(false);
    }
  }, [onOrderReady]);

  const stopSession = useCallback(() => {
    setSessionActive(false);
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    workletNodeRef.current?.disconnect();
    audioCtxRef.current?.close();
    wsRef.current?.close();
  }, []);

  return { sessionActive, startSession, stopSession, currentOrder };
}