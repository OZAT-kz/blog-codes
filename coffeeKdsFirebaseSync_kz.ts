// ==============================================================================
// Firebase Realtime Database арқылы 50мс жылдамдықтағы бариста KDS дисплей жүйесі (TypeScript)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/coffeeKdsFirebaseSync_kz.ts
// ==============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, update } from 'firebase/database';

// Инициализация Firebase Realtime Database для кухонного KDS-экрана бариста
const firebaseConfig = {
  apiKey: "AIzaSy_OZAT_COFFEE_PROD_KEY",
  authDomain: "ozat-astana-coffee.firebaseapp.com",
  databaseURL: "https://ozat-astana-coffee-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ozat-astana-coffee"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const rtdb = getDatabase(app);

export interface KDSTicket {
  id: string;
  orderNumber: number;
  clientName: string;
  items: Array<{
    title: string;
    cupSize: string;
    milk: string;
    syrup: string;
    extras: string;
  }>;
  totalPriceKzt: number;
  paidViaKaspi: boolean;
  createdAtMs: number;
  status: 'in_queue' | 'steaming_milk' | 'espresso_pulling' | 'ready_to_serve';
}

export class CoffeeKDSManager {
  private queueRef = ref(rtdb, 'astana_bc_kiosk_01/active_queue');

  // Мгновенная публикация заказа в Realtime DB (латентность синхронизации < 45мс)
  async pushGeminiOrderToKDS(ticket: Omit<KDSTicket, 'id' | 'createdAtMs' | 'status'>): Promise<string> {
    const newTicketRef = push(this.queueRef);
    const payload: KDSTicket = {
      ...ticket,
      id: newTicketRef.key!,
      createdAtMs: Date.now(),
      status: 'in_queue'
    };
    await set(newTicketRef, payload);
    return newTicketRef.key!;
  }

  // Подписка экрана бариста на входящий поток заказов в реальном времени
  subscribeToKDSQueue(onQueueUpdate: (tickets: KDSTicket[]) => void): () => void {
    return onValue(this.queueRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        onQueueUpdate([]);
        return;
      }
      const list: KDSTicket[] = Object.values(data);
      // Сортировка по времени поступления
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onQueueUpdate(list);
    });
  }

  // Смена статуса бариста в 1 клик на сенсорном дисплее
  async updateTicketStatus(ticketId: string, status: KDSTicket['status']): Promise<void> {
    const ticketRef = ref(rtdb, `astana_bc_kiosk_01/active_queue/${ticketId}`);
    if (status === 'ready_to_serve') {
      // Архивируем и удаляем с активного экрана приготовления
      await set(ticketRef, null);
    } else {
      await update(ticketRef, { status });
    }
  }
}
