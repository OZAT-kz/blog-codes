// ==============================================================================
// coffeeKdsFirebaseSync_ru.ts
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/coffeeKdsFirebaseSync_ru.ts
// ==============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, runTransaction, update } from 'firebase/database';

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
  items: Array<{
    name: string;
    size: string;
    milk: string;
    syrup?: string;
  }>;
  totalKzt: number;
  paidViaKaspi: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'canceled';
  createdAt: number;
}

export class CoffeeKDSManager {
  private queueRef = ref(rtdb, 'kiosks/astana_bc_01/queue');

  // Атомарная публикация тикета с инкрементом дневного номера заказа
  async pushTicket(order: Omit<KDSTicket, 'id' | 'orderNumber' | 'createdAt' | 'status'>): Promise<string> {
    const counterRef = ref(rtdb, 'kiosks/astana_bc_01/daily_counter');
    let generatedOrderNum = 1;

    await runTransaction(counterRef, (currentVal) => {
      generatedOrderNum = (currentVal || 0) + 1;
      return generatedOrderNum;
    });

    const newTicketRef = push(this.queueRef);
    const ticketPayload: KDSTicket = {
      ...order,
      id: newTicketRef.key!,
      orderNumber: generatedOrderNum,
      status: 'pending',
      createdAt: Date.now()
    };

    await set(newTicketRef, ticketPayload);
    return newTicketRef.key!;
  }

  // Реактивная подписка экрана KDS с сортировкой по FIFO
  subscribeQueue(onUpdate: (tickets: KDSTicket[]) => void): () => void {
    return onValue(this.queueRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        onUpdate([]);
        return;
      }
      const list: KDSTicket[] = Object.values(data);
      list.sort((a, b) => a.createdAt - b.createdAt);
      onUpdate(list);
    });
  }

  // Обновление этапа приготовления бариста
  async updateStatus(ticketId: string, status: KDSTicket['status']): Promise<void> {
    const itemRef = ref(rtdb, `kiosks/astana_bc_01/queue/${ticketId}`);
    if (status === 'completed') {
      // Перенос в суточный архив для предотвращения раздувания активного дерева
      const archiveRef = ref(rtdb, `kiosks/astana_bc_01/archive/${ticketId}`);
      const snapshot = await onValue(itemRef, (s) => s.val(), { onlyOnce: true });
      await set(archiveRef, { ...snapshot, completedAt: Date.now() });
      await set(itemRef, null);
    } else {
      await update(itemRef, { status });
    }
  }
}