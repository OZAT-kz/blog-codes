// ==============================================================================
// PWA Offline Workout Booking & Video Vault Service
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/pwa-workout-booking-checkout.ts
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, getDocs, addDoc } from 'firebase/firestore';

interface WorkoutSlot {
  id: string;
  coachName: string;
  startTime: string;
  maxCapacity: number;
  bookedCount: number;
  type: 'CrossFit' | 'Yoga' | 'Pilates';
}

export const WorkoutBookingPortal: React.FC<{ clientUid: string; clientName: string }> = ({ clientUid, clientName }) => {
  const [slots, setSlots] = useState<WorkoutSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookedSlotId, setBookedSlotId] = useState<string | null>(null);
  const db = getFirestore();

  useEffect(() => {
    async function loadSchedule() {
      const q = query(collection(db, 'workout_slots'), where('active', '==', true));
      const snap = await getDocs(q);
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSlot));
      setSlots(items);
      setLoading(false);
    }
    loadSchedule();
  }, [db]);

  const handleBooking = async (slot: WorkoutSlot) => {
    if (slot.bookedCount >= slot.maxCapacity) return;
    
    await addDoc(collection(db, 'bookings'), {
      slotId: slot.id,
      clientUid,
      clientName,
      workoutType: slot.type,
      bookedAt: new Date().toISOString(),
      status: 'confirmed'
    });

    setBookedSlotId(slot.id);
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800">
      <h2 className="text-xl font-bold mb-4 text-emerald-400">Жаттығулар кестесі (Офлайн-қолжетімді)</h2>
      {loading ? (
        <div className="text-slate-400 py-6 text-center">Кесте жүктелуде...</div>
      ) : (
        <div className="space-y-3">
          {slots.map(s => (
            <div key={s.id} className="p-4 bg-slate-800/80 rounded-xl flex items-center justify-between border border-slate-700">
              <div>
                <div className="font-semibold text-slate-100">{s.type} • {s.coachName}</div>
                <div className="text-xs text-slate-400">{s.startTime} | Орын: {s.bookedCount}/{s.maxCapacity}</div>
              </div>
              <button
                onClick={() => handleBooking(s)}
                disabled={bookedSlotId === s.id || s.bookedCount >= s.maxCapacity}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg transition"
              >
                {bookedSlotId === s.id ? 'Жазылдыңыз ✓' : 'Жазылу'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
